// ===============================================================
// XENON-WEB: LÓGICA DE NEGOCIO Y APLICACIÓN
// Conectado a la API (MySQL) con sesión multiusuario (login)
// ===============================================================

// Ajusta esto si tu backend corre en otro puerto o dominio de Laragon
const API_BASE_URL = 'http://localhost:4000/api';

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

// Páginas que requieren estar logueado. login.html queda fuera de esta lista.
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

// --- HELPER: peticiones a la API con manejo de errores centralizado ---
const apiFetch = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
        // Sesión inválida o expirada: manda de vuelta al login
        cerrarSesion();
        throw new Error('Tu sesión expiró, inicia sesión de nuevo.');
    }
    if (!res.ok) {
        throw new Error(data.error || 'Error de conexión con el servidor.');
    }
    return data;
};

// --- FUNCIÓN DE CÁLCULO (solo vista previa; el servidor recalcula al guardar) ---
const calcularValoresFinancieros = (precioTotalUSD, costoEnvioUSD, cantUnidades, precioVentaC, tasa) => {
    const costoTotalLoteUSD = precioTotalUSD + costoEnvioUSD;
    const costoUnidadUSD = cantUnidades > 0 ? costoTotalLoteUSD / cantUnidades : 0;
    const costoUnidadC = costoUnidadUSD * tasa;
    const gananciaUnidadC = precioVentaC - costoUnidadC;
    const gananciaTotalC = gananciaUnidadC * cantUnidades;

    return {
        gastosTotalesUSD: parseFloat(costoTotalLoteUSD.toFixed(2)),
        costoUnidadC: parseFloat(costoUnidadC.toFixed(2)),
        gananciaUnidadC: parseFloat(gananciaUnidadC.toFixed(2)),
        gananciaTotalC: parseFloat(gananciaTotalC.toFixed(2))
    };
};

const TASA_REFERENCIA = 36.6243;

