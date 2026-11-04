# Despliegue y build — The Lister

## Comandos disponibles

| Comando | Propósito |
|---|---|
| `npm start` | Servidor de desarrollo (web) |
| `npm run start:mock` | Modo mock (sesión demo, fixture en memoria, sin Supabase) |
| `npm run build` | Build de producción Angular |
| `npm run build:mock` | Build con configuración mock |
| `npm test` | Ejecutar tests Vitest una vez |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:legacy` | Los 5 scripts antiguos de Node (feedback, delete-account, version, android-version, apk-name) |
| `npm run version:bump -- --major\|--feature\|--build` | Subir versión |
| `npm run bundle` | Build producción + sync versión Android + `.aab` firmado |
| `npm run bundle:check` | Verificar firma del `.aab` con `jarsigner` |
| `npm run apk` | Build debug + APK |
| `npm run watch` | Build en modo watch (desarrollo) |

## Build de producción

1. `npm run build` compila en modo producción (`environment.prod.ts`).
2. Output: `dist/the-lister-ionic/browser/`.
3. Presupuestos: initial 2 MB warning / 5 MB error; component style 70 KB warning / 100 KB error.

## Build para Google Play (AAB firmado)

1. Generar keystore con `keytool` (fuera del repo, nunca subir):
   ```bash
   keytool -genkey -v -keystore android/the-lister-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias the-lister-key
   ```
2. Crear `android/keystore.properties` (gitignored):
   ```properties
   storeFile=the-lister-release-key.jks
   storePassword=TU_CONTRASEÑA_STORE
   keyAlias=the-lister-key
   keyPassword=TU_CONTRASEÑA_KEY
   ```
3. Ejecutar `npm run bundle` (compila, sincroniza versión Android, valida que no haya live reload, compila `.aab` firmado).
4. Verificar con `npm run bundle:check` (`jarsigner`).

## Build de debug (APK)

`npm run apk`: build + sync versión Android + `cap sync android` + `./gradlew assembleDebug` + renombrar APK.

Funciona sin `keystore.properties` ni `version.properties` (usa valores por defecto).

## Configuración de entorno

- `src/environments/environment.example.ts`: plantilla con placeholders.
- `src/environments/environment.ts`: valores reales (gitignored).
- `src/environments/environment.prod.ts`: producción (gitignored).
- `src/environments/environment.mock.ts`: modo mock.

Configurar `supabase.url` y `supabase.anonKey` para habilitar sincronización y login.

## Supabase (configuración manual)

1. Crear proyecto en Supabase.
2. Ejecutar `supabase/schema.sql` en SQL Editor (crea `boards`, RLS, bucket `note-attachments`, publica en realtime).
3. Ejecutar `supabase/feedback.sql` (crea `feedback_reports`, bucket `feedback-attachments`).
4. Ejecutar `supabase/feedback-cron.sql` (pg_cron para limpieza de 90 días).
5. Configurar Google en Authentication > Sign In / Providers.
6. Agregar URI de redirección autorizada en Google Cloud Console.
7. Agregar URLs locales y de producción en Supabase > Authentication > URL Configuration.
8. Configurar secretos en Edge Functions: `RESEND_API_KEY`, `FEEDBACK_TO`, `CLEANUP_SECRET`.
9. Desplegar Edge Functions: `submit-feedback` (verify_jwt: TRUE), `feedback-cleanup` (verify_jwt: FALSE).
10. Verificar dominio `feedback@soporte.atenis.app` en Resend.

## Publicación

1. `npm run version:bump` (asegurar `versionCode` estrictamente creciente).
2. `npm run bundle` (generar `.aab` firmado).
3. Subir `.aab` a Google Play Console (prueba interna o cerrada).
4. Publicar build web en `thelister.atenis.app`.

## Lo que no debe modificarse sin autorización

- `capacitor.config.ts` (appId `app.atenis.thelister`, appName `The Lister`).
- Deep link `dev.vmunoz.thelister://auth/callback`.
- Dominio `thelister.atenis.app`, correo `feedback@soporte.atenis.app`.
- Keystore y `keystore.properties` (fuera del repo).