# Backend Alessia Nic (Node.js + Express + MySQL)

## 1. Requisitos
- Laragon corriendo, con MySQL activo.
- La base de datos `alessia_nic` ya creada (con `alessia_nic_schema.sql` en MySQL Workbench).

## 2. Instalación
```bash
cd backend
npm install
```

## 3. Configurar variables de entorno
Copia `.env.example` a `.env` y ajusta los datos según tu Laragon
(normalmente `DB_USER=root` y `DB_PASSWORD` vacío por defecto):
```bash
cp .env.example .env
```

## 4. Crear el usuario administrador real
El schema.sql trae un usuario "admin" de ejemplo con una contraseña falsa.
Bórralo y genera uno real así:
```sql
-- En MySQL Workbench:
DELETE FROM usuarios WHERE nombre_usuario = 'admin';
```
```bash
# En la terminal, dentro de /backend:
npm run seed:admin
```
Esto lee `SEED_ADMIN_USER` y `SEED_ADMIN_PASSWORD` de tu `.env` y crea
el admin con la contraseña correctamente encriptada.

## 5. Levantar la API
```bash
npm run dev
```
La API quedará en `http://localhost:4000`.

## 6. Endpoints disponibles
| Método | Ruta                  | Auth        | Descripción                       |
|--------|-----------------------|-------------|------------------------------------|
| POST   | /api/auth/login       | No          | Login, devuelve un token           |
| GET    | /api/articulos        | No          | Lista todos los artículos          |
| POST   | /api/articulos        | No          | Crea un artículo nuevo             |
| DELETE | /api/articulos/:id    | Sí (admin)  | Elimina un artículo                |

## 7. Siguiente paso
Falta conectar `script.js` (el frontend) para que en vez de usar
`localStorage`, haga `fetch()` a estos endpoints. Es el siguiente paso
que veremos juntos.
