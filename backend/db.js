require('dotenv').config();
const mysql = require('mysql2/promise');

// Pool de conexiones: reutiliza conexiones en vez de abrir una nueva
// por cada consulta (mucho más eficiente cuando la app crezca).
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
