# Base de Tareas v2

Organizador escolar colaborativo con una interfaz tranquila, tareas personales dentro de grupos,
roles controlados, historial, papelera y recordatorios por correo. El backend funciona como una
sola aplicación Express tanto en local como en una Function de Vercel; todos los datos persistentes
viven en Turso.

## Funciones

- Grupos privados mediante código de invitación.
- Roles `admin`, `manager` y `member` comprobados por el servidor.
- Materias, temas, tareas, pasos, comentarios y enlaces adjuntos.
- Progreso independiente para cada integrante.
- Dashboard, búsqueda, filtros, calendario y exportaciones CSV, ICS y JSON.
- Papelera recuperable e historial de actividad.
- Recordatorios personales por correo mediante Resend.
- Tema claro/oscuro, navegación móvil y aplicación web instalable (PWA).

Nadie elige un rol privilegiado al registrarse. Quien crea un grupo se convierte en su primer
administrador; después puede promover a una o más personas desde **Equipo**. Un gestor administra
materias y tareas, pero no puede cambiar permisos.

## Estructura

```text
base-de-tareas/
├── api/index.js              # entrada serverless de Vercel
├── database/schema.sql       # esquema completo para Turso
├── public/                   # SPA sin proceso de compilación
├── scripts/migrate.mjs       # aplica el esquema de forma idempotente
├── src/server/               # API, autenticación, permisos y correo
└── test/                     # integración de API, interfaz y navegador
```

## Preparar Turso

Esta versión necesita una base nueva; el esquema anterior no es compatible. Crea una base vacía y
no apuntes el despliegue actual a ella hasta terminar la configuración.

```bash
turso db create base-de-tareas-v2
turso db show base-de-tareas-v2 --url
turso db tokens create base-de-tareas-v2
```

Copia `.env.example` a `.env`, completa la URL y el token, y aplica el esquema:

```bash
cd base-de-tareas
npm ci
npm run migrate
```

El archivo que también puedes introducir directamente en la consola de Turso es
[`base-de-tareas/database/schema.sql`](base-de-tareas/database/schema.sql). Es idempotente: volver a
ejecutarlo no elimina información. La tabla `schema_migrations` registra la versión instalada.

## Desarrollo local

```bash
cd base-de-tareas
cp .env.example .env
# Genera JWT_SECRET, por ejemplo: openssl rand -base64 48
npm ci
npm run migrate
npm run dev
```

Abre `http://localhost:3000`. Si `TURSO_DATABASE_URL=file:./database/local.db`, el mismo esquema se
usa en un archivo SQLite local compatible con LibSQL.

## Recordatorios

Configura un dominio verificado en Resend y estas variables:

```env
RESEND_API_KEY=re_...
EMAIL_FROM=Base de Tareas <recordatorios@tu-dominio.com>
APP_URL=https://tu-dominio.vercel.app
CRON_SECRET=un-secreto-largo-y-aleatorio
```

Los correos dentro de los próximos 29 días se programan inmediatamente. Los recordatorios más
lejanos quedan en cola; el cron diario de Vercel los entrega a Resend al entrar en esa ventana y
Resend conserva la hora exacta solicitada.

## Desplegar en Vercel

1. Importa el repositorio y selecciona `base-de-tareas` como **Root Directory**.
2. Usa Node.js 22.
3. Agrega `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `APP_URL`, `RESEND_API_KEY`,
   `EMAIL_FROM` y `CRON_SECRET` para Production y Preview.
4. Ejecuta `npm run migrate` una vez contra la base nueva.
5. Despliega y verifica con `BASE_URL=https://... npm run smoke`.

La aplicación no crea ni modifica tablas durante una petición web. Si falta la base o un secreto
seguro en producción, falla de forma explícita en vez de usar datos temporales.

## Verificación

```bash
npm run check       # sintaxis + pruebas de API e interfaz
npm run test:e2e    # Chrome de escritorio y viewport móvil
npm audit --omit=dev
```

Consulta [`base-de-tareas/docs/architecture.md`](base-de-tareas/docs/architecture.md) para las
decisiones de seguridad y datos.
