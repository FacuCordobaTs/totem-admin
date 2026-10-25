# Crow Admin

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Equipos de productoras que preparan y operan eventos. El panel reúne administración, barras y caja/POS, puerta, promotores y reportes. El contexto principal es el trabajo operativo de escritorio, con uso web responsive en pantallas móviles.

## Product Purpose

Crow conecta la producción de eventos con preventa, acceso, ventas, retiros, inventario y cierre. El equipo debe poder preparar un evento, operarlo y comprender sus resultados dentro del contexto correcto de productora, evento y puesto.

## Operating Context

Este registro corresponde a `admin/`, una aplicación React/Vite. El mismo frontend se empaqueta en Tauri para Windows, pero web y Tauri se despliegan por separado. Una sesión de navegador no presupone acceso a impresión nativa ni a `invoke()`.

El repositorio contiene otras aplicaciones independientes: backend HTTP y tiempo real, tienda pública de clientes y landing estática. Sus rutas, despliegues y decisiones de interfaz tienen su propio alcance.

## Capabilities and Constraints

- Crow es multi-tenant. Toda operación conserva `tenantId`, además de `eventId` y `barId` cuando corresponde.
- La autorización sensible se valida en backend; los controles visibles del panel no sustituyen controles de rol.
- Los importes viajan por API como strings decimales y los cálculos monetarios usan `Decimal`. La presentación local utiliza convenciones de español de Argentina y pesos argentinos.
- Pagos, fulfillment, canjes, saldo y jobs conservan idempotencia y transacciones.
- Barras, menús, existencias, equipo y ventas se operan dentro del evento. El catálogo compartido y las recetas siguen siendo información de la productora; la disponibilidad y el conteo pertenecen al puesto.
- El inventario admite productos contados directamente, recetas que consumen insumos y productos sin control de stock. Un conteo nulo representa ausencia de límite; cero representa agotado. Las cantidades pueden tener fracciones.
- La documentación canónica en `../docs/` y el código conectado gobiernan los detalles del dominio. Este archivo no redefine contratos de API ni reemplaza las guías operativas de `AGENTS.md`.

## Brand Commitments

Se preservan el nombre Crow, la identidad negra y naranja y la tipografía existente Inter Variable. La mejora de Evento → Barra cambia la organización y operación de esa superficie; no establece una renovación visual del resto del producto.

La voz de la interfaz es directa y operativa, en español. Los nombres de acciones y la información visible deben resolver la tarea sin paredes de texto explicativo.

## Evidence on Hand

El pedido y `AGENTS.md` aportan el contexto de producto. El flujo de barras implementado comienza en `src/components/events/event-bar-section.tsx`; sus componentes locales, modelo y hoja `bar-workspace.css` documentan el comportamiento actual. Las guías canónicas incluyen `../docs/INVENTORY_POS_AND_PICKUPS.md`, `../docs/ARCHITECTURE.md` y `../docs/TAURI_PRINTING_AND_DEPLOYMENT.md`.

## Product Principles

- Mantener el puesto físico como contexto de operación y hacer visible qué se está modificando.
- Mostrar las consecuencias de una acción antes de confirmar cambios de existencias.
- Reducir pasos y separar tareas por intención sin ocultar controles necesarios para operar.
- Preservar consistencia, aislamiento e integridad de datos durante cada mejora de interfaz.
