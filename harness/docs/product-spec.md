# Especificación del producto — The Lister

## Visión

Tablero de checklist personal (estilo Trello) para gestionar listas y tareas, disponible como aplicación web y APK Android, con sincronización multiplataforma vía Supabase.

## Funciones aprobadas

| Área | Función | Estado |
|---|---|---|
| Listas | Crear, editar, eliminar, reordenar, pin (una fijada siempre primera) | Implementado |
| Tareas | Crear, marcar/desmarcar, editar, eliminar, tachar completadas | Implementado |
| Basurero | Listas eliminadas van al basurero; purga permanente a los 7 días; restauración o eliminación permanente | Implementado |
| Archivo | Listas 100% completas se archivan; purga a los 60 días | Implementado |
| Notas | Texto enriquecido, imágenes y documentos (max 10 MB/archivo), masonry en escritorio, tarjetas/lista en Android | Implementado |
| Sincronización | Un tablero por usuario en Supabase; RLS; realtime entre dispositivos | Implementado |
| Autenticación | Google OAuth (PKCE), `prompt: select_account`; modo local fallback | Implementado |
| Feedback | Texto, hasta 5 imágenes, diagnóstico con lista blanca; retención 90 días; 5/hora y 20/día | Implementado |
| Temas | 6 temas de color; seleccionado por dispositivo, no sincronizado | Implementado |
| Bienvenida | Guía por dispositivo y usuario; variantes escritorio (4) y móvil (3) | Implementado |
| Donación | Botón Ko-fi (solo web, no en APK) | Implementado |

## Plataformas objetivo

- Web: `thelister.atenis.app`
- Android: APK/AAB, `app.atenis.thelister`, deep link `dev.vmunoz.thelister://auth/callback`

## Reglas de negocio confirmadas

1. Un tablero por usuario; `boards.board_data` JSONB contiene todo.
2. Basurero: 7 días, cuenta atrás con colores (gris → ámbar → rojo).
3. Archivo: 60 días, solo listas 100% completas.
4. Máximo 50 listas en tablero (basurero y archivo no cuentan).
5. Título de lista: máximo 90 caracteres, normalizado.
6. Fecha inválida en basurero/archivo nunca purga.
7. Pin: una lista fijada va siempre primera; no se arrastra ni se pasa.
8. Orden de listas decidido por el usuario (`position`); no hay orden aleatorio por sesión.
9. Zona horaria del dispositivo en producción; fijas solo en tests.
10. Feedback: máximo 5 imágenes, 5 MB total, diagnóstico sin contenido de listas/tareas.

## Funcionalidades pendientes (no implementadas)

- Ninguna confirmada por el usuario en esta versión.

## Lo que no se debe modificar sin autorización

- Stack (Angular/Ionic/Capacitor), routing hash location.
- Backend Supabase, RLS, tablas heredadas eliminadas.
- Auth solo Google OAuth, `prompt: select_account`.
- Versionado `MAYOR.FEATURE.BUILD-a`.
- Git: usuario controla ramas, commits, push.
- Zona horaria dispositivo en producción.
- Estructura de `src/app/` y patrón core/servicios/páginas/componentes.
- Duplicación feedback-core (byte a byte entre app y Edge Functions).