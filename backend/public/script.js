// ===============================================================
// XENON-WEB: LÓGICA DE NEGOCIO Y APLICACIÓN
// Modelo: Pedidos (Cargamentos) -> Productos -> Ventas
// ===============================================================

const API_BASE_URL = '/api';

const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUser';

// --- SESIÓN ---
const getToken = () => sessionStorage.getItem(TOKEN_KEY);
const getUsuario = () => JSON.parse(sessionStorage.getItem(USER_KEY) || 'null');
const isLoggedIn = () => !!getToken();
const isAdmin = () => getUsuario()?.rol === 'admin';

const guardarSesion = (token, usuario) => {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(usuario));
};

const cerrarSesion = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    window.location.href = 'login.html';
};

const PAGINAS_PROTEGIDAS = ['index.html', 'admin.html', ''];

const protegerPagina = () => {
    const pagina = window.location.pathname.split('/').pop();
    if (PAGINAS_PROTEGIDAS.includes(pagina) && !isLoggedIn()) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
};

const pintarUsuarioActivo = () => {
    const span = document.getElementById('usuarioActivo');
    const usuario = getUsuario();
    if (span && usuario) span.textContent = `${usuario.nombre_usuario} (${usuario.rol})`;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); cerrarSesion(); });
};

// --- HELPER: peticiones a la API ---
const apiFetch = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
        cerrarSesion();
        throw new Error('Tu sesión expiró, inicia sesión de nuevo.');
    }
    if (!res.ok) {
        throw new Error(data.error || 'Error de conexión con el servidor.');
    }
    return data;
};

const money = (n) => `C$ ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// --- LOGIN ---
const initializeLoginPage = () => {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    if (isLoggedIn()) {
        window.location.href = 'index.html';
        return;
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorDiv = document.getElementById('loginError');
        errorDiv.style.display = 'none';

        const nombre_usuario = document.getElementById('loginUsuario').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const data = await apiFetch('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ nombre_usuario, password })
            });
            guardarSesion(data.token, data.usuario);
            window.location.href = 'index.html';
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.style.display = 'block';
        }
    });
};

// ===============================================================
// PÁGINA: index.html - Crear Pedido/Cargamento con varios productos
// ===============================================================
const crearFilaProducto = () => {
    const template = document.getElementById('productoRowTemplate');
    const container = document.getElementById('productosContainer');
    const clone = template.content.cloneNode(true);
    const row = clone.querySelector('.producto-row');

    const actualizarSubtotal = () => {
        const cantidad = parseFloat(row.querySelector('.prod-cantidad').value) || 0;
        const costo = parseFloat(row.querySelector('.prod-costo').value) || 0;
        row.querySelector('.prod-subtotal').textContent = money(cantidad * costo);
        actualizarTotalPedido();
    };

    row.querySelectorAll('.prod-cantidad, .prod-costo').forEach(input => input.addEventListener('input', actualizarSubtotal));
    row.querySelector('.eliminar-producto-btn').addEventListener('click', () => {
        row.remove();
        actualizarTotalPedido();
    });

    container.appendChild(clone);
};

const actualizarTotalPedido = () => {
    const filas = document.querySelectorAll('.producto-row');
    let total = 0;
    filas.forEach(row => {
        const cantidad = parseFloat(row.querySelector('.prod-cantidad').value) || 0;
        const costo = parseFloat(row.querySelector('.prod-costo').value) || 0;
        total += cantidad * costo;
    });
    const envio = parseFloat(document.getElementById('costoEnvio')?.value) || 0;
    const totalEl = document.getElementById('totalPedido');
    if (totalEl) totalEl.textContent = money(total + envio);
};

const initializeIndexPage = () => {
    const pedidoForm = document.getElementById('pedidoForm');
    if (!pedidoForm) return;

    document.getElementById('fechaPedido').value = new Date().toISOString().slice(0, 10);
    crearFilaProducto();

    document.getElementById('agregarProductoBtn').addEventListener('click', crearFilaProducto);
    document.getElementById('costoEnvio').addEventListener('input', actualizarTotalPedido);

    pedidoForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const filas = document.querySelectorAll('.producto-row');
        if (filas.length === 0) {
            return Swal.fire('Falta información', 'Agrega al menos un producto al pedido.', 'warning');
        }

        const productos = Array.from(filas).map(row => ({
            nombre: row.querySelector('.prod-nombre').value,
            cantidad: parseInt(row.querySelector('.prod-cantidad').value),
            costo_unitario_cordoba: parseFloat(row.querySelector('.prod-costo').value),
            precio_venta_cordoba: parseFloat(row.querySelector('.prod-precio').value)
        }));

        const payload = {
            proveedor: document.getElementById('proveedor').value,
            fecha_pedido: document.getElementById('fechaPedido').value,
            costo_envio_cordoba: parseFloat(document.getElementById('costoEnvio').value) || 0,
            observaciones: document.getElementById('observaciones').value,
            productos
        };

        try {
            await apiFetch('/pedidos', { method: 'POST', body: JSON.stringify(payload) });
            Swal.fire('Guardado', 'Pedido registrado correctamente', 'success');
            pedidoForm.reset();
            document.getElementById('fechaPedido').value = new Date().toISOString().slice(0, 10);
            document.getElementById('productosContainer').innerHTML = '';
            crearFilaProducto();
            actualizarTotalPedido();
        } catch (err) {
            Swal.fire('Error', err.message, 'error');
        }
    });
};

// ===============================================================
// PÁGINA: admin.html - Pedidos, reportes y ventas
// ===============================================================
let ultimosPedidos = [];

const pintarPedidoCard = (pedido) => {
    const template = document.getElementById('pedidoCardTemplate');
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector('.pedido-card');

    card.dataset.pedidoId = pedido.id;
    card.querySelector('.pedido-numero').textContent = `#${String(pedido.id).padStart(3, '0')}`;
    card.querySelector('.pedido-proveedor').textContent = pedido.proveedor;
    card.querySelector('.pedido-fecha').textContent =
        `${new Date(pedido.fecha_pedido).toLocaleDateString('es-NI')} · ${pedido.cantidad_productos} producto(s) · agregado por ${pedido.creado_por_usuario}`;

    const utilidadEl = card.querySelector('.pedido-utilidad');
    utilidadEl.textContent = money(pedido.utilidad_neta);
    utilidadEl.classList.add(pedido.utilidad_neta >= 0 ? 'text-success' : 'text-danger');

    card.querySelector('.pedido-porcentaje').textContent = `(${pedido.porcentaje_ganancia}%)`;
    card.querySelector('.pedido-inversion').textContent = money(pedido.inversion_inicial);
    card.querySelector('.pedido-ingresos').textContent = money(pedido.ingresos_generados);
    card.querySelector('.pedido-vendidos').textContent = pedido.cantidad_vendida_total;
    card.querySelector('.pedido-disponibles').textContent = pedido.cantidad_disponible_total;

    const detalleDiv = card.querySelector('.pedido-detalle');
    card.querySelector('.pedido-header').addEventListener('click', async () => {
        const abierto = detalleDiv.style.display !== 'none';
        if (abierto) {
            detalleDiv.style.display = 'none';
            return;
        }
        detalleDiv.style.display = 'block';
        detalleDiv.innerHTML = '<p class="text-center text-muted small py-3">Cargando productos...</p>';
        await cargarDetallePedido(pedido.id, detalleDiv);
    });

    return card;
};

