# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Estudiantes universitarios que organizan sus propias entregas dentro de grupos académicos. Administradores y gestores mantienen materias, tareas, anuncios y permisos; los alumnos consultan, completan, comentan y configuran recordatorios personales.

El trabajo principal al abrir la aplicación es entender y organizar **mi semana escolar**. La coordinación colectiva debe aparecer cuando es necesaria, sin dominar el seguimiento personal.

## Product Purpose

Base de Tareas reúne materias, unidades, entregas, anuncios y recordatorios de un grupo privado para que cada estudiante sepa qué sigue, qué venció y qué ha completado sin revisar múltiples chats o listas.

El producto tiene éxito cuando una persona puede abrirlo, reconocer sus próximas obligaciones y actuar en pocos segundos con el mínimo ruido posible.

## Positioning

Combina una base compartida de tareas del salón con progreso, recordatorios y estados personales. La información académica se organiza por grupo, materia y unidad sin obligar a cada alumno a mantener una lista separada.

## Operating Context

- Uso frecuente desde teléfono como PWA y desde navegador de escritorio.
- Revisión rápida entre clases, preparación de la semana y consulta detallada de una entrega.
- Grupos privados con roles de administrador, gestor y alumno.
- Calendario, anuncios, recordatorios por correo y notificaciones push complementan la lista principal.

## Capabilities and Constraints

- Mantener compatibilidad con Vercel, Turso, Resend y la SPA actual en HTML, CSS y JavaScript sin framework.
- Conservar grupos, roles, aislamiento de datos, materias, unidades, tareas, subtareas, comentarios, archivos/enlaces, anuncios, calendario, historial, papelera, exportaciones, tema oscuro, PWA, correo y Web Push.
- Conservar materias expandibles para consulta, edición únicamente desde el menú de tres puntos, unidades/temas colapsables y tareas ocultas hasta elegir una unidad.
- Conservar la personalización de color por materia, ajustándola para mantener contraste accesible.
- La interfaz debe reducir la cantidad de opciones e información visible simultáneamente.
- Los cambios deben entregarse en commits segmentados y verificarse antes de considerarse terminados.

## Brand Commitments

- Nombre: Base de Tareas.
- Voz directa, cercana y sencilla en español; nada de jerga técnica innecesaria.
- Dirección aprobada: académica/editorial.
- Debe sentirse calmada, clara y útil, no como una plantilla genérica de SaaS ni como una aplicación infantil.

## Evidence on Hand

- Implementación funcional v2.5.0 en `base-de-tareas/public/`.
- Contenido real del producto y estados existentes en `public/index.html`, `public/js/views.js`, `public/js/ui.js` y `public/js/app.js`.
- No existen fotografías, ilustraciones, testimonios ni material comercial aprobado; no deben inventarse.

## Product Principles

1. La semana personal primero; la coordinación colectiva aparece en contexto.
2. Mostrar el siguiente paso antes que el inventario completo.
3. La materia y el tiempo estructuran la información.
4. La consulta debe ser segura; editar requiere una intención separada.
5. Menos superficies, más jerarquía y lenguaje claro.

## Accessibility & Inclusion

- Navegación completa por teclado y semántica compatible con lectores de pantalla.
- Objetivos táctiles de al menos 44×44 px cuando sea posible.
- Contraste WCAG AA para texto y controles, incluso con colores elegidos por el usuario.
- Respeto de `prefers-reduced-motion`, zoom, textos largos y pantallas móviles.
