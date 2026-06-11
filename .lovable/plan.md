# Fase 1 — Arranque y splash

Anotado todo:
- Asistentes pre-cargados desde contacto/proyecto vinculado, editables (Fase 9).
- Integraciones siempre desde Configuración → subcategoría "Integraciones" (Fase 10+).
- Scopes Google los detallo cuando entremos a Fase 10.

## Cambios

### BUG-033 — Flash de login al abrir PWA
Causa real: `useAuth` ya tiene `loading`, pero `routes/login.tsx` no lo respeta y renderiza el formulario antes de que Supabase resuelva la sesión. Si hay sesión, debería redirigir a `/dashboard` directamente.

**Fix:**
- En `src/routes/login.tsx`: mientras `loading === true`, renderizar `<LiaSplash />` en vez del formulario. Si `session` existe, `navigate({ to: "/dashboard", replace: true })`.
- En `src/routes/index.tsx`: aplicar la misma lógica (splash mientras loading, redirect a dashboard si hay sesión, a login si no) para que la raíz no parpadee.
- `_app.tsx` ya muestra `<LiaSplash />` mientras `loading || !authGateReady` — se queda igual.

Resultado: al abrir la PWA con sesión activa, el usuario ve splash → dashboard (sin pasar por login).

### BUG-035 — Squircle de fondo en el SVG
En `src/components/lia-logo.tsx` existe `<rect ... fill={rectFill} />` que pinta el fondo redondeado oscuro detrás del logo.

**Fix:**
- Agregar prop `showBackground?: boolean` (default `true` para no romper otros usos como sidebar).
- En `src/components/lia-splash.tsx`: pasar `showBackground={false}` para que solo se vean los trazos sobre `#08081a`.
- Revisar `post-login-loader.tsx` y aplicar lo mismo si usa `LiaLogo`.

## Archivos a tocar
- `src/components/lia-logo.tsx` — añadir prop `showBackground`.
- `src/components/lia-splash.tsx` — usar `showBackground={false}`.
- `src/components/post-login-loader.tsx` — verificar y aplicar.
- `src/routes/login.tsx` — guard de `loading` + redirect si hay sesión.
- `src/routes/index.tsx` — guard de `loading` + redirect según sesión.

Sin migraciones, sin nuevas dependencias. Cambios de bajo riesgo.

Confirma para arrancar.