// --- LOGIN ---
const initializeLoginPage = () => {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    // Si ya hay sesión activa, no tiene sentido ver el login de nuevo
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

// --- ELIMINAR ARTÍCULO ---
const deleteOrder = async (id) => {
    const result = await Swal.fire({
        title: '¿Estás seguro?',
        html: `Vas a eliminar el artículo N° <b>${id}</b>.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, Eliminar',
        cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    try {
        await apiFetch(`/articulos/${id}`, { method: 'DELETE' });
        Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1500, showConfirmButton: false });
        cargarYRenderizarAdmin();
    } catch (err) {
        Swal.fire('Error', err.message, 'error');
    }
};
window.deleteOrder = deleteOrder;

// --- RENDERIZACIÓN DE LA TABLA ---
const renderTable = (data, containerId, isEditable = false) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-muted text-center p-4 bg-light rounded-4 small fw-medium mx-3">No hay datos registrados aún.</p>';
        return;
    }

    const displayHeaders = [
        { key: 'id', name: 'Nº' }, { key: 'nombre', name: 'Artículo' }, { key: 'unidad_medida', name: 'U/M' },
        { key: 'costo_shein_usd', name: 'Shein ($)', prefix: '$ ' }, { key: 'costo_envio_usd', name: 'Envío ($)', prefix: '$ ' },
        { key: 'gastos_totales_usd', name: 'Total ($)', prefix: '$ ' }, { key: 'unidades', name: 'Cant.' },
        { key: 'costo_unidad_cordoba', name: 'Costo (C$)', prefix: 'C$ ' }, { key: 'precio_venta_cordoba', name: 'Venta (C$)', prefix: 'C$ ' },
        { key: 'ganancia_total_cordoba', name: 'Ganancia (C$)', prefix: 'C$ ' },
        { key: 'creado_por_usuario', name: 'Agregado por' }
    ];

    let html = '<div class="table-responsive"><table class="table table-striped table-hover"><thead><tr>';
    displayHeaders.forEach(h => html += `<th>${h.name}</th>`);
    if (isEditable) html += '<th>Acción</th>';
    html += '</tr></thead><tbody>';

    data.forEach(order => {
        html += '<tr>';
        displayHeaders.forEach(h => {
            let val = order[h.key];
            if (typeof val === 'number' && h.prefix) val = h.prefix + val.toLocaleString();
            html += `<td>${val ?? '—'}</td>`;
        });
        if (isEditable) {
            const puedeBorrar = isAdmin();
            html += `<td>${puedeBorrar ? `<button class="btn btn-danger btn-sm" onclick="deleteOrder(${order.id})">Borrar</button>` : '—'}</td>`;
        }
        html += '</tr>';
    });
    container.innerHTML = html + '</tbody></table></div>';
};

// --- LÓGICA DE INDEX ---
const initializeIndexPage = () => {
    const orderForm = document.getElementById('orderForm');
    if (!orderForm) return;

    const inputs = ['precioVentaC', 'precioTotalUSD', 'costoEnvioUSD', 'cantUnidades'].map(id => document.getElementById(id));
    const feedbackDiv = document.getElementById('feedbackGanancia');

    const updateLiveFeedback = () => {
        const [pVentaC, pTotalUSD, cEnvioUSD, unidades] = inputs.map(i => parseFloat(i.value) || 0);
        if (pTotalUSD > 0 || cEnvioUSD > 0) {
            const calc = calcularValoresFinancieros(pTotalUSD, cEnvioUSD, unidades || 1, pVentaC, TASA_REFERENCIA);
            const color = calc.gananciaUnidadC > 0.01 ? '#10b981' : '#ef4444';
            feedbackDiv.style.color = color;
            feedbackDiv.innerHTML = `
                <b>Gastos Totales:</b> $ ${calc.gastosTotalesUSD.toFixed(2)}<br>
                <b>Costo Unitario:</b> C$ ${calc.costoUnidadC.toFixed(2)}<br>
                <b>Ganancia Unidad:</b> C$ ${calc.gananciaUnidadC.toFixed(2)} <small>(referencial)</small>
            `;
        }
    };

    inputs.forEach(input => input.addEventListener('input', updateLiveFeedback));

    orderForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            nombre: document.getElementById('articulo').value,
            unidad_medida: 'Paquete',
            costo_shein_usd: parseFloat(inputs[1].value),
            costo_envio_usd: parseFloat(inputs[2].value),
            unidades: parseInt(inputs[3].value),
            precio_venta_cordoba: parseFloat(inputs[0].value)
        };

        try {
            await apiFetch('/articulos', { method: 'POST', body: JSON.stringify(payload) });
            orderForm.reset();
            feedbackDiv.innerHTML = 'Ingresa los datos para ver la ganancia.';
            Swal.fire('Guardado', 'Artículo agregado correctamente', 'success');
            cargarYRenderizarIndex();
        } catch (err) {
            Swal.fire('Error', err.message, 'error');
        }
    });

    cargarYRenderizarIndex();
};

const cargarYRenderizarIndex = async () => {
    try {
        const data = await apiFetch('/articulos');
        renderTable(data, 'tableContainer', false);
    } catch (err) {
        document.getElementById('tableContainer').innerHTML =
            `<p class="text-danger text-center p-3">No se pudo conectar con el servidor: ${err.message}</p>`;
    }
};

// --- LÓGICA DE ADMIN ---
let ultimosDatosAdmin = [];

const cargarYRenderizarAdmin = async () => {
    try {
        ultimosDatosAdmin = await apiFetch('/articulos');
        renderTable(ultimosDatosAdmin, 'dynamicContent', true);
        const downloadCard = document.getElementById('downloadCard');
        if (downloadCard) downloadCard.style.display = ultimosDatosAdmin.length ? 'block' : 'none';
    } catch (err) {
        document.getElementById('dynamicContent').innerHTML =
            `<p class="text-danger text-center p-3">No se pudo conectar con el servidor: ${err.message}</p>`;
    }
};

const initializeNuevoUsuarioForm = () => {
    const container = document.getElementById('crearUsuarioContainer');
    if (!container) return;

    // Solo un admin puede ver y usar el formulario de creación de usuarios
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

const initializeAdminPage = () => {
    if (!document.getElementById('dynamicContent')) return;
    const btn = document.getElementById('downloadExcelBtn');
    if (btn) btn.addEventListener('click', handleDownloadExcel);
    cargarYRenderizarAdmin();
    initializeNuevoUsuarioForm();
};

const handleDownloadExcel = () => {
    if (ultimosDatosAdmin.length === 0) return alert('No hay datos.');
    const ws = XLSX.utils.json_to_sheet(ultimosDatosAdmin);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    XLSX.writeFile(wb, `Pedidos_SHEIN_${new Date().toISOString().slice(0,10)}.xlsx`);
};

// --- INICIO ---
document.addEventListener('DOMContentLoaded', () => {
    initializeLoginPage();

    if (!protegerPagina()) return; // corta la ejecución si redirige al login

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
