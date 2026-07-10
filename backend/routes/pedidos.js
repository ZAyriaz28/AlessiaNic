const express = require('express');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// --- Calcula las estadísticas de un pedido a partir de sus productos y ventas ---
const calcularEstadisticasPedido = async (pedidoId) => {
    const [productos] = await pool.query(
        `SELECT id, nombre, cantidad, costo_unitario_cordoba, costo_total_cordoba,
                precio_venta_cordoba, cantidad_vendida,
                (cantidad - cantidad_vendida) AS cantidad_disponible,
                (precio_venta_cordoba - costo_unitario_cordoba) AS ganancia_unidad,
                ROUND((precio_venta_cordoba - costo_unitario_cordoba) / precio_venta_cordoba * 100, 2) AS margen_porcentaje
         FROM productos_pedido WHERE pedido_id = ? ORDER BY id`,
        [pedidoId]
    );

    const [[ingresosRow]] = await pool.query(
        `SELECT COALESCE(SUM(v.cantidad * v.precio_venta_unitario_cordoba), 0) AS ingresos_generados,
                COALESCE(SUM(v.cantidad * pp.costo_unitario_cordoba), 0) AS costo_de_lo_vendido
         FROM ventas v
         JOIN productos_pedido pp ON pp.id = v.producto_pedido_id
         WHERE pp.pedido_id = ?`,
        [pedidoId]
    );

    const inversionInicialProductos = productos.reduce((sum, p) => sum + Number(p.costo_total_cordoba), 0);
    const gananciaProyectadaTotal = productos.reduce(
        (sum, p) => sum + Number(p.ganancia_unidad) * Number(p.cantidad), 0
    );
    const cantidadVendidaTotal = productos.reduce((sum, p) => sum + p.cantidad_vendida, 0);
    const cantidadDisponibleTotal = productos.reduce((sum, p) => sum + p.cantidad_disponible, 0);

    const ingresosGenerados = Number(ingresosRow.ingresos_generados);
    const costoDeLoVendido = Number(ingresosRow.costo_de_lo_vendido);
    const utilidadNeta = ingresosGenerados - costoDeLoVendido;

    return { productos, inversionInicialProductos, gananciaProyectadaTotal, cantidadVendidaTotal, cantidadDisponibleTotal, ingresosGenerados, utilidadNeta };
};

const construirResumenPedido = (pedido, stats, costoEnvio) => {
    const inversionInicial = stats.inversionInicialProductos + Number(costoEnvio);
    const porcentajeGanancia = inversionInicial > 0 ? +(stats.utilidadNeta / inversionInicial * 100).toFixed(2) : 0;

    return {
        ...pedido,
        inversion_inicial: +inversionInicial.toFixed(2),
        ganancia_proyectada_total: +stats.gananciaProyectadaTotal.toFixed(2),
        cantidad_vendida_total: stats.cantidadVendidaTotal,
        cantidad_disponible_total: stats.cantidadDisponibleTotal,
        ingresos_generados: +stats.ingresosGenerados.toFixed(2),
        utilidad_neta: +stats.utilidadNeta.toFixed(2),
        porcentaje_ganancia: porcentajeGanancia
    };
};

// GET /api/pedidos - lista todos los pedidos con su resumen financiero
router.get('/', async (req, res) => {
    try {
        const [pedidos] = await pool.query(
            `SELECT p.id, p.proveedor, p.fecha_pedido, p.costo_envio_cordoba, p.observaciones,
                    p.creado_en, u.nombre_usuario AS creado_por_usuario, t.tasa AS tasa_cambio
             FROM pedidos p
             JOIN usuarios u ON u.id = p.creado_por
             JOIN tasas_cambio t ON t.id = p.tasa_cambio_id
             ORDER BY p.id DESC`
        );

        const resumenes = await Promise.all(pedidos.map(async (p) => {
            const stats = await calcularEstadisticasPedido(p.id);
            const resumen = construirResumenPedido(p, stats, p.costo_envio_cordoba);
            delete resumen.productos_detalle;
            return { ...resumen, cantidad_productos: stats.productos.length };
        }));

        res.json(resumenes);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener los pedidos.' });
    }
});

// GET /api/pedidos/:id - detalle de un pedido con sus productos y estadísticas
router.get('/:id', async (req, res) => {
    try {
        const [[pedido]] = await pool.query(
            `SELECT p.id, p.proveedor, p.fecha_pedido, p.costo_envio_cordoba, p.observaciones,
                    p.creado_en, u.nombre_usuario AS creado_por_usuario, t.tasa AS tasa_cambio
             FROM pedidos p
             JOIN usuarios u ON u.id = p.creado_por
             JOIN tasas_cambio t ON t.id = p.tasa_cambio_id
             WHERE p.id = ?`,
            [req.params.id]
        );
        if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });

        const stats = await calcularEstadisticasPedido(pedido.id);
        const resumen = construirResumenPedido(pedido, stats, pedido.costo_envio_cordoba);
        resumen.productos = stats.productos;

        res.json(resumen);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener el pedido.' });
    }
});

