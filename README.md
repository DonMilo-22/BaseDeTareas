# Base de Tareas

Aplicación web colaborativa para organizar materias, tareas, anuncios y recordatorios escolares dentro de grupos privados.

**Versión actual:** 2.5.0

**Aplicación:** [basedetareas.vercel.app](https://basedetareas.vercel.app)

Base de Tareas utiliza una SPA ligera en el navegador, una API con Express desplegada en Vercel, Turso como base de datos y Resend para los correos. La misma aplicación puede ejecutarse localmente sin cambiar su arquitectura.

## Funciones principales

### Cuentas y seguridad

- Registro mediante correo, nombre y contraseña.
- Verificación obligatoria con un código de seis dígitos antes de crear la cuenta.
- Códigos con diez minutos de vigencia, máximo de cinco intentos y reenvío cada 60 segundos.
- Recuperación de contraseña mediante un código enviado por correo.
- Cierre de las sesiones anteriores después de cambiar la contraseña.
- Contraseñas protegidas con bcrypt y sesiones firmadas en cookies `HttpOnly`.
- Límites de solicitudes en las rutas de autenticación.

### Grupos y roles

- Creación de grupos privados con código de invitación.
- Posibilidad de pertenecer y cambiar entre varios grupos.
- Opción para abandonar un grupo cuando el usuario lo desee.
- Protección del último administrador: debe transferir su función antes de salir.
- Separación estricta de materias, tareas, anuncios y miembros entre grupos.

| Rol | Capacidades principales |
| --- | --- |
| Administrador | Gestiona el grupo, integrantes, roles, materias y tareas. |
| Gestor | Organiza materias y tareas sin poder modificar administradores. |
| Alumno | Consulta, completa, comenta y configura recordatorios personales. |

Nadie puede seleccionar un rol privilegiado durante el registro. La persona que crea el grupo se convierte en su primer administrador y puede asignar funciones desde **Equipo**.

### Materias y tareas

- Materias con clave, profesor, aula, horario, color, temas y unidades.
- Tarjetas de materias con gradientes derivados del color elegido y detalles expandibles.
- Edición separada en el menú de tres puntos para evitar cambios accidentales al consultar una materia.
- Unidades y temas colapsables que muestran sus tareas únicamente después de seleccionarlos.
- Tareas con descripción, fecha de entrega, prioridad y tema relacionado.
- Pasos o subtareas con progreso independiente por usuario.
- Comentarios dentro de cada tarea.
- Enlaces adjuntos con validación de protocolos seguros.
- Marcado individual de tareas y subtareas como completadas.
- Búsqueda global, filtros por materia y estado, y marcado de tareas importantes.
- Dashboard, lista de tareas y calendario.
- Edición, eliminación recuperable y restauración.
- Borrado permanente de tareas desde la papelera.

### Anuncios y recordatorios

- Publicación de anuncios independientes de las tareas.
- Fecha opcional para mostrar el anuncio en el calendario.
- Recordatorios personales de anuncios por correo.
- Avisos por correo cuando se agrega una tarea nueva.
- Recordatorio automático para tareas pendientes próximas a vencer.
- Recordatorios personales programados para la fecha y hora elegidas.
- Cancelación local y en Resend cuando se elimina un recordatorio.
- Cola automática para recordatorios que todavía están fuera de la ventana de programación de Resend.
- Notificaciones push opcionales para tareas nuevas, anuncios y entregas próximas.
- Compatibilidad con la PWA instalada en iPhone, iPad y Android.

### Experiencia y personalización

- Dashboard con progreso personal, próximas entregas y actividad reciente.
- Historial que identifica a la persona que realizó cada cambio.
- Calendario mensual y agenda optimizada para celulares.
- Interfaz responsiva con navegación móvil, menús colapsables y diálogos adaptados.
- Tema claro, oscuro o automático.
- Color principal personalizable por usuario.
- Foto de perfil o avatar con iniciales y color personalizado.
- Preferencias de zona horaria y notificaciones por correo.
- Exportaciones en CSV, ICS y JSON.
- Aplicación web instalable mediante PWA.

## Tecnologías

| Área | Tecnología |
| --- | --- |
| Interfaz | HTML, CSS y JavaScript sin framework |
| Servidor | Node.js 22 y Express 5 |
| Base de datos | Turso y LibSQL/SQLite |
| Validación | Zod |
| Autenticación | bcrypt, JWT y cookies seguras |
| Correos | Resend |
| Hosting | Vercel Functions |
| Pruebas | Vitest, Supertest, Happy DOM y Playwright |

## Estructura del proyecto

```text
BaseDeTareas/
├── README.md
└── base-de-tareas/
    ├── api/index.js              # entrada serverless de Vercel
    ├── database/schema.sql       # esquema idempotente para Turso/LibSQL
    ├── docs/architecture.md      # decisiones de seguridad y arquitectura
    ├── public/                   # interfaz, estilos, manifiesto y service worker
    ├── scripts/migrate.mjs       # aplica y comprueba las migraciones
    ├── scripts/smoke-production.mjs
    ├── src/server/               # API, autenticación, permisos, correo y cron
    ├── test/                     # pruebas de API, interfaz y navegador
    ├── server.js                 # servidor para desarrollo local
    └── vercel.json               # Function, rutas y cron diario
```

## Requisitos

- Node.js 22 o superior.
- Una base de datos Turso o un archivo LibSQL local.
- Una clave JWT de al menos 32 caracteres.
- Una cuenta de Resend con dominio verificado para las funciones de correo.

## Instalación local

```bash
git clone https://github.com/DonMilo-22/BaseDeTareas.git
cd BaseDeTareas/base-de-tareas
npm ci
cp .env.example .env
```

Completa las variables de `.env`, aplica el esquema y arranca el servidor:

```bash
npm run migrate
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

Para trabajar sin Turso puedes usar una base local:

```env
TURSO_DATABASE_URL=file:./database/local.db
TURSO_AUTH_TOKEN=
```

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

[`base-de-tareas/database/schema.sql`](base-de-tareas/database/schema.sql) es idempotente: puede ejecutarse nuevamente sin eliminar cuentas, grupos, materias o tareas. `schema_migrations` registra las versiones aplicadas y la aplicación conserva una comprobación de compatibilidad para despliegues existentes.

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

Las claves VAPID no sustituyen a Resend. Web Push se utiliza para tareas nuevas, anuncios y el aviso diario de entregas dentro de las próximas 24 horas; los recordatorios personales con hora exacta continúan enviándose por correo.

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

## Pruebas

```bash
npm run check        # sintaxis y pruebas automatizadas
npm run test         # Vitest
npm run test:watch   # Vitest en modo interactivo
npm run test:e2e     # recorridos de escritorio y móvil con Playwright
npm run smoke        # comprobación de un despliegue
npm audit --omit=dev
```

La versión 2.5.0 cuenta con pruebas para registro verificado, expiración y bloqueo de códigos, recuperación de contraseña, aislamiento entre grupos, permisos, materias expandibles, filtrado de tareas por unidad, suscripciones push, recordatorios, anuncios, papelera, exportaciones e interfaz móvil.

## Seguridad

- Todas las autorizaciones se validan en el servidor.
- Las entradas se validan con Zod y las mutaciones verifican el origen de la petición.
- Los códigos de correo se almacenan como HMAC, nunca en texto visible.
- Las contraseñas se almacenan con bcrypt.
- Las sesiones usan cookies `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
- El JWT contiene solamente el identificador del usuario y la versión de su sesión.
- Los grupos están aislados y cada operación comprueba pertenencia y rol.
- No se almacenan archivos adjuntos: únicamente metadatos y enlaces HTTP/HTTPS validados.

Más detalles en [`base-de-tareas/docs/architecture.md`](base-de-tareas/docs/architecture.md).

## Licencia

Este proyecto utiliza la licencia MIT.
