require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet'); // Importación necesaria

const authRoutes = require('./routes/auth');
const pedidosRoutes = require('./routes/pedidos');

const app = express();

// Configuración de seguridad con Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Agregamos 'unsafe-inline' para los estilos y scripts en línea de tus HTML
      scriptSrc: ["'self'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "'unsafe-inline'"],
      // Agregamos estas fuentes para que Google Fonts cargue bien
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      // Permite la conexión a servidores externos para mapas de Bootstrap
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"] 
    },
  },
}));

// Middlewares
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/pedidos', pedidosRoutes);

// Ruta de salud
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`API Alessia Nic corriendo en el puerto ${PORT}`);
});