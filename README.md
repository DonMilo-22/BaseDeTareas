# 📚 Base de Tareas — Sistema Colaborativo de Clases y Tareas Escolares

**Base de Tareas** es una plataforma web moderna, rápida y colaborativa diseñada para estudiantes y compañeros de clase. Permite registrar asignaturas, crear tareas con fecha límite de entrega, fotos y apuntes de referencia, llevar el seguimiento de qué compañeros han completado cada tarea, ver el progreso grupal e individual, y consultar un registro de auditoría en tiempo real de todos los cambios.

Diseñado con una estética **Glassmorphism (UI/UX Pro Max)**, compatibilidad total con base de datos en la nube **Turso (LibSQL)** y despliegue inmediato en **Vercel**.

---

## ✨ Características Principales

- **Gestión de Materias / Clases**: Crea asignaturas con nombre, código (ej: *MAT-201*), profesor, horario, aula, color personalizado e icono temático.
- **Tareas y Asignaciones**: Título, descripción detallada, nivel de prioridad (*Urgente, Alta, Media, Baja*), fecha y hora límite de entrega.
- **Galería de Referencias Visuales / Fotos**: Adjunta fotos de pizarrón, apuntes o rúbricas de evaluación mediante drag-and-drop o URLs directas, con visor ampliado (Lightbox en alta resolución).
- **Lista de Cumplimiento por Tarea**: Visualiza con exactitud qué compañeros han completado una tarea y quiénes la tienen pendiente, junto a una barra de porcentaje total de entrega grupal.
- **Progreso Personal vs. Grupal**: Cada estudiante tiene su propia cuenta y foto de perfil. Puede marcar sus tareas como completadas con 1 solo clic y consultar sus métricas personales y las de la clase.
- **Registro de Actividad en Vivo (Historial de Cambios)**: Feed cronológico con foto del autor que registra quién creó una tarea, quién editó una descripción o quién completó sus deberes.
- **Directorio de Compañeros**: Directorio de la clase con estadísticas de avance de cada alumno y opción de cambio rápido de cuenta para pruebas.
- **Diseño Glassmorphism Pro Max**: Paneles translúcidos con `backdrop-filter: blur()`, orbes dinámicos de fondo, micro-animaciones, badges luminosos y 100% responsivo para móviles y escritorio.

---

## 🛠️ Tecnologías Utilizadas

- **Frontend**: HTML5 semántico, CSS3 moderno (Variables CSS, Flexbox/Grid, Animaciones Glassmorphic) y JavaScript Vanilla modular (ES Modules).
- **Base de Datos**: [Turso](https://turso.tech) (LibSQL / SQLite distribuido en el Edge) mediante `@libsql/client` (con soporte automático de fallback a SQLite local para desarrollo).
- **Backend**: API Serverless Functions en Node.js compatibles con **Vercel** (`/api/*`).
- **Autenticación**: JSON Web Tokens (JWT) y cifrado seguro de contraseñas con `bcryptjs`.

---

## 🚀 Inicio Rápido Local

### 1. Clonar o abrir el directorio del proyecto
```bash
cd /Users/milo/.gemini/antigravity-ide/scratch/base-de-tareas
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Iniciar el servidor local de desarrollo
```bash
npm run dev
```

Abre tu navegador en [http://localhost:3000](http://localhost:3000). La aplicación iniciará con datos de prueba sembrados automáticamente y una base de datos local lista para usar.

---

## ☁️ Conectar con Turso (Base de Datos en la Nube)

1. Instala la CLI de Turso o crea una cuenta en [turso.tech](https://turso.tech):
   ```bash
   turso auth signup
   ```
2. Crea tu base de datos:
   ```bash
   turso db create base-de-tareas-db
   ```
3. Obtén la URL de conexión:
   ```bash
   turso db show base-de-tareas-db --url
   # Ejemplo: libsql://base-de-tareas-db-tuusuario.turso.io
   ```
4. Genera un token de autenticación:
   ```bash
   turso db tokens create base-de-tareas-db
   ```
5. Crea un archivo `.env` en la raíz de tu proyecto basándote en `.env.example`:
   ```env
   TURSO_DATABASE_URL=libsql://base-de-tareas-db-tuusuario.turso.io
   TURSO_AUTH_TOKEN=tu_token_aqui
   JWT_SECRET=tu_clave_secreta_super_segura
   PORT=3000
   ```

La aplicación creará automáticamente las tablas y sembrará los datos iniciales al arrancar.

---

## 🔺 Despliegue en Vercel

El proyecto está 100% preconfigurado con `vercel.json` para desplegar el frontend estático y las funciones Serverless en `/api`.

### Opción 1: Mediante la CLI de Vercel
```bash
npm i -g vercel
vercel
```
Durante el despliegue o en el Dashboard de Vercel (**Settings > Environment Variables**), agrega las siguientes variables de entorno:
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `JWT_SECRET`

### Opción 2: Mediante GitHub + Vercel Dashboard
1. Sube este proyecto a tu repositorio de GitHub.
2. En [vercel.com](https://vercel.com), haz clic en **"Add New Project"** e importa el repositorio.
3. En la sección **Environment Variables**, añade `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` y `JWT_SECRET`.
4. Haz clic en **Deploy**. ¡Listo!

---

## 👥 Cuentas de Demostración Incluidas

Puedes probar la interacción entre múltiples compañeros utilizando cualquiera de las cuentas de prueba precargadas (contraseña: `123456`):
- **Mateo Ramos**: `mateo@estudiante.com`
- **Sofía Mendoza**: `sofia@estudiante.com`
- **Carlos Herrera**: `carlos@estudiante.com`
- **Lucía Gómez**: `lucia@estudiante.com`

O bien, crea tu propia cuenta con tu nombre, correo y foto de perfil en el botón **"Crear Cuenta"**.
