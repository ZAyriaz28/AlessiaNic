require('dotenv').config();
const express = require('express');
const cors = require('cors');
 
const authRoutes = require('./routes/auth');
const pedidosRoutes = require('./routes/pedidos');
 
const app = express();

// Agrega esta línea para que Node sirva tus archivos HTML/CSS/JS
app.use(express.static(path.join(__dirname, 'public')));
 
app.use(cors());
app.use(express.json());
 
app.use('/api/auth', authRoutes);
app.use('/api/pedidos', pedidosRoutes);
 
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
 
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`API Alessia Nic corriendo en http://localhost:${PORT}`);
});
 