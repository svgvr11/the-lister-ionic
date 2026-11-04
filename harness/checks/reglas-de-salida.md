# Reglas de salida — Definition of Done

Una tarea solo puede declararse terminada cuando se hayan verificado los puntos aplicables:

## 1. Criterios de aceptación

- [ ] Se cumplen todos los criterios de aceptación definidos en `harness/tasks/actual.md`.
- [ ] No se introduce comportamiento fuera del alcance de la tarea.

## 2. Integridad arquitectónica

- [ ] No se modifican decisiones protegidas (stack, backend, auth, versionado, Git, zona horaria, estructura `src/app/`, duplicación feedback-core).
- [ ] Se respetan las fuentes canónicas y los archivos generados no se editan manualmente.
- [ ] No se introducen dependencias innecesarias.
- [ ] No se duplica lógica existente.
- [ ] No se refactoriza sin relación con la tarea.

## 3. Seguridad

- [ ] No se introducen vulnerabilidades conocidas.
- [ ] No se exponen credenciales, tokens, claves privadas ni secretos.
- [ ] No se modifican contratos de auth, autorización o controles de seguridad sin autorización.
- [ ] Los datos de usuario quedan protegidos por RLS (supabase).

## 4. Pruebas

- [ ] Se ejecutaron las pruebas unitarias pertinentes (`ng test`).
- [ ] Todo cambio de lógica incluye su test (regla del proyecto).
- [ ] Las pruebas nuevas siguen la convención: `describe('módulo: tema')`, `it('comportamiento')`, specs junto al código.
- [ ] Las pruebas que no pudieron ejecutarse quedan pendientes, nunca marcadas como aprobadas.
- [ ] Se declararon explícitamente las pruebas omitidas y sus motivos.

## 5. Typecheck y lint

- [ ] `npx tsc --noEmit` (o equivalente) pasa sin errores.
- [ ] No hay errores de TypeScript estricto (`strict: true` en `tsconfig.json`).

## 6. Build de producción

- [ ] `npm run build` completa sin errores.
- [ ] Presupuestos de bundle respetados (initial 2 MB, component style 70 KB).

## 7. Regresión

- [ ] No se rompe comportamiento existente (todos los tests previos pasan).
- [ ] Se revisó el diff completo antes de declarar la tarea terminada.

## 8. Archivos generados

- [ ] Si se modificó una fuente que genera artefactos, se regeneraron los artefactos (ej. `app-version.ts` → `android/app/version.properties`).
- [ ] Si se modificó `feedback-core.ts`, se verificó que `supabase/functions/_shared/feedback-core.ts` sea idéntico (`npm run test:feedback`).

## 9. Documentación

- [ ] Se actualizaron los documentos necesarios (`harness/progress/decisiones.md`, `harness/progress/historial.md`, `harness/docs/` si corresponde).
- [ ] No se duplicó información existente.
- [ ] Se distinguió claramente entre aprobado, implementado, probado y validado.

## 10. Tareas y registros

- [ ] `harness/tasks/actual.md` actualizado (estado: terminado).
- [ ] `harness/tasks/pendientes.md` actualizado si corresponde.
- [ ] `harness/progress/historial.md` actualizado con el hito.

## 11. Versionamiento

- [ ] Si el código se modificó, se preguntó al usuario qué tipo de subida de versión desea (Mayor / Feature / Build / Ninguna).
- [ ] Se ejecutó `npm run version:bump` una sola vez antes de editar, con la respuesta del usuario.
- [ ] `npm run test:version` pasa.

## 12. Restricciones de Git

- [ ] No se crearon ni cambiaron ramas.
- [ ] No se hicieron commits, push, merge, rebase ni stash.
- [ ] No se descartaron cambios preexistentes.
- [ ] Se sugirió un mensaje de commit al usuario (sin ejecutarlo).

## 13. Reporte final

- [ ] Se presentó el informe obligatorio de cierre (qué cambió, por qué, archivos afectados, pruebas, riesgos, documentación, backlog, acciones pendientes, versión, mensaje de commit sugerido).
- [ ] No se ocultaron errores ni se presentaron pruebas fallidas como exitosas.

## 14. Validaciones externas pendientes (declarar explícitamente)

- [ ] Pruebas en navegador (Playwright MCP, `npm run start:mock`, `http://localhost:4200/#/board`) — indicar si se ejecutó o pendiente.
- [ ] Pruebas en dispositivo real / APK — indicar si pendiente.
- [ ] Despliegue a Supabase / Google Play — indicar si pendiente (requiere autorización del usuario).

**Nota**: Una prueba que no pudo ejecutarse debe quedar pendiente, nunca marcada como aprobada. No afirmar que algo está validado en producción si solamente se probó localmente.