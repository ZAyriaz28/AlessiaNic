require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../db');

// Crea (o actualiza la contraseña de) el usuario admin definido en el .env
// Uso: npm run seed:admin
(async () => {
    const usuario = process.env.SEED_ADMIN_USER;
    const password = process.env.SEED_ADMIN_PASSWORD;

    if (!usuario || !password) {
        console.error('Define SEED_ADMIN_USER y SEED_ADMIN_PASSWORD en tu .env');
        process.exit(1);
    }

    try {
        const hash = await bcrypt.hash(password, 10);

        const [existentes] = await pool.query('SELECT id FROM usuarios WHERE nombre_usuario = ?', [usuario]);

        if (existentes.length > 0) {
            await pool.query('UPDATE usuarios SET password_hash = ?, rol = "admin", activo = 1 WHERE nombre_usuario = ?', [hash, usuario]);
            console.log(`Contraseña actualizada para el usuario "${usuario}".`);
        } else {
            await pool.query(
                'INSERT INTO usuarios (nombre_usuario, password_hash, rol) VALUES (?, ?, "admin")',
                [usuario, hash]
            );
            console.log(`Usuario admin "${usuario}" creado correctamente.`);
        }
    } catch (err) {
        console.error('Error creando el admin:', err.message);
    } finally {
        process.exit(0);
    }
})();
