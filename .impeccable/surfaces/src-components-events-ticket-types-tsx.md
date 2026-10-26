---
version: 1
slug: "src-components-events-ticket-types-tsx"
primary_target: "src/components/events/ticket-types.tsx"
related_targets: ["src/components/events/ticket-admission-fields.tsx", "src/components/events/attendee-table.tsx", "src/components/events/tickets-workspace.css"]
---

# Evento → Entradas

Mode: Operate. Equipo de producción que configura la oferta y consulta asistentes del evento.

## Dirección

Se conserva la identidad Crow: negro, naranja #ff9500, Inter Variable y navegación del evento. El usuario pidió decisiones directas, conservar el listado de asistentes y reemplazar los tipos, el detalle y la lógica de tandas. No se cambia el sistema local documentado para Barra en DESIGN.md.

La oferta se lee como una lista de filas alineadas: identidad, precio transaccional, vendidas/cupo y estado. La opción «Activa en la tienda» está dentro del editor expandido; el listado sólo informa el estado. Un clic abre el editor en contexto; un guardado reúne nombre, precio, cupo, promoción y horario. La promoción se expande al activarla y el horario se revela bajo demanda. No hay instrucciones permanentes ni escalera de precios. Crear un tipo usa el mismo formulario en un diálogo.

Los asistentes mantienen sus filtros y tabla, con páginas de 25/50/100 filas. La ficha del asistente da prioridad a nombre, entrada y estado de acceso, luego contacto, fechas, origen y último traspaso. QR y email comparten el pie; la anulación confirma su consecuencia en el mismo contexto.

## Primitivas locales

Texto #f4f4f5, secundario #a1a1aa, separadores #29292d, editor #0b0b0c y diálogos #18181b, campos #414148. Acento #ff9500 con tinta oscura; verde #8ceac2 para ingreso y rosa #fda4af para errores/anulación. Radios 12px en botones y controles, 14px en diálogos. Precios y cantidades tabulares. Filas abiertas, sin tarjetas repetidas ni sombras decorativas.

El editor usa tres columnas en escritorio y nombre sobre precio/cupo en móvil. Las filas reubican cupo y precio bajo el nombre en 560px. Los diálogos limitan alto y permiten scroll interno; foco naranja y movimiento reducido. Las fechas de ingreso usan hora Argentina.

## Validación

Revisión con componentes reales y datos ficticios en escritorio y móvil. La paginación es local; la exportación mantiene todos los resultados filtrados. El backend requiere la migración aditiva 0075 para el nuevo estado. No se aplicó a bases reales.
