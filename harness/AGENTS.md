# Harness — Orquestador del proyecto The Lister

Este documento es el sistema de gobierno técnico del proyecto. Cualquier agente que trabaje en este repositorio debe leerlo antes de hacer cualquier cambio.

## 1. Identidad y propósito del proyecto

**The Lister** es un clon funcional de tablero de checklist (tipo Trello) construido con Angular 20 (standalone), Ionic 8 y Capacitor 8. Funciona como aplicación web y APK para Android.

- **Producto**: tableros de checklist con listas, tareas, reordenamiento, pin, basurero (7 días), archivo (60 días), notas con adjuntos, sincronización multiplataforma vía Supabase, feedback de usuario.
- **Distribución**: web en `thelister.atenis.app` y APK/Android en Google Play (`app.atenis.thelister`, `dev.vmunoz.thelister` como deep link).
- **Backend**: Supabase (Auth con Google OAuth, PostgreSQL + RLS, Realtime, Storage, Edge Functions).
- **Única fuente de versión**: `src/app/core/app-version.ts` (formato `MAYOR.FEATURE.BUILD-a`).

## 2. Alcance de las reglas

Las reglas del Harness aplican a cualquier agente que modifique código, documentación, configuración o archivos de generación del repositorio. No se aplican al usuario: el usuario tiene autoridad total y puede override cualquier regla.

## 3. Jerarquía de autoridad

1. Instrucciones explícitas y recientes del usuario.
2. Decisiones confirmadas del proyecto (`harness/progress/decisiones.md`, `AGENTS.md` raíz, `README.md`).
3. Reglas del orquestador y controles de salida (`harness/checks/reglas-de-salida.md`).
4. Documentación especializada (`harness/docs/`).
5. Documentación general (`README.md`, `docs/TESTING.md`).
6. Código, pruebas y configuración como evidencia de la implementación.
7. Documentación histórica.

La jerarquía no permite ignorar evidencia. Si una decisión aprobada no coincide con la implementación, identifica la discrepancia y consulta al usuario.

## 4. Procedimiento obligatorio de inicio de tareas

Antes de editar cualquier archivo:

1. Leer `AGENTS.md` (raíz).
2. Leer `harness/AGENTS.md` (este documento).
3. Leer `harness/tasks/actual.md` (tarea activa). Si no hay tarea activa, no implementar nada.
4. Leer `harness/checks/reglas-de-salida.md` (Definition of Done).
5. Inspeccionar el estado real del repositorio (no presupongas).
6. Identificar fuentes canónicas y archivos generados.
7. Entender el comportamiento actual antes de cambiar nada.
8. Presentar un plan breve al usuario (o proceder si la tarea es pequeña y no requiere consulta).
9. Consultar decisiones materiales pendientes si las hay.

## 5. Principios de autonomía

El agente **puede** sin autorización previa:

- Investigar, planificar, implementar, probar y corregir problemas técnicos locales.
- Tomar decisiones técnicas locales, reversibles y de bajo riesgo que no contradigan decisiones existentes.
- Corregir bugs dentro de un módulo sin cambiar su contrato.
- Añadir tests y specs para lógica nueva o existente.
- Refactorizar dentro de un dominio manteniendo la API pública.
- Crear componentes standalone siguiendo el patrón existente.
- Actualizar documentación afectada por un cambio aprobado.

El agente **debe consultar al usuario antes de**:

- Cambiar requisitos o comportamiento del producto.
- Modificar decisiones de UX o reglas de negocio aprobadas.
- Cambiar framework, runtime o arquitectura principal.
- Introducir o retirar dependencias importantes.
- Modificar contratos, APIs o esquemas de datos con impacto amplio.
- Cambiar autenticación, autorización o controles de seguridad.
- Realizar operaciones destructivas o irreversibles.
- Modificar servicios externos, datos persistentes o configuraciones remotas.
- Ejecutar migraciones, sincronizaciones o despliegues.
- Añadir servicios pagos o tratamientos de datos personales no previstos.

La autorización es específica: aprobar una operación no autoriza automáticamente otras operaciones relacionadas.

## 6. Arquitectura y decisiones protegidas

Las siguientes decisiones están protegidas y no pueden cambiarse por iniciativa del agente:

