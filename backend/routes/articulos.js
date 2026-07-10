const express = require('express');
const pool = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// A partir de aquí, TODAS las rutas de este archivo requieren estar logueado
router.use(requireAuth);

// --- Misma fórmula que antes vivía en script.js, ahora en el servidor ---
// Calcular aquí (y no confiar en lo que mande el navegador) evita que
// alguien manipule las ganancias enviando números falsos desde el cliente.
const calcularValoresFinancieros = (costoSheinUSD, costoEnvioUSD, unidades, precioVentaC, tasa) => {
    const gastosTotalesUSD = costoSheinUSD + costoEnvioUSD;
    const costoUnidadUSD = unidades > 0 ? gastosTotalesUSD / unidades : 0;
    const costoUnidadC = costoUnidadUSD * tasa;
    const gananciaUnidadC = precioVentaC - costoUnidadC;
    const gananciaTotalC = gananciaUnidadC * unidades;

    return {
        gastosTotalesUSD: +gastosTotalesUSD.toFixed(2),
        costoUnidadUSD: +costoUnidadUSD.toFixed(4),
        costoUnidadC: +costoUnidadC.toFixed(2),
        gananciaUnidadC: +gananciaUnidadC.toFixed(2),
        gananciaTotalC: +gananciaTotalC.toFixed(2)
    };
};

// GET /api/articulos - lista todos (equivale a la tabla que ya se ve en index.html)
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT a.id, a.nombre, a.unidad_medida, a.costo_shein_usd, a.costo_envio_usd,
                    a.gastos_totales_usd, a.unidades, a.costo_unidad_usd, a.costo_unidad_cordoba,
                    a.precio_venta_cordoba, a.ganancia_unidad_cordoba, a.ganancia_total_cordoba,
                    t.tasa AS tasa_cambio, a.creado_en, u.nombre_usuario AS creado_por_usuario
             FROM articulos a
             JOIN tasas_cambio t ON t.id = a.tasa_cambio_id
             JOIN usuarios u ON u.id = a.creado_por
             ORDER BY a.id DESC`
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener artículos.' });
    }
});

// POST /api/articulos - crea un nuevo artículo (público, igual que el formulario actual)
router.post('/', async (req, res) => {
    const { nombre, unidad_medida, costo_shein_usd, costo_envio_usd, unidades, precio_venta_cordoba } = req.body;

    if (!nombre || costo_shein_usd == null || costo_envio_usd == null || !unidades || precio_venta_cordoba == null) {
        return res.status(400).json({ error: 'Faltan campos requeridos.' });
    }

    try {
        // Toma la tasa de cambio vigente más reciente
        const [tasaRows] = await pool.query(
            'SELECT id, tasa FROM tasas_cambio ORDER BY vigente_desde DESC, id DESC LIMIT 1'
        );
        if (tasaRows.length === 0) {
            return res.status(500).json({ error: 'No hay tasa de cambio configurada.' });
        }
        const { id: tasaId, tasa } = tasaRows[0];

        const calc = calcularValoresFinancieros(
            Number(costo_shein_usd), Number(costo_envio_usd), Number(unidades), Number(precio_venta_cordoba), Number(tasa)
        );

        const [result] = await pool.query(
            `INSERT INTO articulos
                (nombre, unidad_medida, costo_shein_usd, costo_envio_usd, gastos_totales_usd, unidades,
                 costo_unidad_usd, costo_unidad_cordoba, precio_venta_cordoba, ganancia_unidad_cordoba,
                 ganancia_total_cordoba, tasa_cambio_id, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                nombre, unidad_medida || 'Paquete', costo_shein_usd, costo_envio_usd, calc.gastosTotalesUSD, unidades,
                calc.costoUnidadUSD, calc.costoUnidadC, precio_venta_cordoba, calc.gananciaUnidadC,
                calc.gananciaTotalC, tasaId, req.usuario.id
            ]
        );

        res.status(201).json({ id: result.insertId, ...calc });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al guardar el artículo.' });
    }
});

// DELETE /api/articulos/:id - solo administradores (reemplaza el prompt de login en JS)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const [result] = await pool.query('DELETE FROM articulos WHERE id = ?', [req.params.id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Artículo no encontrado.' });
        }
        res.json({ mensaje: 'Artículo eliminado correctamente.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al eliminar el artículo.' });
    }
});

module.exports = router;