// POST /api/pedidos - crea un pedido completo con todos sus productos en una transacción
router.post('/', async (req, res) => {
    const { proveedor, fecha_pedido, costo_envio_cordoba, observaciones, productos } = req.body;

    if (!fecha_pedido || !Array.isArray(productos) || productos.length === 0) {
        return res.status(400).json({ error: 'El pedido necesita fecha y al menos un producto.' });
    }
    for (const p of productos) {
        if (!p.nombre || !p.cantidad || p.costo_unitario_cordoba == null || p.precio_venta_cordoba == null) {
            return res.status(400).json({ error: `Faltan datos en el producto "${p.nombre || '(sin nombre)'}".` });
        }
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [tasaRows] = await conn.query(
            'SELECT id FROM tasas_cambio ORDER BY vigente_desde DESC, id DESC LIMIT 1'
        );
        if (tasaRows.length === 0) throw new Error('No hay tasa de cambio configurada.');
        const tasaId = tasaRows[0].id;

        const [pedidoResult] = await conn.query(
            `INSERT INTO pedidos (proveedor, fecha_pedido, costo_envio_cordoba, observaciones, tasa_cambio_id, creado_por)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [proveedor || 'Shein', fecha_pedido, costo_envio_cordoba || 0, observaciones || null, tasaId, req.usuario.id]
        );
        const pedidoId = pedidoResult.insertId;

        for (const p of productos) {
            await conn.query(
                `INSERT INTO productos_pedido (pedido_id, nombre, cantidad, costo_unitario_cordoba, precio_venta_cordoba)
                 VALUES (?, ?, ?, ?, ?)`,
                [pedidoId, p.nombre, p.cantidad, p.costo_unitario_cordoba, p.precio_venta_cordoba]
            );
        }

        await conn.commit();
        res.status(201).json({ id: pedidoId, mensaje: 'Pedido creado correctamente.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: err.message || 'Error al crear el pedido.' });
    } finally {
        conn.release();
    }
});

// DELETE /api/pedidos/:id - solo admin, elimina el pedido y sus productos (cascade)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM pedidos WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido no encontrado.' });
        res.json({ mensaje: 'Pedido eliminado correctamente.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al eliminar el pedido.' });
    }
});

// POST /api/pedidos/productos/:productoId/venta - registra una venta de unidades
router.post('/productos/:productoId/venta', async (req, res) => {
    const { cantidad, precio_venta_unitario_cordoba, cliente, fecha_venta } = req.body;
    const productoId = req.params.productoId;

    if (!cantidad || cantidad <= 0) {
        return res.status(400).json({ error: 'La cantidad vendida debe ser mayor a 0.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[producto]] = await conn.query(
            'SELECT id, cantidad, cantidad_vendida, precio_venta_cordoba FROM productos_pedido WHERE id = ? FOR UPDATE',
            [productoId]
        );
        if (!producto) throw new Error('Producto no encontrado.');

        const disponible = producto.cantidad - producto.cantidad_vendida;
        if (cantidad > disponible) {
            throw new Error(`Solo quedan ${disponible} unidades disponibles de este producto.`);
        }

        const precioVenta = precio_venta_unitario_cordoba != null ? precio_venta_unitario_cordoba : producto.precio_venta_cordoba;

        await conn.query(
            `INSERT INTO ventas (producto_pedido_id, cantidad, precio_venta_unitario_cordoba, cliente, vendido_por, fecha_venta)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [productoId, cantidad, precioVenta, cliente || null, req.usuario.id, fecha_venta || new Date().toISOString().slice(0, 10)]
        );

        await conn.query(
            'UPDATE productos_pedido SET cantidad_vendida = cantidad_vendida + ? WHERE id = ?',
            [cantidad, productoId]
        );

        await conn.commit();
        res.status(201).json({ mensaje: 'Venta registrada correctamente.' });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(400).json({ error: err.message || 'Error al registrar la venta.' });
    } finally {
        conn.release();
    }
});

// GET /api/pedidos/productos/:productoId/ventas - historial de ventas de un producto
router.get('/productos/:productoId/ventas', async (req, res) => {
    try {
        const [ventas] = await pool.query(
            `SELECT v.id, v.cantidad, v.precio_venta_unitario_cordoba, v.cliente, v.fecha_venta,
                    u.nombre_usuario AS vendido_por_usuario
             FROM ventas v
             JOIN usuarios u ON u.id = v.vendido_por
             WHERE v.producto_pedido_id = ?
             ORDER BY v.fecha_venta DESC, v.id DESC`,
            [req.params.productoId]
        );
        res.json(ventas);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener las ventas.' });
    }
});

module.exports = router;