- **Stack**: Angular 20 + Ionic 8 + Capacitor 8, routing con hash location.
- **Backend**: Supabase con RLS; tablas heredadas eliminadas; board en `boards.board_data` JSONB.
- **Auth**: solo Google OAuth (PKCE), `prompt: select_account`.
- **Versionado**: `MAYOR.FEATURE.BUILD-a` en `src/app/core/app-version.ts`, bump solo por decisión del usuario.
- **Git**: usuario controla ramas, commits, push, merge. Agente nunca toca Git.
- **Zona horaria**: dispositivo en producción; fijas solo en tests.
- **Estructura de `src/app/`**: core/ (lógica pura), guards/, models/, pages/, services/, shared/components/.
- **Lógica pura**: extraída a `core/` sin dependencias de Angular/DI/DOM.
- **Duplicación feedback-core**: `src/app/core/feedback/feedback-core/feedback-core.ts` ≡ `supabase/functions/_shared/feedback-core.ts` (verificado por `test:feedback`).

## 7. Investigación y planificación

Para cambios medianos o grandes, el agente debe identificar antes de implementar:

- Comportamiento actual.
- Causa del problema.
- Componentes involucrados.
- Dependencias y consumidores.
- Contratos afectados.
- Riesgos.
- Criterios de aceptación.
- Pruebas necesarias.

## 8. Fuentes canónicas y archivos generados

| Elemento | Fuente canónica | Generados / derivados | No editar manualmente |
|---|---|---|---|
| Versión app | `src/app/core/app-version.ts` | `package.json`, `android/app/version.properties`, `capacitor.config.ts` | `android/app/version.properties` |
| Feedback core | `src/app/core/feedback/feedback-core/feedback-core.ts` | `supabase/functions/_shared/feedback-core.ts` | `supabase/functions/_shared/feedback-core.ts` |
| Android version | `src/app/core/app-version.ts` (via `scripts/android-version.mjs`) | `android/app/version.properties` | `android/app/version.properties` |
| Board schema | `supabase/schema.sql` | DB en Supabase | Tablas heredadas (ya eliminadas) |

Si un archivo se genera automáticamente, modifica su fuente y regenera el artefacto.

## 9. Política de dependencias

- No añadir dependencias sin aprobación del usuario.
- No quitar dependencias sin evaluar su impacto.
- Verificar que la dependencia no exista ya en el proyecto antes de proponerla.
- Preferir librerías ya presentes en `package.json`.

## 10. Versionamiento

- Formato: `MAYOR.FEATURE.BUILD-a` (ej. `1.63.1-a`).
- Fuente: `src/app/core/app-version.ts`.
- Bump: `npm run version:bump -- --major | --feature | --build`.
- Después de cada tarea que modifique código, preguntar al usuario qué tipo de subida desea. No deducirlo ni ejecutarlo antes de recibir respuesta.
- `npm run test:version` para validar.

## 11. Política de Git

- El agente **nunca** ejecuta: `git branch`, `git switch`, `git checkout -b`, `git worktree`, `git commit`, `git push`, `git merge`, `git rebase`, `git stash`.
- El agente trabaja en la rama actual y deja los cambios en el árbol de trabajo.
- Al finalizar, el agente sugiere un mensaje de commit pero no lo ejecuta.
- No descartar cambios preexistentes ni sobrescribir trabajo ajeno.

## 12. Actualización de documentación

- Registrar decisiones nuevas en `harness/progress/decisiones.md`.
- Actualizar arquitectura si cambia realmente.
- Actualizar especificaciones si se aprueba un cambio de producto.
- Mantener el backlog en `harness/tasks/pendientes.md`.
- Registrar hitos importantes en `harness/progress/historial.md`.
- Distinguir claramente entre aprobado, implementado, probado y validado.

## 13. Gestión de tareas y backlog

- `harness/tasks/actual.md`: una única tarea activa.
- `harness/tasks/pendientes.md`: backlog con identificador, prioridad, descripción, contexto, dependencias, criterios de finalización, estado.
- No inventar prioridades ni compromisos que el usuario no haya aprobado.

## 14. Informe obligatorio de cierre

Al terminar una tarea, informar:

1. Qué cambió.
2. Por qué cambió.
3. Archivos o módulos afectados.
4. Pruebas ejecutadas y resultados.
5. Pruebas no ejecutadas y motivo.
6. Riesgos y limitaciones.
7. Documentación actualizada.
8. Backlog y decisiones actualizados.
9. Acciones externas pendientes.
10. Versionamiento, si corresponde.
11. Mensaje de commit sugerido, si aplica.

No ocultar errores ni presentar pruebas fallidas como exitosas.

## 15. Definition of Done

Ver `harness/checks/reglas-de-salida.md`.

---

**Principio central**: autonomía acotada. Libertad para problemas técnicos locales, reversibles y de bajo riesgo; sin autoridad para cambiar dirección, arquitectura, seguridad o decisiones fundamentales sin autorización explícita del usuario.