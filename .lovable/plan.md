## Objetivo
Hacer que la activación de notificaciones funcione de verdad en PWA/web móvil: que el botón no quede pegado en “Activando…”, que la suscripción quede creada correctamente y que el dispositivo pueda recibir notificaciones.

## Qué voy a corregir
1. Endurecer el flujo de activación en `src/hooks/use-push-notifications.tsx`.
   - Quitar la lógica frágil basada en `Promise.race` que hoy puede dar un falso “avance” o dejar la suscripción a medias.
   - Ejecutar la solicitud de permiso y el alta de OneSignal de forma compatible con gesto de usuario.
   - Esperar no solo `Notification.permission === "granted"`, sino también una suscripción real (`optedIn` y/o `PushSubscription.id`) antes de marcar éxito.
   - Mantener `try/catch/finally` para que `loading` siempre vuelva a `false`.

2. Sincronizar correctamente el alta con el backend.
   - Solo guardar `profiles.onesignal_player_id` cuando exista un `player_id`/subscription id real.
   - Evitar guardar “granted” localmente si el dispositivo todavía no quedó realmente suscrito.
   - Reforzar la sincronización posterior al login en `src/hooks/use-auth.tsx` para capturar el ID si aparece unos segundos después en móvil/PWA.

3. Revisar la inicialización web de OneSignal en `src/routes/__root.tsx`.
   - Alinear `OneSignal.init(...)` con configuración más segura para custom code setup.
   - Si hace falta, declarar explícitamente la ruta del worker (`serviceWorkerPath`) para que el SDK use el worker correcto en PWA.
   - Añadir logging de diagnóstico mínimo para distinguir: SDK no listo, permiso concedido pero sin suscripción, y fallo al registrar el worker.

4. Validar el worker y la ruta de servicio para PWA.
   - Confirmar que `public/OneSignalSDKWorker.js` sea suficiente para el flujo actual.
   - Si el SDK móvil requiere archivo/ruta adicional esperada por OneSignal, lo dejaré servido desde `public/`.

## Resultado esperado
- El botón deja de quedarse pegado en “Activando…”.
- Tras aceptar el permiso, el modal/pantalla se cierra correctamente.
- El usuario queda realmente suscrito en el dispositivo.
- El `player_id` queda persistido en `profiles.onesignal_player_id`.
- La app queda lista para que las notificaciones puedan llegar.

## Validación
- Verificar que el estado `loading` siempre se limpie.
- Verificar que el flujo no marque éxito sin `player_id` real.
- Verificar que el hook refleje `isSubscribed` correctamente después del alta.
- Revisar logs de cliente para detectar si el bloqueo venía del SDK, del permiso o del worker.

## Detalles técnicos
- Archivos a tocar: `src/hooks/use-push-notifications.tsx`, `src/hooks/use-auth.tsx`, `src/routes/__root.tsx`.
- Posible archivo adicional: `public/OneSignalSDKUpdaterWorker.js` o ajuste equivalente si el SDK lo necesita en esta configuración.
- Mantendré el cambio enfocado solo en el sistema de push, sin tocar otras áreas.