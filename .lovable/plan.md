# Plan Semanal interactivo — Opción C (migración mínima)

## 1. Migración DB (mínima, no rompe nada existente)

Agregar a `public.tasks`:
- `start_time time` (nullable) — hora de inicio del bloque.
- `duration_minutes integer` (nullable) — duración estimada en minutos.

No se toca `priority`, `status`, ni `project_id`. Resto del esquema queda igual.

## 2. Mapeos en la integración del plan

Como el snippet usa vocabulario propio, traduzco al guardar/leer:

| Plan (UI/prompt) | DB |
|---|---|
| priority: `urgente` | `urgent` (el modal existente ya soporta `urgent/high/medium/low` — ver `edit-task-modal.tsx`) |
| priority: `alta` | `high` |
| priority: `media` | `medium` |
| priority: `baja` | `low` |
| status `en_cola` (nuevas) | `borrador` |
| `project_name` (texto) | resolver a `project_id` con lookup `projects.name ILIKE` por usuario; si no hay match → `project_id: null` y se guarda el texto en `project` (columna legacy existente) |
| fecha `YYYY-MM-DD` + `start_time HH:MM` | `start_date` (timestamptz, combinando ambos en zona del usuario) y `start_time` (time) por separado |

## 3. `src/lib/ai/prompts.ts`

En `buildSystemPrompt()`, al final del template literal, agregar la sección `## PLAN SEMANAL` tal cual la pediste:
- Instrucción de responder con 1-2 líneas + bloque `[PLAN]…[/PLAN]`.
- Formato JSON exacto: `{type, summary, days[{date, label, tasks[{task_id, action, title, priority, start_time, duration_minutes, project_name}]}]}`.
- Reglas (7 días, action update/create, máx 4-5 por día, ordenadas por start_time, el bloque reemplaza listas en texto).
- Regla anti-bucle.

No se modifica el resto del prompt ni `buildBriefSystemPrompt`.

## 4. `src/components/alfred/chat-interface.tsx`

### 4A. Tipos
Agregar antes del componente principal: `PlanTask`, `PlanDay`, `WeeklyPlan`, `DragState` (igual al snippet).

### 4B. Parser
Agregar helper `parseMessageParts(content)` que separa segmentos `[PLAN]…[/PLAN]` del texto plano.

### 4C. `WeeklyPlanCard`
Componente nuevo con todo lo del snippet (drag&drop con listeners en `document`, modal bottom-sheet, calendario inline mensual, búsqueda de proyecto debounced, pasos de "aprobando", ghost con `position: fixed`).

Adaptaciones al proyecto real:
- `useAuth()` → import desde `@/hooks/use-auth` (expone `user`, no `supabase`).
- `supabase` → import desde `@/integrations/supabase/client`.
- Búsqueda de proyectos: `.from("projects").select("id,name").eq("user_id", user.id).ilike("name", "%q%").limit(8)`.
- `approvePlan()`:
  - Mapea `priority` UI→DB (urgente/alta/media/baja → urgent/high/medium/low).
  - Mapea `status` `en_cola` → `borrador`.
  - Resuelve `project_name` → `project_id` (lookup; fallback texto en `project`).
  - Combina `day.date` + `task.start_time` en `start_date` ISO (zona local del navegador).
  - Persiste también `start_time` y `duration_minutes` directamente.
  - Ejecuta updates/inserts en paralelo con `Promise.all` (mejor que loop secuencial), pero el feedback visual de 4 pasos se mantiene como timeline cosmética.

### 4D. Integración en el render
En `MessageBubble` (líneas ~686-710), donde hoy va `<ReactMarkdown>{text}</ReactMarkdown>`:
- Aplicar `parseMessageParts(text)`.
- Render por parte: si `type === 'plan'` → `<WeeklyPlanCard planJson={value} onApproved={…} />`; si `type === 'text'` → `<ReactMarkdown>` actual.
- `onApproved(confirmText)` agrega un mensaje assistant nuevo usando `setMessages` del `useChatStore` y lo persiste en `chat_messages` siguiendo el patrón ya usado en el archivo (insert con `user_id`, `role: "assistant"`, `content`).
- Mantener intactos: cursor de streaming, skeletons, `ActionCard` (acciones JSON existentes), timestamp.

## 5. Lo que NO se toca
OneSignal, pg_cron, push notifications, edge function `send-notifications`, ni configuración de notificaciones.

## Riesgos
- El mapeo de prioridades es asimétrico (4 valores UI ↔ 4 valores DB ya soportados por el modal de edición), así que es consistente.
- Si LIA inventa un `project_name` que no existe, se guarda como texto suelto en `project` y `project_id: null` — visible luego en la pantalla de Tareas.
- El usuario puede mover una tarea fuera de la semana del plan vía calendario; se persiste con esa fecha pero ya no aparece en la tarjeta (marca de aviso ya incluida en el snippet).

¿Confirmo y lo implemento?
