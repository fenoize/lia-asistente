## Objetivo
Hacer que la captura rápida en móvil interprete correctamente mensajes como:

`Reunión hoy a las 16:00 con Alejandro de Macetero.cl. vamos a ver la configuración de META de sus cuentas`

Resultado esperado:
- crear una reunión para hoy a las 16:00
- usar un título breve: `Reunión con Alejandro de Macetero.cl`
- guardar una descripción útil: `Se revisará la configuración de META de sus cuentas`

## Qué voy a cambiar
1. Unificar el flujo de captura rápida móvil con el flujo principal.
   - Hoy el botón móvil abre un `QuickCaptureSheet` separado dentro de `src/components/mobile-bottom-nav.tsx`.
   - Ese sheet guarda reuniones y recordatorios con `new Date().toISOString()`, por eso toma la hora actual.
   - Lo reemplazaré para que el acceso móvil abra el `QuickCapture` principal, que ya llama a `/api/quick-capture`.

2. Eliminar la lógica duplicada que hoy rompe el comportamiento.
   - Sacaré la lógica de guardado local simplificada del capturador móvil.
   - Mantendré solo el disparador del modal principal para evitar que escritorio y móvil se comporten distinto otra vez.

3. Ajustar el parser del endpoint si hace falta.
   - Revisaré `src/routes/api/quick-capture.ts` para reforzar las reglas de extracción de reuniones:
     - priorizar `meeting` cuando el texto diga “reunión”
     - extraer fecha/hora explícita como “hoy a las 16:00”
     - resumir el título de forma corta
     - convertir el resto en una descripción accionable

## Validación
- Probaré el caso exacto que indicaste desde el flujo móvil.
- Confirmaré que el guardado usa la hora interpretada y no la hora actual.
- Verificaré que el título y la descripción queden resumidos correctamente.

## Detalle técnico
- Archivo principal a tocar: `src/components/mobile-bottom-nav.tsx`
- Archivo probable de ajuste: `src/routes/api/quick-capture.ts`
- Enfoque preferido: una sola fuente de verdad para quick capture, sin dos implementaciones separadas.