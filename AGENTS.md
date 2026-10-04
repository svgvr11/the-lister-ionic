# AGENTS.md — reglas permanentes del proyecto

## Versión (obligatorio)

Antes de empezar cualquier cambio, ejecuta `git status --porcelain`. Si el árbol está
limpio (sin archivos modificados ni nuevos sin seguir; los ignorados por `.gitignore` no
cuentan), ejecuta `npm run version:bump` como **PRIMERA acción**. Solo sube la versión
una vez por cada paso de limpio a con cambios: si ya hay cambios sin commitear, no la
subas otra vez.

La versión se lee siempre de `src/app/core/app-version.ts`; nunca se escribe a mano en
plantillas ni en otros archivos. La interfaz muestra `APP_VERSION_LABEL` (con la "v"
delante), y las plantillas nunca llevan un "v1.x" escrito a mano.

`npm run version:bump` sube solo el número menor y conserva el sufijo
(1.9-alpha → 1.10-alpha → 1.11-alpha). No toca `package.json` ni el proyecto de Android:
`android/app/build.gradle` sigue siendo la fuente de la versión de Google Play.

## Other sources of version (English quick note)

`package.json` has a `version` field and `android/app/build.gradle` has `versionName` /
`versionCode`. Neither is the app version: the single source of truth is
`src/app/core/app-version.ts`.
