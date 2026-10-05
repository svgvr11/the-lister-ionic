# AGENTS.md — reglas permanentes del proyecto

## Versión (obligatorio)

Versionado (formato `MAYOR.FEATURE.BUILD-a`, p. ej. `v1.9.5-a`). Al comienzo de cada petición del usuario que vaya a modificar código, ejecuta `npm run version:bump` UNA vez, antes de editar nada; el script decide solo según el estado del árbol (limpio: sube FEATURE y pone BUILD en 0; con cambios: sube BUILD). No lo ejecutes para preguntas, revisiones ni tareas que no cambien archivos, ni más de una vez por petición. MAYOR solo sube si el usuario lo pide explícitamente: `npm run version:bump -- --major`. La versión se lee siempre de `src/app/core/app-version.ts`; nunca se escribe a mano en plantillas ni en otros archivos, y nunca se edita a mano salvo para migraciones pedidas por el usuario.

Opciones del script: `--dry-run` solo muestra "vieja → nueva (motivo)", `--major` sube MAYOR (deja FEATURE y BUILD en 0). Pruebas: `npm run test:version`.

## Otras fuentes de versión (todas derivados en un paso posterior)

`package.json` (`version`), `android/app/build.gradle` (`versionName` / `versionCode`) y `capacitor.config.ts` (que no tiene campo de versión) NO son la versión de la app: la única fuente de verdad es `src/app/core/app-version.ts`. No los edites a mano ni los uses para mostrar la versión; se derivarán de ella más adelante.
