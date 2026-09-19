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
| `member` (Alumno) | Consultar, completar, comentar y crear recordatorios personales. |

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
2. Si faltan 29 días o menos, la API programa el correo con `scheduledAt` de Resend.
3. Si falta más tiempo, el recordatorio queda `pending`; un cron diario lo programa cuando entra
   en la ventana de Resend. El cron no envía el mensaje, por lo que su baja precisión no altera la
   hora elegida por el usuario.
4. Resend conserva la programación y envía el mensaje a la hora indicada.
5. Al cancelar el recordatorio, la tarea o la materia, la API cancela también el correo programado.

`RESEND_API_KEY`, `EMAIL_FROM` y `CRON_SECRET` habilitan el flujo real; en pruebas se utiliza un
adaptador de correo falso. La clave idempotente evita duplicados si el cron reintenta una petición.

## Decisiones de datos

- Identificadores UUID en todas las entidades para evitar conversiones entre texto y enteros.
- Fechas almacenadas en UTC como texto ISO 8601; cada usuario conserva su zona horaria.
- Eliminación recuperable mediante `deleted_at` para materias, tareas, comentarios y usuarios.
- Adjuntos almacenados como metadatos y URL; no se guardan blobs grandes en Turso.
- `schema_migrations` sustituye a `PRAGMA user_version`, que Turso Cloud no admite para este uso.
