---
name: Crow Admin — Barra
description: Sistema visual implementado para operar barras dentro de un evento.
colors:
  primary: "#ff9500"
  primary-hover: "#ffab36"
  text: "#f4f4f5"
  muted: "#a1a1aa"
  line: "#29292d"
  surface: "#18181b"
  field-border: "#3f3f46"
  button-ink: "#18120a"
  ready-text: "#8ceac2"
  warning-text: "#ffd294"
  error-text: "#fda4af"
typography:
  bar-title:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  label:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "13px"
    fontWeight: 500
  meta:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "12px"
  stock-value:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "22px"
    fontWeight: 600
rounded:
  badge: "5px"
  field: "8px"
  button: "9px"
  choice: "10px"
  panel: "12px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.button-ink}"
    rounded: "{rounded.button}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "#ffffff08"
    textColor: "{colors.text}"
    rounded: "{rounded.button}"
    padding: "9px 14px"
  input:
    backgroundColor: "#ffffff06"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "9px 12px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "24px"
  status:
    backgroundColor: "#ffffff08"
    textColor: "{colors.muted}"
    rounded: "{rounded.badge}"
    padding: "2px 7px"
---

# Design System: Crow Admin — Barra

## Overview

**Creative North Star: "La barra como mesa de trabajo"**

Este documento registra el sistema implementado en Evento → Barra. Conserva la identidad negra y naranja y la tipografía de Crow, con una composición sobria y directa para operar. La información se ordena en filas legibles y acciones concretas, con controles y estados visibles en el contexto de la tarea.

El alcance es la superficie de barras y sus componentes locales. Los valores de la cabecera son normativos para esta superficie, extraídos de `src/components/events/bar-workspace.css`; no sustituyen los tokens globales de `src/index.css` ni convierten patrones de otras pantallas en reglas nuevas. La arquitectura particular del flujo está registrada en el brief de superficie.

**Key Characteristics:**

- Identidad Crow preservada, con naranja para acciones y selección.
- Filas abiertas y separadores para lectura operativa.
- Cambios en contexto y detalle progresivo.
- Cantidades comparables y estados expresados con texto.

## Colors

Una base oscura de neutros sostiene texto claro y un único acento de marca. Los colores de disponibilidad y error cumplen funciones semánticas.

### Primary

- **Naranja Crow** (`primary`): acciones principales, subrayado de navegación activa, selección de opciones y foco. `primary-hover` aporta respuesta al pasar el puntero.

### Neutral

- **Texto claro** (`text`): nombres, títulos y valores operativos.
- **Gris de apoyo** (`muted`): metadatos, unidades y controles de menor prioridad.
- **Carbón de superficie** (`surface`): formularios de creación y paneles en contexto, sobre el fondo oscuro heredado del evento.
- **Línea carbón** (`line`): separación de filas y secciones.
- **Borde de control** (`field-border`): límites de campos, botones secundarios y selectores segmentados.
- **Tinta de acción** (`button-ink`): texto sobre el botón naranja.

Los tokens `ready-text`, `warning-text` y `error-text` expresan disponibilidad, falta de existencias y errores respectivamente. No forman acentos decorativos adicionales. Las alertas incluyen un nombre, cifra o icono que explica el estado.

**The State Rule.** Un color semántico debe acompañar información explícita; un punto o fondo de color por sí solo no explica una advertencia.

## Typography

Inter Variable, cargada localmente por la aplicación, cubre títulos, cuerpo, controles y cifras. No hay una fuente de display nueva. La jerarquía se logra con tamaño, peso y espacio.

- **Título de barra** (`bar-title`): identidad del puesto abierto; se reduce a (21px) en pantallas estrechas.
- **Título de sección** (`title`): encabezados de tareas.
- **Cuerpo** (`body`): contenido habitual y campos.
- **Etiqueta** (`label`): nombres de campos; los botones usan un peso ligeramente mayor (550).
- **Metadatos** (`meta`): unidades, detalles de receta y estados secundarios.
- **Valor de stock** (`stock-value`): conteo destacado, con unidades en una línea subordinada.

Precios, cantidades y totales usan cifras tabulares. Los nombres largos pueden partirse; no fuerces alturas fijas que oculten el contenido.

## Layout

