const jwt = require('jsonwebtoken');

// Verifica que la petición traiga un token válido (header: Authorization: Bearer <token>)
const requireAuth = (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'No autenticado. Inicia sesión primero.' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = payload; // { id, nombre_usuario, rol }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Sesión inválida o expirada.' });
    }
};

// Verifica que además el usuario tenga rol admin
const requireAdmin = (req, res, next) => {
    if (req.usuario?.rol !== 'admin') {
        return res.status(403).json({ error: 'No tienes permisos de administrador.' });
    }
    next();
};

module.exports = { requireAuth, requireAdmin };