const cargarDetallePedido = async (pedidoId, detalleDiv) => {
    try {
        const detalle = await apiFetch(`/pedidos/${pedidoId}`);
        detalleDiv.innerHTML = '';

        if (detalle.observaciones) {
            const obs = document.createElement('p');
            obs.className = 'small text-muted fst-italic mb-3';
            obs.innerHTML = `<i class="bi bi-chat-left-text me-1"></i> ${detalle.observaciones}`;
            detalleDiv.appendChild(obs);
        }

        const template = document.getElementById('productoDetalleTemplate');
        detalle.productos.forEach(prod => {
            const clone = template.content.cloneNode(true);
            clone.querySelector('.prod-nombre').textContent = prod.nombre;
            clone.querySelector('.prod-costo').textContent = money(prod.costo_unitario_cordoba);
            clone.querySelector('.prod-precio').textContent = money(prod.precio_venta_cordoba);
            clone.querySelector('.prod-ganancia').textContent = money(prod.ganancia_unidad);
            clone.querySelector('.prod-margen').textContent = `${prod.margen_porcentaje}%`;
            clone.querySelector('.prod-vendidas').textContent = prod.cantidad_vendida;
            clone.querySelector('.prod-disponibles').textContent = prod.cantidad_disponible;

            const ventaBtn = clone.querySelector('.registrar-venta-btn');
            if (prod.cantidad_disponible <= 0) {
                ventaBtn.disabled = true;
                ventaBtn.textContent = 'Agotado';
            } else {
                ventaBtn.addEventListener('click', () => abrirModalVenta(prod, pedidoId, detalleDiv));
            }
            detalleDiv.appendChild(clone);
        });

        if (isAdmin()) {
            const borrarBtn = document.createElement('button');
            borrarBtn.className = 'btn btn-outline-danger btn-sm rounded-pill mt-2';
            borrarBtn.innerHTML = '<i class="bi bi-trash"></i> Eliminar Pedido Completo';
            borrarBtn.addEventListener('click', () => eliminarPedido(pedidoId));
            detalleDiv.appendChild(borrarBtn);
        }
    } catch (err) {
        detalleDiv.innerHTML = `<p class="text-danger small text-center">${err.message}</p>`;
    }
};

