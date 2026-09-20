# Arquitectura de Base de Tareas v2

## Objetivos

- Una sola estructura de datos para desarrollo local, Turso y Vercel.
- Separación estricta entre grupos escolares.
- Permisos explícitos y verificables en cada operación.
- Interfaz centrada en lo que el estudiante necesita hacer hoy.
- Recordatorios de correo idempotentes y seguros.
- Suscripciones Web Push independientes por usuario y dispositivo.
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
- Las cuentas nuevas se crean únicamente después de validar un código de seis dígitos enviado por correo.
- Los códigos se guardan como HMAC, caducan en diez minutos, permiten cinco intentos y solo pueden reenviarse cada 60 segundos.
- La recuperación de contraseña devuelve siempre una respuesta genérica para no revelar si una cuenta existe.
- Cambiar la contraseña incrementa `token_version` e invalida todas las sesiones anteriores.
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

## Notificaciones push

- El navegador crea la suscripción mediante el estándar Web Push y una clave pública VAPID.
- Turso conserva el endpoint y sus claves como datos sensibles ligados al usuario; nunca se devuelven al cliente después de registrarlos.
- La clave privada VAPID permanece exclusivamente en las variables de entorno del servidor.
- Una tarea o anuncio nuevo genera un push para los demás integrantes que lo hayan activado.
- El cron diario envía una sola notificación por usuario para cada tarea pendiente que vence dentro de 24 horas; `push_notification_log` evita duplicados.
- Los endpoints expirados se eliminan cuando el proveedor responde con `404` o `410`.
- Una falla del proveedor push no revierte la creación de una tarea o anuncio ni afecta los correos de Resend.

## Decisiones de datos

- Identificadores UUID en todas las entidades para evitar conversiones entre texto y enteros.
- Fechas almacenadas en UTC como texto ISO 8601; cada usuario conserva su zona horaria.
- Eliminación recuperable mediante `deleted_at` para materias, tareas, comentarios y usuarios.
- Adjuntos almacenados como metadatos y URL; no se guardan blobs grandes en Turso.
- `schema_migrations` sustituye a `PRAGMA user_version`, que Turso Cloud no admite para este uso.
