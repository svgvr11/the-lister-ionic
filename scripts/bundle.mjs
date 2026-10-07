/**
 * Script para generar el Android App Bundle (.aab) firmado para producción.
 * Pasos:
 * 1. ng build (configuración production)
 * 2. node scripts/android-version.mjs (genera android/version.properties)
 * 3. npx cap sync android
 * 4. Verifica que android/app/src/main/assets/capacitor.config.json NO contiene server.url (live reload)
 * 5. cd android && ./gradlew bundleRelease
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { raiz } from './android-version.mjs';

function run(cmd, args, cwd = raiz) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    encoding: 'utf8'
  });
  if (res.error) {
    throw new Error(`Error ejecutando ${cmd}: ${res.error.message}`);
  }
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

export function ejecutar() {
  console.log('1. Compilando aplicación Angular (producción)...');
  run('npm', ['run', 'build']);

  console.log('2. Generando android/version.properties desde app-version.ts...');
  run('node', ['scripts/android-version.mjs']);

  console.log('3. Sincronizando Capacitor con Android...');
  run('npx', ['cap', 'sync', 'android']);

  console.log('4. Verificando configuración de Capacitor (sin live reload)...');
  const configPath = join(raiz, 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json');
  if (existsSync(configPath)) {
    const configContent = readFileSync(configPath, 'utf8');
    if (configContent.includes('server.url')) {
      console.error('ERROR: Se detectó "server.url" (live reload) en capacitor.config.json. No se puede generar un bundle de producción con live reload activo.');
      process.exit(1);
    }
  }

  console.log('5. Compilando AAB de release con Gradle...');
  run('./gradlew', ['bundleRelease'], join(raiz, 'android'));

  console.log('\n¡Éxito! El App Bundle firmado se encuentra en:');
  console.log('android/app/build/outputs/bundle/release/app-release.aab');
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    ejecutar();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
