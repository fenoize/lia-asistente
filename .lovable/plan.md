## @ Mention System

### 1. Reusable component: `src/components/mentions/mention-input.tsx`
A controlled textarea wrapper with an overlay-rendered floating picker. Approach:
- Plain `<textarea>` (auto-grow) keeps current behavior; we track caret position with `selectionStart` and detect an active `@token` via regex on the text up to caret (`/(?:^|\s)@([\w\u00C0-\uFFFF]*)$/`).
- When active, we open a floating `<div>` positioned via a hidden mirror `<div>` that copies textarea styles + text-up-to-caret to compute pixel coords (standard "textarea caret coordinates" technique). For mobile, the picker spans full width above the input.
- Picker fetches contacts (`name, type, relationship_type`) and projects (`name, client_id` + join client name) once on mount via Supabase; filters client-side by lowercase name match. Max 4 + 4. Shows section headers `CONTACTOS` / `PROYECTOS`. Empty state: "Sin resultados para '@xxx'".
- Keyboard: ArrowUp/Down navigate combined list, Enter/Tab select, Escape closes. Mouse hover sets active index.
- On select: replace the `@token` slice with `@[Name](contact:uuid) ` (trailing space). Caret moves to after insertion.

### 2. Rendering chips in messages
- New helper `src/lib/mentions.ts` with:
  - `parseMentions(text)`: returns array of `{ kind: 'text'|'mention', value, type?, id?, name? }` segments.
  - `extractMentions(text)`: returns `[{type, id, name}]` list.
  - `MentionText` React component to render parsed segments — chips for mentions (style per spec, click navigates to `/contacts` or `/projects`).
- Use `MentionText` in chat history bubbles (`chat-interface.tsx`).

### 3. Wire into existing inputs
- `src/components/alfred/chat-interface.tsx`: replace the chat textarea with `<MentionInput>`. Render assistant/user messages via `MentionText`.
- `src/components/quick-capture.tsx`: replace its textarea with `<MentionInput>`.
- (Skip per-field rollout into every task/note description for scope; component is reusable for later.)

### 4. AI context enrichment
- In `src/routes/api/ai.ts` POST handler: after parsing body, take the last user message, run `extractMentions` (server-side copy in `src/lib/mentions.ts` — pure, no DOM), and if any, fetch matching contacts/projects from Supabase (using the user-bound `sb` client) plus task counts per project, then prepend a `MENCIONES EN ESTE MENSAJE:` block to the system prompt.
- Same for `src/routes/api/quick-capture.ts`: append mentions block to the classifier system prompt so it has resolution context.

### 5. Styles
Add chip + picker tokens to `src/styles.css` (`.alfred-mention-chip`, `.alfred-mention-picker`, `.alfred-mention-item`, section label, avatar circle). Mobile: `@media (max-width: 768px)` makes picker `width: calc(100vw - 48px)`.

### Out of scope
- No new npm deps (no Tiptap) to keep bundle slim — custom textarea+overlay is sufficient for the specified UX.
- DB schema unchanged; mentions stored inline as `@[Name](type:id)` in existing `content` columns.

### Files
- new: `src/components/mentions/mention-input.tsx`, `src/components/mentions/mention-text.tsx`, `src/lib/mentions.ts`
- edit: `src/components/alfred/chat-interface.tsx`, `src/components/quick-capture.tsx`, `src/routes/api/ai.ts`, `src/routes/api/quick-capture.ts`, `src/styles.css`
