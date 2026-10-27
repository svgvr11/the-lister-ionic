# AGENTS.md — reglas permanentes del proyecto

## Versión (obligatorio)

Versionado (formato `MAYOR.FEATURE.BUILD-a`, p. ej. `v1.9.5-a`). Al comienzo de cada petición del usuario que vaya a modificar código, ANTES de editar nada, pregunta al usuario qué tipo de subida de versión desea para esa tarea (usa la herramienta de preguntas con opciones cerradas):

- **Mayor**: sube MAYOR y deja FEATURE y BUILD en 0.
- **Feature**: sube FEATURE y deja BUILD en 0.
- **Build**: sube BUILD.
- **Ninguna**: no se sube la versión en esta tarea.

Nunca elijas el tipo por tu cuenta ni lo deduzcas del estado del árbol de cambios (limpio o con cambios): la decisión es siempre del usuario, tarea por tarea. Una respuesta anterior no se reutiliza para tareas posteriores; pregunta de nuevo en cada petición nueva.

Con la respuesta del usuario, ejecuta UNA sola vez, antes de editar nada, el comando correspondiente:

- Mayor: `npm run version:bump -- --major`
- Feature: `npm run version:bump -- --feature`
- Build: `npm run version:bump -- --build`
- Ninguna: no ejecutes el script.

No preguntes ni ejecutes el script para preguntas, revisiones ni tareas que no cambien archivos, ni más de una vez por petición. La versión se lee siempre de `src/app/core/app-version.ts`; nunca se escribe a mano en plantillas ni en otros archivos, y nunca se edita a mano salvo para migraciones pedidas por el usuario.

Opciones del script: `--dry-run` solo muestra "vieja → nueva (motivo)"; `--major`, `--feature` y `--build` indican explícitamente el tipo de subida (el script ya no lo decide solo según el árbol). Pruebas: `npm run test:version`.

## Otras fuentes de versión (derivadas automáticamente)

`package.json` (`version`), `android/app/build.gradle` (`versionName` / `versionCode` leídos de `android/version.properties`) y `capacitor.config.ts` (que no tiene campo de versión) NO son la fuente de verdad de la versión de la app: la única fuente es `src/app/core/app-version.ts`. No los edites a mano ni los uses para mostrar la versión; se derivan automáticamente mediante `scripts/android-version.mjs` (ejecutado por los scripts de build/bundle/apk).

## Otras reglas de testing
Todo cambio de lógica incluye su test.
Al añadir un campo al tablero, actualizar `canonicalBoardContentKey`.

## Zonas horarias
En el código de producción NUNCA se fija una zona horaria (`America/Santiago` ni ninguna otra): las funciones de formato usan siempre la del dispositivo (`Intl.DateTimeFormat().resolvedOptions().timeZone`) cuando no reciben `timeZone`. Las zonas fijas son solo para los tests, donde hacen falta para que el resultado sea determinista.

## Estructura de src/app

- `core/` — lógica pura y helpers sin Angular DI, agrupada por dominio: `core/<dominio>/<nombre>/<nombre>.ts` con su `<nombre>.spec.ts` en la misma carpeta. Dominios actuales: auth, board, feedback, list, platform, ui.
- Excepción: `core/app-version.ts` se queda en la raíz de `core/` (los scripts de versión leen y reescriben esa ruta exacta).
- `guards/` — guardias de ruta (`auth.guard.ts`, etc.).
- `models/` — interfaces y tipos en archivos `*.model.ts`.
- `pages/<nombre>/` — una carpeta por página (`<nombre>.page.ts`, `.html`, `.scss`); las páginas solo componen.
- `services/` — servicios con Angular DI (`*.service.ts`, `*.repository.ts`, con su spec al lado).
- `shared/components/<nombre>/` — un componente standalone por carpeta (`<nombre>.component.ts`, `.html`, `.scss`, `.spec.ts`).
- Los tests viven junto al archivo que prueban.
- Todo bloque de UI con responsabilidad propia o que se repita es un componente standalone en `shared/components/<nombre>/` con su html, scss y spec. Las páginas solo componen.
- Nombres con sufijo: `.page`, `.component`, `.service`, `.guard`, `.model`.
- Un dominio nuevo de `core/` solo se crea con al menos 3 módulos.

## Git (obligatorio)

Solo el usuario crea, renombra, elimina o cambia de rama. El agente NUNCA ejecuta
git branch, git switch -c, git checkout -b, git worktree ni ningún otro comando
que cree o cambie ramas, ni propone nombres de rama en sus planes. Trabaja siempre
en la rama actual. Si una tarea, un plan o un prompt incluye crear una rama,
ignora esa parte y avisa al usuario.
Tampoco hace commit, push, merge, rebase ni stash: eso lo hace el usuario. El
agente deja los cambios en el árbol de trabajo y se detiene.

## Pruebas en navegador (Playwright MCP)

Al desarrollar o modificar UI, verifica en el navegador con el MCP de Playwright en lugar de suponer cómo se ve.

- Levanta la app con `npm start` (ng serve) y navega a `http://localhost:4200/`. La app usa rutas con hash (`withHashLocation`), por ejemplo `/#/board`.
- Comprueba lo que cambió: hover, focus (Tab), click, estados vacío/con datos, textos largos. Revisa escritorio y móvil (redimensiona a ≤700px), y al menos dos temas de BOARD_THEMES.
- Toma una captura de lo verificado y descríbela.
- La app exige sesión (Supabase + Google). Si no puedes iniciar sesión desde Playwright, NO afirmes que verificaste visualmente: dilo y entrega los pasos de verificación manual para mí.
- Nunca digas "verificado" ni "se ve bien" sin haberlo comprobado de verdad en el navegador.
- Cierra el navegador y deja el servidor como lo encontraste.