const abrirModalVenta = async (producto, pedidoId, detalleDiv) => {
    const { value: formValues } = await Swal.fire({
        title: `Vender: ${producto.nombre}`,
        html: `
            <input id="swal-cantidad" type="number" min="1" max="${producto.cantidad_disponible}" value="1" class="swal2-input" placeholder="Cantidad (disp: ${producto.cantidad_disponible})">
            <input id="swal-precio" type="number" step="0.01" value="${producto.precio_venta_cordoba}" class="swal2-input" placeholder="Precio de venta unitario (C$)">
            <input id="swal-cliente" type="text" class="swal2-input" placeholder="Cliente (opcional)">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Registrar Venta',
        cancelButtonText: 'Cancelar',
        preConfirm: () => [
            document.getElementById('swal-cantidad').value,
            document.getElementById('swal-precio').value,
            document.getElementById('swal-cliente').value
        ]
    });
    if (!formValues) return;

    const [cantidad, precio, cliente] = formValues;
    try {
        await apiFetch(`/pedidos/productos/${producto.id}/venta`, {
            method: 'POST',
            body: JSON.stringify({
                cantidad: parseInt(cantidad),
                precio_venta_unitario_cordoba: parseFloat(precio),
                cliente: cliente || null
            })
        });
        Swal.fire({ icon: 'success', title: 'Venta registrada', timer: 1400, showConfirmButton: false });
        await cargarDetallePedido(pedidoId, detalleDiv);
        cargarYRenderizarPedidos(); // refresca totales del card
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
};

const eliminarPedido = async (pedidoId) => {
    const result = await Swal.fire({
        title: '¿Eliminar este pedido?',
        text: 'Se borrarán también todos sus productos y ventas. Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar todo',
        cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    try {
        await apiFetch(`/pedidos/${pedidoId}`, { method: 'DELETE' });
        Swal.fire({ icon: 'success', title: 'Pedido eliminado', timer: 1400, showConfirmButton: false });
        cargarYRenderizarPedidos();
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
};

const cargarYRenderizarPedidos = async () => {
    const container = document.getElementById('pedidosContainer');
    if (!container) return;

    try {
        ultimosPedidos = await apiFetch('/pedidos');
        container.innerHTML = '';

        if (ultimosPedidos.length === 0) {
            container.innerHTML = '<p class="text-muted text-center p-4 bg-light rounded-4 small fw-medium">No hay pedidos registrados aún.</p>';
        } else {
            ultimosPedidos.forEach(pedido => container.appendChild(pintarPedidoCard(pedido)));
        }

        const downloadCard = document.getElementById('downloadCard');
        if (downloadCard) downloadCard.style.display = ultimosPedidos.length ? 'block' : 'none';
    } catch (err) {
        container.innerHTML = `<p class="text-danger text-center p-3">No se pudo conectar con el servidor: ${err.message}</p>`;
    }
};

const initializeNuevoUsuarioForm = () => {
    const container = document.getElementById('crearUsuarioContainer');
    if (!container) return;
    if (!isAdmin()) return;
    container.style.display = 'block';

    const form = document.getElementById('nuevoUsuarioForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            nombre_usuario: document.getElementById('nuevoUsuarioNombre').value,
            password: document.getElementById('nuevoUsuarioPassword').value,
            rol: document.getElementById('nuevoUsuarioRol').value
        };
        try {
            await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
            Swal.fire('Listo', `Usuario "${payload.nombre_usuario}" creado.`, 'success');
            form.reset();
        } catch (err) {
            Swal.fire('Error', err.message, 'error');
        }
    });
};

const handleDownloadExcel = () => {
    if (ultimosPedidos.length === 0) return alert('No hay datos.');
    const filas = ultimosPedidos.map(p => ({
        Pedido: `#${String(p.id).padStart(3, '0')}`,
        Proveedor: p.proveedor,
        Fecha: p.fecha_pedido,
        'Inversión Inicial': p.inversion_inicial,
        'Ingresos Generados': p.ingresos_generados,
        'Utilidad Neta': p.utilidad_neta,
        '% Ganancia': p.porcentaje_ganancia,
        Vendidos: p.cantidad_vendida_total,
        Disponibles: p.cantidad_disponible_total,
        'Agregado por': p.creado_por_usuario
    }));
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    XLSX.writeFile(wb, `Pedidos_AlessiaNic_${new Date().toISOString().slice(0,10)}.xlsx`);
};

const initializeAdminPage = () => {
    if (!document.getElementById('pedidosContainer')) return;
    const btn = document.getElementById('downloadExcelBtn');
    if (btn) btn.addEventListener('click', handleDownloadExcel);
    cargarYRenderizarPedidos();
    initializeNuevoUsuarioForm();
};

// --- INICIO ---
document.addEventListener('DOMContentLoaded', () => {
    initializeLoginPage();

    if (!protegerPagina()) return;

    pintarUsuarioActivo();
    initializeIndexPage();
    initializeAdminPage();
});

window.addEventListener('load', () => {
    const loader = document.getElementById('loader-wrapper');
    if (loader) {
        setTimeout(() => {
            loader.style.opacity = '0';
            loader.style.visibility = 'hidden';
        }, 1000);
    }
});