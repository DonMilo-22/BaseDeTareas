---
name: Base de Tareas
description: Un registro académico vivo para entender la semana sin ruido.
colors:
  correction-terracotta: "#9d422e"
  archive-green: "#1d3b31"
  subject-green: "#315a4a"
  paper-gray: "#edf0e8"
  open-sheet: "#fafbf6"
  ruled-line: "#c7cec4"
  ruled-line-strong: "#9fa99f"
  ink: "#17231e"
  graphite: "#58645e"
  success-ink: "#2d684f"
  danger-ink: "#a33327"
typography:
  display:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4vw, 3.25rem)"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "1.32rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Source Sans 3, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 600
    lineHeight: 1.2
rounded:
  tight: "3px"
  control: "4px"
  surface: "6px"
  round: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.correction-terracotta}"
    textColor: "{colors.open-sheet}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "42px"
  button-secondary:
    backgroundColor: "{colors.open-sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "42px"
  input:
    backgroundColor: "{colors.open-sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
    height: "44px"
  chip:
    backgroundColor: "{colors.open-sheet}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.round}"
    padding: "3px 8px"
  task-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.tight}"
    padding: "11px 8px"
    height: "72px"
---

# Design System: Base de Tareas

## Overview

**Creative North Star: "Registro académico vivo"**

Base de Tareas se siente como un registro universitario que sigue en uso: ordenado por tiempo y materias, sobrio pero no institucional. El papel gris verdoso, la tinta verde profunda y las marcas de corrección terracota forman una identidad reconocible sin depender de tarjetas genéricas, gradientes o decoración tecnológica.

La interfaz mantiene una densidad tranquila. Las reglas finas organizan; el espacio abierto da prioridad a las entregas; la contención aparece solo cuando un control, un diálogo o un estado necesita límites. La voz visual es académica, directa y cercana.

**Key Characteristics:**

- Superficies abiertas organizadas por reglas horizontales.
- Verde de archivo para navegación y terracota reservada para acciones.
- Materias identificadas por pequeñas marcas de color, no por bloques saturados.
- Jerarquía tipográfica clara dentro de una sola familia legible.
- Iconos SVG de trazo uniforme y objetivos táctiles amplios.

## Colors

La paleta combina papel frío, tinta vegetal y una corrección terracota escasa; los colores de materia permanecen como anotaciones contextuales.

### Primary

- **Terracota de corrección:** acción principal, foco de atención e importancia.

### Secondary

- **Verde de archivo:** navegación persistente y anclaje de marca.
- **Verde de materia:** valor inicial para materias, avatar y estados académicos.

### Neutral

- **Papel gris:** fondo general que evita el blanco clínico y el beige decorativo.
- **Hoja abierta:** formularios, calendario y superficies que requieren contención.
- **Línea pautada:** divisores y estructura editorial.
- **Tinta:** texto principal.
- **Grafito:** metadatos y texto secundario.

**The Correction Mark Rule.** La terracota señala una acción o una excepción; no tiñe secciones completas.

**The Subject Margin Rule.** El color de una materia aparece en puntos, líneas de un píxel o fondos muy suaves; nunca compromete el contraste del texto.

## Typography

**Display Font:** Source Sans 3 (con system-ui como respaldo)  
**Body Font:** Source Sans 3 (con system-ui como respaldo)

**Character:** Una sola familia humanista mantiene la lectura rápida y evita una teatralidad editorial impostada. El carácter académico proviene de la composición, las reglas y el ritmo.

### Hierarchy

- **Display** (650, fluido, 1): títulos de página y entrada.
- **Title** (700, 1.32rem, 1.15): secciones y paneles.
- **Body** (400, 1rem, 1.5): contenido y explicaciones.
- **Label** (600, 0.9rem, 1.2): campos, controles y navegación.

**The No Kicker Rule.** No colocar etiquetas en mayúsculas encima de cada encabezado. El contexto acompaña al título en la misma línea o vive en el subtítulo.

## Layout

El escritorio usa un índice lateral fijo y un área de lectura de hasta 1320px. Las páginas comienzan con un encabezado delimitado por una regla, seguido por listas abiertas o rejillas solo cuando la comparación lo exige. El espaciado base es de 8px y crece en múltiplos de 16px y 24px.

En pantallas menores de 900px el índice se convierte en cajón y aparece una navegación inferior de cinco destinos: Inicio, Tareas, Materias, Calendario y Ajustes. A 640px, el calendario cambia a agenda lineal, los diálogos se apoyan en el borde inferior y las métricas semanales se apilan.

## Elevation & Depth

El sistema es plano por defecto. Las reglas y los cambios tonales expresan jerarquía; una sombra contenida se reserva para diálogos, búsqueda y mensajes flotantes sobre un fondo atenuado.

**The Open Sheet Rule.** Una sección normal no se convierte en tarjeta. Solo un objeto seleccionable, un formulario modal o una superficie flotante merece contención completa.

## Shapes

Los controles tienen esquinas tensas de 3–6px. Avatares, checks y etiquetas de estado conservan formas circulares porque comunican identidad o estado, no porque sean decoración. Los bordes son de un píxel y las barras laterales gruesas no forman parte del lenguaje.

## Components

### Buttons

- **Shape:** rectangular y compacta (4px).
- **Primary:** terracota con texto claro; solo para la acción principal del contexto.
- **Hover / Focus:** variación tonal discreta y anillo de foco visible de 3px.
- **Secondary / Ghost:** hoja abierta con borde o superficie transparente.

### Chips

- **Style:** etiqueta compacta, borde de un píxel y radio completo.
- **State:** el fondo suave se reserva para importancia, éxito o selección.

### Cards / Containers

- **Corner Style:** casi cuadrado (4–6px).
- **Background:** hoja abierta.
- **Shadow Strategy:** ninguna en reposo.
- **Border:** un píxel cuando el objeto realmente requiere contención.
- **Internal Padding:** 16–24px.

### Inputs / Fields

- **Style:** hoja abierta, borde pautado fuerte y radio de 4px.
- **Focus:** borde terracota y anillo translúcido.
- **Error / Disabled:** texto y borde semánticos; opacidad solo para inactividad.

### Navigation

El índice lateral usa verde de archivo con texto claro; el destino activo invierte a papel gris y tinta verde. En móvil, cada destino conserva icono SVG, nombre completo y un objetivo táctil mínimo de 52px.

### Task Row

La fila de tarea es la unidad distintiva: check independiente a la izquierda, título y materia al centro, fecha e importancia al final. Toda la zona descriptiva es un botón accesible que abre el detalle; completar nunca abre la tarea por accidente.

## Do's and Don'ts

### Do:

- **Do** organizar listas y secciones con reglas y espacio antes de añadir contenedores.
- **Do** mantener objetivos táctiles de al menos 44px y foco visible.
- **Do** plegar recordatorios, comentarios, archivos y progreso dentro del detalle.
- **Do** usar iconos SVG del sistema y nombres de navegación completos.

### Don't:

- **Don't** reconstruir el dashboard como una cuadrícula de tarjetas intercambiables.
- **Don't** usar gradientes, sombras difusas o esquinas grandes como sustituto de jerarquía.
- **Don't** introducir iconos Unicode, etiquetas microscópicas o texto de bajo contraste.
- **Don't** mostrar edición al tocar una materia; la edición vive en su menú de tres puntos.
