# Versionamiento — The Lister

## Fuente canónica

**Archivo**: `src/app/core/app-version.ts`

```ts
export const APP_VERSION = '1.63.1-a';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
```

- `APP_VERSION`: formato `MAYOR.FEATURE.BUILD-a` (ej. `1.63.1-a`).
- `APP_VERSION_LABEL`: se muestra en la interfaz (con la "v" delante).
- **Ningún otro archivo escribe la versión a mano.**

## Formato

| Componente | Significado | Cuándo sube |
|---|---|---|
| MAYOR | Versión importante | Solo si el usuario lo pide (`--major`) |
| FEATURE | Feature en desarrollo | Cuando el árbol está limpio (`--feature`) |
| BUILD | Compilación dentro del feature | Cuando hay cambios sin commitear (`--build`) |
| Sufijo | `-a` | Se conserva al subir |

## Herramientas

### `npm run version:bump -- --major|--feature|--build`

Ejecuta `scripts/bump-version.mjs`, que reescribe solo la línea de `APP_VERSION` en `app-version.ts`.

- Exige exactamente un tipo de subida (`--major`, `--feature` o `--build`).
- `--dry-run` opcional: solo muestra "vieja → nueva (motivo)" sin escribir.
- No toca `package.json` ni el proyecto de Android.
- Pruebas: `npm run test:version`.

### `scripts/android-version.mjs`

Genera `android/app/version.properties` a partir de `app-version.ts`.

- `versionCode = MAYOR * 1_000_000 + FEATURE * 1_000 + BUILD`.
- Límites: `MAYOR ≤ 2099`, `FEATURE ≤ 999`, `BUILD ≤ 999`.
- Ejecutado por `npm run bundle` y `npm run apk`.

## Archivos derivados (no editar manualmente)

| Archivo | Origen | Cómo se regenera |
|---|---|---|
| `android/app/version.properties` | `app-version.ts` | `scripts/android-version.mjs` (vía `bundle`/`apk`) |
| `package.json` (`version`) | Derivado | Automático (no editar a mano) |
| `capacitor.config.ts` | Sin versión | N/A |

## Política de bump por tarea

Después de cada tarea que modifique código:

1. El agente pregunta al usuario qué tipo de subida desea (Mayor / Feature / Build / Ninguna).
2. El usuario responde con una opción cerrada.
3. El agente ejecuta UNA sola vez el comando correspondiente **antes de editar nada**.
4. Si la tarea no modifica archivos, no se pregunta ni se ejecuta el script.

No deducir el tipo de subida del estado del árbol de cambios. Una respuesta anterior no se reutiliza para tareas posteriores.

## Reglas de sincronización

- La versión visible del producto tiene una sola fuente: `app-version.ts`.
- No mantener dos fuentes de verdad para la versión visible.
- `android/app/version.properties` está gitignored (se genera en build).
- `keystore.properties`, `version.properties`, `*.jks`, `*.keystore` están en `.gitignore`.