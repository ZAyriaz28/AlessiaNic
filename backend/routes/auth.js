const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { nombre_usuario, password } = req.body;

    if (!nombre_usuario || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT id, nombre_usuario, password_hash, rol, activo FROM usuarios WHERE nombre_usuario = ?',
            [nombre_usuario]
        );

        const usuario = rows[0];
        if (!usuario || !usuario.activo) {
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        const passwordValida = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValida) {
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        const token = jwt.sign(
            { id: usuario.id, nombre_usuario: usuario.nombre_usuario, rol: usuario.rol },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ token, usuario: { id: usuario.id, nombre_usuario: usuario.nombre_usuario, rol: usuario.rol } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al iniciar sesión.' });
    }
});

// POST /api/auth/register - solo un admin logueado puede crear nuevos usuarios
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.post('/register', requireAuth, requireAdmin, async (req, res) => {
    const { nombre_usuario, password, rol } = req.body;

    if (!nombre_usuario || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
    }
    if (rol && !['admin', 'vendedor'].includes(rol)) {
        return res.status(400).json({ error: 'Rol inválido.' });
    }

    try {
        const [existentes] = await pool.query('SELECT id FROM usuarios WHERE nombre_usuario = ?', [nombre_usuario]);
        if (existentes.length > 0) {
            return res.status(409).json({ error: 'Ese nombre de usuario ya existe.' });
        }

        const hash = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO usuarios (nombre_usuario, password_hash, rol) VALUES (?, ?, ?)',
            [nombre_usuario, hash, rol || 'vendedor']
        );

        res.status(201).json({ id: result.insertId, nombre_usuario, rol: rol || 'vendedor' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al crear el usuario.' });
    }
});

module.exports = router;
