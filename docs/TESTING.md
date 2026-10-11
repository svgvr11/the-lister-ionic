# Pruebas (guía para no expertos)

Este proyecto usa **Vitest** como único runner de pruebas (a través de `ng test`).
Las pruebas viven en archivos `*.spec.ts` **junto al código que prueban**.

---

## 1. Cómo correr las pruebas

```bash
npm test           # corre todo una vez y termina (modo CI)
npm run test:watch # se queda mirando y repite al guardar cambios
npm run test:legacy   # los 5 scripts antiguos que siguen en scripts/
```

Para correr **un solo archivo** (útil mientras trabajas en algo concreto):

```bash
npx ng test --include="src/app/core/trash.spec.ts"
```

> `--include` acepta ponerlo varias veces para correr varios archivos.

---

## 2. Cómo leer un fallo

Cuando algo falla, Vitest imprime un bloque así:

```
 FAIL  ... spec-app-core-trash.spec.js > trash: plazo del basurero > el plazo son 7 días
AssertionError: expected 8 to be 7

 ❯ src/app/core/trash.spec.ts:38:31
```

Lélo de arriba abajo:

1. **Qué prueba falló** — la línea larga: archivo > grupo (`describe`) > prueba (`it`).
2. **Qué se esperaba y qué se obtuvo** — `expected 8 to be 7` significa: *esperaba 7, llegó 8*.
3. **Dónde** — `src/app/core/trash.spec.ts:38` es el archivo y la línea exacta.

Si el fallo está dentro de un `expect(() => ...).toThrow(...)`, el mensaje suele ser
`expected function to throw error, but it didn't` → el código **no** lanzó cuando debía.

**Regla de oro:** el test tiene casi siempre razón. Si falla, primero sospecha del código
de producción; solo si lees el test y ves que la expectativa está mal escrita, corrige el test.

---

## 3. Cómo escribir una prueba nueva

Copia este molde y cámbialo. Cada `it` es **un caso** con una idea sola.

```ts
import { describe, expect, it } from 'vitest';
import { daysLeft } from './trash';

describe('trash: cuenta atrás', () => {
  it('una lista descartada hoy tiene 7 días por delante', () => {
    const hoy = new Date('2026-06-01T12:00:00.000Z');
    expect(daysLeft(hoy.toISOString(), hoy)).toBe(7);
  });

  it('una lista descartada hace 6 días está en su último día', () => {
    const hoy = new Date('2026-06-01T12:00:00.000Z');
    const haceSeisDias = new Date(hoy.getTime() - 6 * 86_400_000).toISOString();
    expect(daysLeft(haceSeisDias, hoy)).toBe(1);
  });
});
```

Las piezas:

| Pieza | Para qué sirve |
|---|---|
| `describe('...')` | Agrupa pruebas del mismo tema. Es solo organización. |
| `it('...')` | Un caso. El nombre dice **qué debe pasar**, en español. |
| `expect(valor)` | Abre una comprobación. |
| `.toBe(7)` | Igualdad exacta (números, strings, booleanos). |
| `.toEqual({...})` | Igualdad de objetos/arrays completos. |
| `.toThrow(/texto/)` | La función debe lanzar un error. |
| `.toBeNull()` / `toBeUndefined()` | El valor debe ser nulo / no existir. |
| `.not.toBe(0)` | Negación: "no debe ser 0". |

Los `import` van **siempre del código real** (`./trash`), nunca copies la lógica dentro
del test: si copias, el test pasará aunque el código de producción esté roto.

### Convención de nombres

- Archivo: `lo-que-prueba.spec.ts` al lado del archivo probado (`trash.ts` → `trash.spec.ts`).
- `describe`: `módulo: tema` (p. ej. `trash: purga`).
- `it`: frase en español que describe **el comportamiento**, no el mecanismo.
  - Bien: `"una lista descartada hace 7 días se purga"`.
  - Mal: `"llama a filter y comprueba length"`.

---

## 4. Qué es un mock (y un ejemplo)

Un **mock** es un objeto falso que se pone en el sitio de una dependencia real, para que la
prueba no toque el mundo exterior (nube, navegador, reloj).

Se usa cuando el código necesita algo que en un test no existe o no quieres ejecutar:
`localStorage`, el cliente de Supabase, el `Router`, `Date`, los observadores del DOM…

Ejemplo real de este proyecto (`board-themes.spec.ts`): el tema se guarda en
`localStorage`, que no existe al correr pruebas. En vez de usar el de verdad, se inyecta
uno falso con la misma forma:

```ts
const fakeStorage = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => data.set(key, String(value))
  };
};

it('guardar y leer devuelve el mismo tema', () => {
  const storage = fakeStorage();                 // ← el mock
  storeTheme(temaRose, storage);                 // el código real, con el mock dentro
  expect(readStoredTheme(storage).id).toBe('rose');
});
```

Fíjate en lo importante: **la función probada es la de verdad**. El mock solo sustituye
al almacenamiento. Por eso el test detecta un fallo real.

