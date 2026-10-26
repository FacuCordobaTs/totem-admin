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
  dialog-title:
    fontFamily: "'Inter Variable', sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
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
  dialog-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
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

Este documento registra el sistema implementado en Evento → Barra. Conserva la identidad negra y naranja y la tipografía de Crow, con una composición sobria y directa para operar. La información se ordena en filas legibles y acciones concretas, con controles y estados visibles en el contexto de la tarea. El título de página pertenece al evento; la pestaña activa es el título de cada sección y el contenido empieza directamente en su barra de herramientas.

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
- **Título de sección** (`title`): encabezados de tareas dentro de un flujo, como el editor de producto.
- **Título de diálogo** (`dialog-title`): alta de barras y selectores del puesto.
- **Cuerpo** (`body`): contenido habitual y campos.
- **Etiqueta** (`label`): nombres de campos; los botones usan un peso ligeramente mayor (550).
- **Metadatos** (`meta`): unidades, detalles de receta y estados secundarios.
- **Valor de stock** (`stock-value`): conteo destacado, con unidades en una línea subordinada.

Precios, cantidades y totales usan cifras tabulares. Los nombres largos pueden partirse; no fuerces alturas fijas que oculten el contenido.

## Layout

La superficie aprovecha el contenedor de evento existente. Encabezado, navegación y área de tarea comparten el ancho; las listas se apoyan en líneas horizontales y columnas alineadas. Las separaciones recurrentes están en `spacing`; la navegación reserva el mayor espacio antes del contenido. El editor de producto limita su ancho a (860px).

Cada sección abre con una barra de contexto (`bw-tab-head`): a la izquierda un dato breve —productos a la venta, existencias, personas o total vendido— y a la derecha una única acción primaria, más una secundaria solo cuando el flujo la necesita. No se repite el nombre de la pestaña como título. En el listado de barras, la misma barra resume cantidad y estado a la izquierda y ofrece **Nueva barra** a la derecha.

En escritorio, el menú alinea nombre, precio, disponibilidad y una flecha de navegación; el stock alinea nombre, cantidad y acción. Los formularios generales usan dos columnas, y nombre/precio en el editor usa una relación (2:1). A (760px) o menos, los formularios y opciones se apilan; menú y stock transforman sus filas para conservar lectura y acciones. A (480px) o menos, se reorganizan encabezados, ventas de cada barra y herramientas. A (380px) o menos, las acciones de la barra de contexto se apilan y la navegación conserva las cuatro pestañas: solo permanece el contador de stock agotado. La navegación admite desplazamiento horizontal y Ventas conserva su tabla con desplazamiento dentro de su contenedor.

## Elevation & Depth

Los componentes de esta superficie no usan sombras. La profundidad proviene de tonos oscuros, bordes discretos y fondos translúcidos para expansiones y controles. Los cambios se abren dentro del flujo, conservando la relación visual con su fila o sección.

Las transiciones de color de botones duran (150ms). El esqueleto de carga pulsa en (1.6s); la preferencia de movimiento reducido desactiva animaciones y transiciones dentro de la superficie.

## Shapes

Los radios pequeños distinguen controles, etiquetas y paneles según los tokens `rounded`. Las filas de barras tienen extremos rectos y separadores continuos. Avatares y puntos de estado son circulares; el icono del puesto vive en un bloque suavemente redondeado. Estas diferencias identifican función, sin agregar contenedores alrededor de cada dato.

## Components

### Buttons

Acciones compactas y verbos directos. El botón principal naranja identifica la acción de creación o guardado del contexto. El secundario usa fondo translúcido y borde. Ambos tienen altura mínima de (40px). Las acciones de texto e iconos reservan menor peso visual; los iconos tienen nombre accesible.

Las acciones reversibles de baja frecuencia —desactivar una barra, editar un insumo— usan un botón silencioso sin borde que gana contraste al pasar el puntero. Las acciones destructivas o de retiro —quitar una persona de la barra— usan texto rosado y no compiten con la acción principal de la fila. Las acciones de fila que repiten etiqueta llevan un nombre accesible con el elemento al que afectan.

El foco visible utiliza contorno naranja de (2px), separado (3px). Los botones deshabilitados reducen opacidad a (0.5) y dejan de presentar cursor de acción. Mantener feedback de espera durante escrituras.

### Inputs / Fields

Campos oscuros con borde, altura mínima de (42px), etiquetas visibles y relleno de `input`. Búsqueda integra un icono y un fondo transparente. Los importes muestran prefijo de moneda y cifras tabulares. Los errores aparecen en un bloque contextual con `role="alert"`.

### Dialogs and Selectors

Los selectores de catálogo, equipo y existencias, y el alta de barra o insumo, se abren en un diálogo centrado sobre un velo oscuro. La superficie usa `dialog-panel` —negro de panel, radio de panel y padding de 24px—, un título `dialog-title` con una línea de contexto y un cierre de icono con nombre accesible. El contenido scrollea dentro del diálogo y nunca supera el alto visible. Elegir un elemento no cierra el selector cuando la tarea admite sumar varios; el foco vuelve al disparador al cerrar. No se montan selectores largos ni formularios de alta dentro del flujo de la lista.

### Navigation

La navegación del puesto usa texto y subrayado naranja para la sección actual; el atributo `aria-current` conserva su semántica. Los contadores son pequeños bloques de apoyo. El contador de Stock resume las existencias agotadas con icono y texto alternativo; los demás contadores acompañan el nombre de la sección y se ocultan por debajo de (380px) para mantener las cuatro pestañas visibles. Los filtros segmentados usan `aria-pressed` y un fondo claro tenue para la selección.

### Chips

Los estados secundarios usan el token `status`. La disponibilidad añade texto y, cuando corresponde, icono; su variante con existencias es verde suave y su variante agotada es ámbar. Las cantidades sin control se muestran como una acción de texto, sin fingir un conteo de cero.

### Cards / Containers

No hay tarjetas anidadas. Las filas y secciones se separan con líneas y espacio; el detalle de stock se expande con un fondo apenas translúcido y una línea superior, conservando la fila como ancla. Las opciones de control de stock del editor de producto se presentan como etiquetas con radio y borde; la seleccionada incorpora borde naranja y un fondo apenas teñido. La receta alinea insumo, rendimiento y eliminación en filas. Un único botón **Agregar insumo** abre una búsqueda en contexto: los resultados disponibles aparecen primero y los que ya están en la receta se identifican y deshabilitan. Crear un insumo es una continuación de esa búsqueda, conserva el nombre buscado y lo agrega a la receta al finalizar. En móvil, las acciones del formulario se apilan para mantener su ancho y lectura.

### Operational Rows

Las barras son filas enteras seleccionables con identidad, metadatos y venta acumulada; una barra sin menú se identifica con una etiqueta. Cada fila de producto abre directamente su editor, con precio y disponibilidad como información sin acciones independientes. Cuando un producto no se puede vender, la fila nombra el insumo que lo limita; si quedan pocas unidades, indica también cuál se agota primero. Quitar de la barra se ofrece en el pie del editor. En stock, el número permanece junto a su unidad y se muestra con dos decimales; los productos consumidores y la edición del insumo viven dentro de la operación abierta, no como acciones sueltas en la fila. La acción de cada fila es **Ingresar o contar** y abre un único formulario con las dos operaciones. El editor de conteo muestra el resultado antes de guardarla y cierra con Escape.

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
