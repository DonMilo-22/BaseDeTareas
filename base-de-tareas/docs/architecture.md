# Arquitectura de Base de Tareas v2

## Objetivos

- Una sola estructura de datos para desarrollo local, Turso y Vercel.
- Separación estricta entre grupos escolares.
- Permisos explícitos y verificables en cada operación.
- Interfaz centrada en lo que el estudiante necesita hacer hoy.
- Recordatorios de correo idempotentes y seguros.
- Migraciones reproducibles; nunca se altera el esquema durante una petición normal.

## Roles

| Rol | Capacidades |
| --- | --- |
| `admin` | Gestionar grupo, roles, semestres, materias y todas las tareas. |
| `manager` | Gestionar materias y tareas, sin poder ascender administradores ni eliminar el grupo. |
| `member` | Consultar, completar, comentar y crear recordatorios personales. |

El primer usuario que crea un grupo se convierte en `admin`. Los usuarios nuevos siempre se
registran como usuarios normales. Solamente un administrador puede cambiar roles y no puede
dejar al grupo sin al menos un administrador.

## Aplicación

- `public/`: SPA accesible y responsiva, sin secretos ni lógica de autorización.
- `api/`: entrada serverless de Vercel.
- `src/server/`: rutas, servicios, autenticación y permisos compartidos por Vercel y el servidor local.
- `database/`: esquema inicial y migraciones SQL numeradas.
- `scripts/`: migración, pruebas de integración y verificación de producción.

La autorización se comprueba siempre en el servidor. Ocultar un botón en el navegador nunca
se considera una medida de seguridad.

## Autenticación

- Contraseñas cifradas con bcrypt.
- Sesión firmada y guardada en cookie `HttpOnly`, `Secure` en producción y `SameSite=Lax`.
- El JWT contiene únicamente el identificador y la versión de sesión.
- No hay clave JWT predeterminada: el servidor se niega a iniciar en producción si falta.
- Las operaciones mutables validan origen, cuerpo, pertenencia al grupo y rol.

## Recordatorios

1. El usuario crea un recordatorio ligado a una tarea y una fecha futura.
2. Vercel Cron llama periódicamente al endpoint protegido `/api/cron/reminders`.
3. El proceso reclama recordatorios vencidos cambiando su estado a `processing`.
4. Resend envía el correo.
5. La fila termina en `sent` o vuelve a `failed` con número de intentos y error resumido.

El endpoint exige `CRON_SECRET`. `RESEND_API_KEY` y `EMAIL_FROM` habilitan el envío real;
en pruebas se utiliza un adaptador de correo falso.

## Decisiones de datos

- Identificadores UUID en todas las entidades para evitar conversiones entre texto y enteros.
- Fechas almacenadas en UTC como texto ISO 8601; cada usuario conserva su zona horaria.
- Eliminación recuperable mediante `deleted_at` para materias, tareas, comentarios y usuarios.
- Adjuntos almacenados como metadatos y URL; no se guardan blobs grandes en Turso.
- `schema_migrations` sustituye a `PRAGMA user_version`, que Turso Cloud no admite para este uso.