Para código que usa `inject()` de Angular (servicios, guardas) se usa `TestBed` con
`useValue`, como en `src/app/core/services/auth.guard.spec.ts`.

### Limitación del runner: `vi.mock` NO funciona

El runner de pruebas es el builder experimental `@angular/build:unit-test` con Vitest.
Compila los specs con el mismo pipeline que el build, y por eso **`vi.mock(...)` con
factoría no tiene efecto**: el módulo real se usa siempre. Se comprobó con un módulo de
prueba; no es un error de sintaxis.

Consecuencias prácticas, y cómo se resolvieron:

| Problema | Solución usada |
|---|---|
| Sustituir `environment.supabase` | El cliente de Supabase se inyecta por el token `SUPABASE_CLIENT`, que la app ya usa. En los tests se pasa uno falso con `{ provide: SUPABASE_CLIENT, useValue: clienteFalso }`. |
| Sustituir plugins de Capacitor (`App`, `Browser`) | Son proxies sin propiedades propias: ni `vi.spyOn` ni asignar la propiedad funcionan. Lo que sí se puede es sustituir `Capacitor.isNativePlatform` (objeto normal) y, para el navegador, comprobar la decisión en vez del efecto. |
| Llegar a métodos privados | Se llaman con un cast: `(servicio as unknown as { metodo: (…) => … }).metodo(…)`. |

Si en el futuro hace falta mockear módulos de verdad (por ejemplo para probar Edge
Functions), hay que cambiar de runner a Vitest directo (`vitest.config.ts`), perdiendo la
compilación de Angular para los specs.

---

## 5. Clientes de Supabase falsos

En `src/app/core/services/testing/` hay dos helpers reutilizables:

- `fake-supabase.ts` → tablero (`boards`): búsquedas, inserciones, guardados por versión,
  canal de realtime y `realtime.setAuth`. Usado por `supabase-board.repository.spec.ts`.
- `fake-auth-client.ts` → autenticación: `getSession`, `onAuthStateChange`,
  `signInWithOAuth`, `exchangeCodeForSession`, `signOut`, `refreshSession` y
  `functions.invoke`. Usado por `auth.service.spec.ts`.

Ambos guardan un historial de llamadas legible (`s.llamadas`), que es lo que se comprueba
en las aserciones.

---

## 6. Estado actual de la cobertura

**En Vitest (`npm test`, 403 casos):**

Lógica pura del core (`src/app/core/`):

| Archivo | Casos |
|---|---|
| `list-retention.spec.ts` | 21 |
| `edit-contrast.spec.ts` | 37 |
| `limits.spec.ts` | 13 |
| `board-themes.spec.ts` | 10 |
| `session-order.spec.ts` | 9 |
| `session-guard.spec.ts` | 9 |
| `inline-edit.spec.ts` | 8 |
| `trash.spec.ts` | 7 |
| `masonry-layout.spec.ts` | 7 |
| `board-merge.spec.ts` | 6 |
| `board-view.spec.ts` | 6 |
| `archive.spec.ts` | 5 |
| `board-sync.spec.ts` | 5 |
| `overlay-stack.spec.ts` | 5 |
| `delete-account.spec.ts` | 5 |
| `board-serialization.spec.ts` | 19 |
| `board-list-rules.spec.ts` | 36 |
| `board-task-rules.spec.ts` | 38 |
| `board-conflict-rules.spec.ts` | 30 |
| `focus-notice.spec.ts` | 3 |
| `google-auth.spec.ts` | 2 |

Servicios (`src/app/core/services/`):

| Archivo | Casos |
|---|---|
| `supabase-board.repository.spec.ts` | 30 |
| `auth.service.spec.ts` | 26 |
| `local-board.repository.spec.ts` | 19 |
| `session-guard.service.spec.ts` | 18 |
| `board-order.service.spec.ts` | 14 |
| `board-session.service.spec.ts` | 12 |
| `auth.guard.spec.ts` | 3 |

**Siguen como scripts de Node (`npm run test:legacy`, 50 casos):**

- `scripts/test-feedback.mjs` — compara byte a byte `src/app/core/feedback-core.ts` con
  `supabase/functions/_shared/feedback-core.ts` (la Edge Function tiene su propia copia) y
  simula el flujo de subida del servidor. Necesita `node:fs` y rutas fuera de `src/`.
- `scripts/test-delete-account.mjs` — prueba `supabase/functions/delete-account/core.ts`,
  que es código del servidor (Deno), no de la app.
- `scripts/test-version.mjs`, `test-android-version.mjs`, `test-apk-name.mjs` — prueban los
  scripts de build y archivos de Android, no código de la app.

---

## 7. Si algo no funciona

- **`ng test` se queja de tipos** → el spec usa algo que no existe o le faltan campos a un
  molde de prueba. El error señala archivo y línea.
- **Quiero saltarme un test** sin borrarlo: cámbialo a `it.skip(...)` y deja un comentario
  con el motivo. No lo dejes fallando en silencio.
- **Un test migrado revela un fallo real del código** → no lo "arregles" tocando la
  expectativa. Déjalo con `it.skip`, anótalo y avisa.
