# Alessia Nic — App unificada (Frontend + Backend + MySQL)

Este proyecto ahora es **un solo servidor**: Express sirve tanto la API
(`/api/...`) como las páginas del frontend (`login.html`, `index.html`,
`admin.html`) desde la carpeta `public/`. Esto simplifica tanto el
desarrollo local como el despliegue en internet — un solo link, sin
problemas de CORS entre dominios distintos.

## Desarrollo local (ya NO necesitas Laragon para el frontend)
```bash
cd backend
npm install
cp .env.example .env   # ajusta tus datos de MySQL
npm run seed:admin      # crea tu usuario admin
node server.js
```
Abre **http://localhost:4000** directamente — ahí verás `index.html`
servido por el mismo Node. Laragon solo lo necesitas encendido para
que MySQL esté corriendo (no para servir archivos).

## Desplegar en internet (Railway)

Railway puede alojar tu app Node.js Y tu base de datos MySQL juntos,
con un plan de prueba gratuito. Pasos generales (te guío paso a paso
cuando lo hagamos juntos):

1. **Sube este proyecto a tu repositorio de GitHub**
   (`ZAyriaz28/AlessiaNic`) — todo el contenido de esta carpeta
   `backend/` (incluyendo `public/`), pero SIN subir `node_modules/`
   ni `.env` (ya están en `.gitignore`).

2. **Crea cuenta en railway.app** e inicia un nuevo proyecto
   conectado a tu repo de GitHub.

3. **Agrega un servicio de MySQL** dentro del mismo proyecto de
   Railway (botón "New" → "Database" → "MySQL"). Railway te da
   automáticamente host, usuario, contraseña y puerto.

4. **Corre la migración** (`migration_pedidos.sql`) contra esa base
   de datos de Railway usando MySQL Workbench (te conectas con los
   datos de conexión que te da Railway, no `localhost`).

5. **Configura las variables de entorno** en Railway (pestaña
   "Variables" del servicio Node), copiando los nombres de tu
   `.env.example`, pero con los valores reales que te dio Railway
   para `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, más tu propio
   `JWT_SECRET` (una clave larga inventada).

6. **Railway te da un link público** (algo como
   `https://alessianic-production.up.railway.app`) — ese es el link
   que compartes con tu segunda persona.

7. **Crea el usuario admin en producción** corriendo
   `npm run seed:admin` desde la consola de Railway (o ajustando
   temporalmente las variables `SEED_ADMIN_USER`/`SEED_ADMIN_PASSWORD`
   ahí y ejecutando el script una vez).

## Endpoints disponibles
| Método | Ruta                              | Auth        | Descripción                    |
|--------|------------------------------------|-------------|----------------------------------|
| POST   | /api/auth/login                    | No          | Login, devuelve un token         |
| POST   | /api/auth/register                 | Admin       | Crea un nuevo usuario            |
| GET    | /api/pedidos                       | Sí          | Lista pedidos con resumen        |
| GET    | /api/pedidos/:id                   | Sí          | Detalle de un pedido             |
| POST   | /api/pedidos                       | Sí          | Crea un pedido con productos     |
| DELETE | /api/pedidos/:id                   | Admin       | Elimina un pedido                |
| POST   | /api/pedidos/productos/:id/venta   | Sí          | Registra una venta               |
