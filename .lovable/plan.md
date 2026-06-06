## 1. Inicio — Sección "Recordatorios y eventos"

Archivo: `src/routes/_app.dashboard.tsx`

- Ya existe un bloque `timeline` (reminders + upcomingMeetings combinados) renderizado entre "Requiere atención" y "Tareas del día". Lo voy a reusar / renombrar.
- Cambios:
  - Cambiar la consulta de `reminders` para traer también recordatorios `done=false` de hoy aunque ya hayan vencido (hoy ya filtra por rango del día — verificar que incluya los vencidos del día; los pasados de días anteriores no se incluyen, que es lo correcto).
  - Reordenar `timeline`: primero todos los recordatorios de hoy ordenados por hora, después todos los eventos/reuniones ordenados por hora (no intercalados).
  - Si un recordatorio tiene `datetime < now`, mostrar un badge rojo "vencido" junto al título.
  - Envolver toda la sección en `{ (reminders.length + upcomingMeetings.length) > 0 && ... }` con label `RECORDATORIOS Y EVENTOS`. Si está vacío, no renderizar nada (sin label, sin espacio).
  - Mantener el estilo oscuro existente (mismos tokens / mismas cards que ya usa el timeline actual).

No se tocan: tarjetas de tareas (folder+proyecto), mini-cards de atención, resumen LIA.

## 2. Inicio — Nombres de tareas sin truncar

Archivo: `src/routes/_app.dashboard.tsx` (componente `TaskRow`)

- Quitar `truncate` / `whitespace-nowrap` / `text-overflow: ellipsis` del título de la tarea.
- Permitir wrap a 2+ líneas (`whiteSpace: normal`, `wordBreak: break-word`).
- No tocar tamaño de fuente, ícono de folder/proyecto, assignee, checkbox ni el resto del layout.

## 3. Chat — Scroll solo vertical

Archivo: `src/components/alfred/chat-interface.tsx` (y CSS si hace falta en `src/styles.css`).

- En el contenedor scroll del chat: añadir `overflow-x: hidden` y `max-width: 100%`.
- En los bubbles/mensajes: aplicar `max-width: 100%`, `word-break: break-word`, `overflow-wrap: anywhere` para que URLs largas / código inline no rompan el layout horizontalmente.
- Revisar bloques de markdown / `pre`/`code` y agregarles `overflow-x: auto` propio (scroll interno) en vez de empujar el ancho de la pantalla.
- Verificar el input `MentionInput` y la lista de mensajes — sin alterar la lógica del chat.

## 4. Toasts arriba (global)

Archivo: `src/components/ui/sonner.tsx`

- Ya está configurado con `position="top-center"`. Voy a confirmar por inspección si el Toaster está montado una sola vez (en `__root.tsx` o `_app.tsx`). Si hay un segundo `<Toaster />` con default `bottom-right`, lo elimino o le paso `position="top-center"`.
- Resultado: todos los `toast(...)` aparecen arriba, no tapan los botones de acción.

---

### Notas técnicas
- Plan limitado a frontend/presentation. No toco esquema, queries de otros módulos, ni lógica de acciones del chat.
- Sin nuevas dependencias.
