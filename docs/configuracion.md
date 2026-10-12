# Configuración y despliegue

[Volver al README](../README.md). Ejecuta los comandos de esta guía desde `base-de-tareas/`, salvo indicación distinta.

## Variables de entorno

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `TURSO_DATABASE_URL` | Sí | URL de Turso o archivo LibSQL local. |
| `TURSO_AUTH_TOKEN` | En Turso Cloud | Token de acceso a la base remota. |
| `JWT_SECRET` | Sí | Firma las sesiones y protege los códigos temporales. Mínimo 32 caracteres. |
| `APP_URL` | Sí en producción | URL pública sin diagonal final. |
| `RESEND_API_KEY` | Para correos | Clave de la API de Resend. |
| `EMAIL_FROM` | Para correos | Remitente verificado, por ejemplo `Base de Tareas <recordatorios@dominio.com>`. |
| `RESEND_FROM_EMAIL` | No | Alias compatible de `EMAIL_FROM`. |
| `EMAIL_RECIPIENT_OVERRIDE` | Solo pruebas | Redirige todos los correos a una dirección controlada. Debe eliminarse en producción. |
| `CRON_SECRET` | Para el cron | Protege la ejecución del procesamiento diario de recordatorios. |
| `VAPID_PUBLIC_KEY` | Para push | Clave pública utilizada por el navegador para crear la suscripción. |
| `VAPID_PRIVATE_KEY` | Para push | Clave privada del servidor; nunca debe incluirse en el código del cliente. |
| `VAPID_SUBJECT` | Para push | URL HTTPS o contacto `mailto:` que identifica al emisor. |
| `QSTASH_URL` | Para push programado | Endpoint regional; usa `https://qstash-us-east-1.upstash.io` para credenciales US. |
| `QSTASH_TOKEN` | Para push programado | Autoriza la creación y cancelación de entregas en QStash. |
| `QSTASH_CURRENT_SIGNING_KEY` | Para push programado | Verifica que la llamada de entrega proviene de QStash. |
| `QSTASH_NEXT_SIGNING_KEY` | Para push programado | Permite rotar la firma sin interrumpir entregas. |
| `PORT` | No | Puerto local; usa `3000` por defecto. |

Puedes generar secretos seguros con:

```bash
openssl rand -base64 48
```

## Configurar Turso

Para una instalación nueva:

```bash
turso db create base-de-tareas
turso db show base-de-tareas --url
turso db tokens create base-de-tareas
```

Guarda la URL y el token en `.env` y ejecuta:

```bash
npm run migrate
```

[`schema.sql`](../base-de-tareas/database/schema.sql) es idempotente: puede ejecutarse nuevamente sin eliminar cuentas, grupos, materias o tareas. `schema_migrations` registra las versiones aplicadas y la aplicación conserva una comprobación de compatibilidad para despliegues existentes.

## Configurar Resend

1. Agrega y verifica un dominio en Resend.
2. Publica los registros DKIM, SPF y DMARC indicados por Resend en tu proveedor DNS.
3. Crea una API key con permiso de envío.
4. Configura `RESEND_API_KEY` y `EMAIL_FROM`.
5. Establece `APP_URL` con la dirección pública de la aplicación.
6. Elimina `EMAIL_RECIPIENT_OVERRIDE` antes de usar correos reales en producción.

Resend se utiliza para:

- códigos de verificación de cuentas;
- recuperación de contraseñas;
- avisos de tareas nuevas;
- recordatorios automáticos de entregas;
- recordatorios personales de tareas y anuncios.

Los correos programados con hasta 29 días de anticipación se envían directamente a Resend. Los recordatorios más lejanos permanecen pendientes y el cron diario los programa cuando entran en esa ventana.

## Configurar notificaciones push

Genera un par de claves VAPID una sola vez:

```bash
npx web-push generate-vapid-keys
```

Guarda el resultado en `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`, y configura `VAPID_SUBJECT` con la URL pública de la aplicación. Los usuarios podrán activar o desactivar las notificaciones de cada dispositivo desde **Ajustes → Mi perfil**. En iPhone y iPad la página debe estar agregada a la pantalla principal; en Android funciona como PWA instalada.

Las claves VAPID no sustituyen a Resend. Web Push se utiliza para tareas nuevas, anuncios y entregas próximas. El centro de Recordatorios permite además programar avisos personales por correo, push o ambos medios.

## Configurar QStash

1. Crea una cuenta en Upstash y abre **QStash**.
2. Copia el token y las dos claves de firma de la consola.
3. Guarda los valores en `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY` y `QSTASH_NEXT_SIGNING_KEY`. Si elegiste US, configura también `QSTASH_URL=https://qstash-us-east-1.upstash.io`.
4. Comprueba que `APP_URL` apunte a la URL HTTPS pública de producción.

El plan gratuito de QStash permite retrasar una entrega hasta siete días. Los recordatorios más lejanos permanecen en Turso y el cron diario los programa automáticamente al entrar en esa ventana. QStash conserva la hora exacta y firma cada llamada; la API verifica esa firma antes de enviar el push.

## Despliegue en Vercel

1. Importa el repositorio en Vercel.
2. Selecciona `base-de-tareas` como **Root Directory**.
3. Usa Node.js 22.
4. Agrega las variables de entorno necesarias para **Production** y **Preview**.
5. Ejecuta `npm run migrate` contra la base configurada.
6. Despliega el proyecto.

El cron definido en `vercel.json` ejecuta `/api/cron/reminders` diariamente. Vercel envía `CRON_SECRET` como token Bearer para autorizar la petición.

Después del despliegue puedes ejecutar una comprobación pública sin crear cuentas temporales:

```bash
BASE_URL=https://tu-proyecto.vercel.app npm run smoke
```

