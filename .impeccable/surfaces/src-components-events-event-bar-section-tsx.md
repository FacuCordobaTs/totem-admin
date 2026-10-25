---
version: 1
slug: "src-components-events-event-bar-section-tsx"
primary_target: "src/components/events/event-bar-section.tsx"
related_targets: ["src/components/events/bar-detail-view.tsx","src/components/events/bar-menu-panel.tsx","src/components/events/bar-stock-panel.tsx","src/components/events/bar-product-editor.tsx","src/components/events/bar-material-form.tsx","src/components/events/bar-team-panel.tsx","src/components/events/bar-sales-panel.tsx","src/components/events/bar-workspace.css"]
---

# Evento → Barra

Mode: Operate. Audience: productora y equipo que preparan y operan los puestos de un evento. Primary target: `src/components/events/event-bar-section.tsx`.

## Scope and task

La entrada muestra todas las barras. Elegir una abre su espacio de trabajo dentro de la sección, con Menú, Stock, Equipo y Ventas. El puesto físico es el contexto estable: crear productos, sumar insumos, entender disponibilidad, ingresar mercadería o corregir un conteo, asignar equipo y consultar ventas. Stock se omite cuando el evento no controla existencias.

No hay modal Configurar ni interfaz de stock general del evento o reparto entre puestos en esta superficie. El catálogo y las recetas compartidos conservan su alcance de productora; el conteo directo y la disponibilidad se muestran para la barra. Cero significa agotado y nulo significa sin control. Un producto por unidad no requiere un insumo artificial.

## Direction contract

**THESIS:** Operar una barra desde su menú y sus existencias reales. El puesto abre un espacio de trabajo continuo; la configuración deja de ser un paso separado que interrumpe la tarea.

**OWN-WORLD:** Se preservan negro, naranja e Inter Variable de Crow. Filas abiertas, separadores oscuros, cifras alineadas, acciones naranjas y estados con significado explícito. Los formularios y expansiones viven dentro del flujo.

**STORY:** El operador identifica su barra, comprende qué vende y qué puede vender, y modifica menú, conteos o equipo con acciones breves. La composición de un producto y los insumos que limitan su disponibilidad se revelan cuando hacen falta.

**FIRST VIEWPORT:** Listado de barras con nombres, productos, equipo y vendido. Al abrir una barra: regreso al listado, identidad y estado, navegación del puesto, encabezado de tarea y acción principal. Menú muestra productos, precio y disponibilidad; Stock destaca cantidades con unidades y consumidores de cada insumo. La versión móvil reorganiza las filas y mantiene las acciones accesibles.

**FORM:** Espacio de trabajo operativo por puesto, elegido directamente por el usuario para reemplazar la arquitectura anterior. Construcción code-led; sin raster aprobado y sin exploración aleatoria. seed: none (unavailable).

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Implemented patterns

- El producto puede descontar una unidad de su propio conteo, consumir insumos según receta o venderse sin control de stock.
- El rendimiento expresa cuántos productos salen de una unidad de conteo de cada insumo. El operador puede crear o editar insumos en contexto y usar fracciones.
- Stock reúne productos contados directamente e insumos. Ingresar mercadería suma; Corregir conteo fija el conteo actual. La vista previa expresa la consecuencia y el costo total es opcional para ingresos.
- Menú permite buscar, filtrar, traer un producto del catálogo y crear uno nuevo. La edición recuerda que nombre, categoría y receta son compartidos cuando corresponde.
- Los estados vacíos, la carga, los errores recuperables y los controles deshabilitados mantienen la misma estructura de tarea.

## Evidence and delivery notes

Fuente visual: `src/components/events/bar-workspace.css`, componentes locales del flujo y capturas de revisión. `DESIGN.md` registra este sistema local y `.impeccable/design.json` permite inspeccionar sus primitivas. No se generan assets raster para la aplicación.

La revisión final resolvió el hallazgo sobre productos con conteo directo; su veredicto de envío cubre esa lista de correcciones. No equivale a una certificación exhaustiva de toda la superficie. La migración backend `0072` requerida para el conteo directo no fue aplicada ni verificada contra MySQL en esta tarea; es requisito previo al despliegue.
