# AGENTS.md — reglas permanentes del proyecto

## Versión (obligatorio)

Versionado (formato `MAYOR.FEATURE.BUILD-a`, p. ej. `v1.9.5-a`). Al comienzo de cada petición del usuario que vaya a modificar código, ejecuta `npm run version:bump` UNA vez, antes de editar nada; el script decide solo según el estado del árbol (limpio: sube FEATURE y pone BUILD en 0; con cambios: sube BUILD). No lo ejecutes para preguntas, revisiones ni tareas que no cambien archivos, ni más de una vez por petición. MAYOR solo sube si el usuario lo pide explícitamente: `npm run version:bump -- --major`. La versión se lee siempre de `src/app/core/app-version.ts`; nunca se escribe a mano en plantillas ni en otros archivos, y nunca se edita a mano salvo para migraciones pedidas por el usuario.

Opciones del script: `--dry-run` solo muestra "vieja → nueva (motivo)", `--major` sube MAYOR (deja FEATURE y BUILD en 0). Pruebas: `npm run test:version`.

## Otras fuentes de versión (derivadas automáticamente)

`package.json` (`version`), `android/app/build.gradle` (`versionName` / `versionCode` leídos de `android/version.properties`) y `capacitor.config.ts` (que no tiene campo de versión) NO son la fuente de verdad de la versión de la app: la única fuente es `src/app/core/app-version.ts`. No los edites a mano ni los uses para mostrar la versión; se derivan automáticamente mediante `scripts/android-version.mjs` (ejecutado por los scripts de build/bundle/apk).

## Otras reglas de testing
Todo cambio de lógica incluye su test.
Al añadir un campo al tablero, actualizar `canonicalBoardContentKey`.

## Zonas horarias
En el código de producción NUNCA se fija una zona horaria (`America/Santiago` ni ninguna otra): las funciones de formato usan siempre la del dispositivo (`Intl.DateTimeFormat().resolvedOptions().timeZone`) cuando no reciben `timeZone`. Las zonas fijas son solo para los tests, donde hacen falta para que el resultado sea determinista.