La superficie aprovecha el contenedor de evento existente. Encabezado, navegación y área de tarea comparten el ancho; las listas se apoyan en líneas horizontales y columnas alineadas. Las separaciones recurrentes están en `spacing`; la navegación reserva el mayor espacio antes del contenido. El editor de producto limita su ancho a (860px).

En escritorio, el menú alinea nombre, precio, disponibilidad y edición; el stock alinea nombre, cantidad y acción. Los formularios generales usan dos columnas, y nombre/precio en el editor usa una relación (2:1). A (760px) o menos, los formularios y opciones se apilan; menú y stock transforman sus filas para conservar lectura y acciones. A (480px) o menos, se reorganizan encabezados, ventas de cada barra y herramientas. La navegación admite desplazamiento horizontal y Ventas conserva su tabla con desplazamiento dentro de su contenedor.

## Elevation & Depth

Los componentes de esta superficie no usan sombras. La profundidad proviene de tonos oscuros, bordes discretos y fondos translúcidos para expansiones y controles. Los cambios se abren dentro del flujo, conservando la relación visual con su fila o sección.

Las transiciones de color de botones duran (150ms). El esqueleto de carga pulsa en (1.6s); la preferencia de movimiento reducido desactiva animaciones y transiciones dentro de la superficie.

## Shapes

Los radios pequeños distinguen controles, etiquetas y paneles según los tokens `rounded`. Las filas de barras tienen extremos rectos y separadores continuos. Avatares y puntos de estado son circulares; el icono del puesto vive en un bloque suavemente redondeado. Estas diferencias identifican función, sin agregar contenedores alrededor de cada dato.

## Components

### Buttons

Acciones compactas y verbos directos. El botón principal naranja identifica la acción de creación o guardado del contexto. El secundario usa fondo translúcido y borde. Ambos tienen altura mínima de (40px). Las acciones de texto e iconos reservan menor peso visual; los iconos tienen nombre accesible.

El foco visible utiliza contorno naranja de (2px), separado (3px). Los botones deshabilitados reducen opacidad a (0.5) y dejan de presentar cursor de acción. Mantener feedback de espera durante escrituras.

### Inputs / Fields

Campos oscuros con borde, altura mínima de (42px), etiquetas visibles y relleno de `input`. Búsqueda integra un icono y un fondo transparente. Los importes muestran prefijo de moneda y cifras tabulares. Los errores aparecen en un bloque contextual con `role="alert"`.

### Navigation

La navegación del puesto usa texto y subrayado naranja para la sección actual; el atributo `aria-current` conserva su semántica. Los contadores son pequeños bloques de apoyo, y el contador de faltantes agrega icono de advertencia. Los filtros segmentados usan `aria-pressed` y un fondo claro tenue para la selección.

### Chips

Los estados secundarios usan el token `status`. La disponibilidad añade texto y, cuando corresponde, icono; su variante con existencias es verde suave y su variante agotada es ámbar. Las cantidades sin control se muestran como una acción de texto, sin fingir un conteo de cero.

### Cards / Containers

Los paneles de creación y selección usan `panel`. Las opciones de control de stock se presentan como etiquetas con radio y borde; la seleccionada incorpora borde naranja y un fondo apenas teñido. Las expansiones de receta y stock emplean fondos translúcidos y una línea superior, conservando la fila como ancla.

### Operational Rows

Las barras son filas enteras seleccionables con identidad, metadatos y venta acumulada. Los productos permiten revelar composición y acciones. En stock, el número permanece junto a su unidad y los vínculos a productos consumidores permiten entender el rendimiento. El editor de conteo muestra el resultado de la operación antes de guardarla.

## Do's and Don'ts

### Do:

- **Do** conservar Inter Variable y la identidad negra y naranja de Crow.
- **Do** mantener títulos, cantidades y acciones comparables al recorrer las filas.
- **Do** acompañar las advertencias con texto, iconos o cifras que expresen su significado.
- **Do** conservar foco visible, nombres accesibles y adaptación de las filas en pantallas estrechas.

### Don't:

- **Don't** convertir estos patrones de barras en una política global sin revisar las superficies afectadas.
- **Don't** depender solamente del color para distinguir agotado, activo o error.
- **Don't** agregar sombras o adornos para sustituir la jerarquía de texto y espacio de esta superficie.
- **Don't** reemplazar acciones claras por párrafos explicativos permanentes.
