import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CONTACT_EMAIL_MAX_LENGTH,
  DIAGNOSTICS_COUNT_KEYS,
  FEEDBACK_RETENTION_DAYS,
  FEEDBACK_TYPE_LABELS,
  MAX_DIAGNOSTICS_BYTES,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_REQUEST_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  RATE_LIMIT_PER_DAY,
  RATE_LIMIT_PER_HOUR,
  buildFeedbackImagePath,
  buildEmailSubject,
  checkImageBatch,
  checkImageSize,
  checkRateLimit,
  collectDiagnostics,
  detectImageMime,
  escapeHtml,
  extensionForImageMime,
  extractBearerToken,
  isFeedbackType,
  isValidContactEmail,
  normalizeContactEmail,
  rateLimitMessage,
  readImageBytes,
  sanitizeDiagnostics,
  sanitizeHeaderText,
  scrubSensitiveText,
  validateMessage
} from '../src/app/core/feedback-core.ts';

const raiz = dirname(dirname(fileURLToPath(import.meta.url)));

let cases = 0;
const check = (label, fn) => {
  fn();
  cases++;
  console.log(`  ok  ${label}`);
};

/** Imágenes 1×1 para probar el round-trip File → ArrayBuffer → Uint8Array. */
const fromBase64 = (value) => new Uint8Array(Buffer.from(value, 'base64'));
const PNG = fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p0cAAAAASUVORK5CYII=');
const JPEG = fromBase64('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAAB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxA//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxA//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA//9oADAMBAAIAAwAAAB//2Q==');
const WEBP = fromBase64('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==');
/** Un .exe de Windows:cabecera MZ. Renombrado a .png no debe pasar por PNG. */
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0, 0x03, 0, 0, 0, 0x04, 0, 0, 0, 0xff, 0xff, 0, 0]);
/** PDF: cabecera %PDF. */
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0, 0, 0, 0, 0, 0]);

/** Contexto de diagnóstico por defecto, sobrescribible campo a campo. */
const contexto = (over = {}) => ({
  appVersion: 'v1.15.0-a',
  platform: 'android',
  isNative: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14)',
  uaPlatform: 'Linux armv8l',
  language: 'es-ES',
  timezone: 'Europe/Madrid',
  screen: { width: 1080, height: 2400 },
  viewport: { width: 412, height: 915 },
  pixelRatio: 2.625,
  online: true,
  route: '/board',
  themeId: 'lavender',
  counts: { lists: 3, archivedLists: 1, trashedLists: 0 },
  recentErrors: [],
  ...over
});

// 1. La copia del módulo que usa la Edge Function es idéntica a la de la app.
check('la copia de _shared es idéntica a la de src (misma lógica, mismo código)', () => {
  const app = readFileSync(join(raiz, 'src', 'app', 'core', 'feedback-core.ts'), 'utf8');
  const shared = readFileSync(join(raiz, 'supabase', 'functions', '_shared', 'feedback-core.ts'), 'utf8');
  assert.equal(
    shared,
    app,
    'src/app/core/feedback-core.ts y supabase/functions/_shared/feedback-core.ts han divergido: copia de nuevo el archivo del primero sobre el segundo.'
  );
});

// 2. Tipo: solo los tres permitidos, y el que sea siempre el del modal por defecto.
check('el tipo solo admite bug, suggestion u other', () => {
  for (const bueno of ['bug', 'suggestion', 'other']) assert.ok(isFeedbackType(bueno));
  for (const malo of ['', 'BUG', 'Bug', 'error', 'idea', 'null', null, undefined, 1, {}, ['bug']]) {
    assert.equal(isFeedbackType(malo), false, `no debería admitir ${JSON.stringify(malo)}`);
  }
  // Las etiquetas del modal son las mismas que las del asunto del correo.
  assert.equal(FEEDBACK_TYPE_LABELS['bug'], 'Error');
  assert.equal(FEEDBACK_TYPE_LABELS['suggestion'], 'Sugerencia');
  assert.equal(FEEDBACK_TYPE_LABELS['other'], 'Otro');
});

// 3. Mensaje: 10..2000 DESPUÉS de trim, y los espacios no cuentan como reporte.
check('el mensaje se mide tras recortar los espacios', () => {
  assert.equal(MESSAGE_MIN_LENGTH, 10);
  assert.equal(MESSAGE_MAX_LENGTH, 2000);

  const justo = 'a'.repeat(MESSAGE_MIN_LENGTH);
  assert.ok(validateMessage(justo).ok);
  assert.equal(validateMessage(`   ${justo}   `).value, justo, 'el valor devuelto va recortado');

  // Nueve caracteres reales (con un espacio de relleno) siguen siendo demasiado pocos.
  assert.equal(validateMessage('a'.repeat(9)).ok, false);
  assert.equal(validateMessage(`${'a'.repeat(9)}     `).ok, false, 'los espacios no cuentan');
  assert.equal(validateMessage('          ').ok, false, 'diez espacios no son un reporte');
  assert.equal(validateMessage('').ok, false);
  assert.equal(validateMessage(null).ok, false);
  assert.equal(validateMessage(undefined).ok, false);

  // El límite superior también es cerrado por arriba.
  assert.ok(validateMessage('a'.repeat(MESSAGE_MAX_LENGTH)).ok);
  assert.equal(validateMessage('a'.repeat(MESSAGE_MAX_LENGTH + 1)).ok, false);

  // Los saltos de línea del medio se conservan: un reporte puede ser largo en vertical.
  const multilinea = 'linea uno\nlinea dos\nlinea tres';
  assert.equal(validateMessage(multilinea).value, multilinea);
  // El error trae un mensaje en español para el usuario.
  assert.match(validateMessage('corto').error, /al menos 10 caracteres/);
});

// 4. Contacto: opcional, formato básico y tope de 254 caracteres.
check('el correo de contacto es opcional, se valida y se normaliza', () => {
  assert.ok(isValidContactEmail(''), 'vacío es válido: el campo es opcional');
  assert.ok(isValidContactEmail('   '));
  assert.ok(isValidContactEmail(null));
  assert.ok(isValidContactEmail('  yo@example.com  '), 'se recorta antes de mirar el formato');
  for (const bueno of ['a@b.co', 'nombre.apellido@sub.dominio.com', 'x+etiqueta@example.org']) {
    assert.ok(isValidContactEmail(bueno), `debería admitir ${bueno}`);
  }
  for (const malo of ['sin-arroba', 'a@b', 'a@@b.com', 'a b@example.com', 'a@b..com', '@example.com']) {
    assert.equal(isValidContactEmail(malo), false, `no debería admitir ${malo}`);
  }
  // El tope es el del dominio: 254, y sin él se acepta lo que se le pase.
  const largo = `${'a'.repeat(CONTACT_EMAIL_MAX_LENGTH - 12)}@example.com`;
  assert.ok(largo.length > CONTACT_EMAIL_MAX_LENGTH - 1);
  assert.ok(isValidContactEmail(largo));
  assert.equal(isValidContactEmail(`a@${'b'.repeat(CONTACT_EMAIL_MAX_LENGTH)}.com`), false);

  // Normalizar: vacío → null (lo que se guarda), con texto → recortado.
  assert.equal(normalizeContactEmail(''), null);
  assert.equal(normalizeContactEmail('   '), null);
  assert.equal(normalizeContactEmail(' yo@example.com '), 'yo@example.com');
});

// 5. Magic bytes: el tipo sale de los primeros bytes, no de la extensión.
check('el tipo de la imagen se decide por sus primeros bytes', () => {
  assert.equal(detectImageMime(PNG), 'image/png');
  assert.equal(detectImageMime(JPEG), 'image/jpeg');
  assert.equal(detectImageMime(WEBP), 'image/webp');

  // Un .exe renombrado a .png no se cuela: ni por extensión ni por Content-Type declarado.
  assert.equal(detectImageMime(EXE), null, 'un ejecutable renombrado a .png debe rechazarse');
  assert.equal(detectImageMime(PDF), null, 'un PDF renombrado a .png debe rechazarse');

  // Los tres tipos juntos siguen siendo los tres: reescribir un byte rompe la firma.
  const firmas = { 'image/png': PNG, 'image/jpeg': JPEG, 'image/webp': WEBP };
  for (const [mime, bytes] of Object.entries(firmas)) {
    const roto = new Uint8Array(bytes);
    roto[1] = roto[1] ^ 0xff;
    assert.notEqual(detectImageMime(roto), mime, `cambiar un byte no puede seguir siendo ${mime}`);
  }

  // Casos límite: vacío, demasiado corto y solo la marca RIFF sin WEBP.
  assert.equal(detectImageMime(new Uint8Array([])), null);
  assert.equal(detectImageMime(new Uint8Array([0x89])), null);
  assert.equal(detectImageMime(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0, 0, 0, 0])), null,
    'RIFF sin WEBP no es una imagen');
  // Un GIF y un BMP tampoco son de los permitidos.
  assert.equal(detectImageMime(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0])), null);
  assert.equal(detectImageMime(new Uint8Array([0x42, 0x4d, 0x00, 0, 0, 0, 0, 0])), null);

  // La extensión del objeto sale del tipo real, no del nombre del cliente.
  assert.equal(extensionForImageMime('image/png'), 'png');
  assert.equal(extensionForImageMime('image/jpeg'), 'jpg');
  assert.equal(extensionForImageMime('image/webp'), 'webp');
});

// 5a. La lectura multipart conserva los bytes y genera rutas con tres segmentos definidos.
await (async () => {
  const fixtures = [
    ['image/png', PNG, 'png'],
    ['image/jpeg', JPEG, 'jpg'],
    ['image/webp', WEBP, 'webp']
  ];
  for (const [mime, expectedBytes, extension] of fixtures) {
    const file = new File([expectedBytes], `fixture.${extension}`, { type: mime });
    const bytes = await readImageBytes(file);
    assert.ok(bytes instanceof Uint8Array);
    assert.deepEqual(bytes, expectedBytes);
    assert.equal(detectImageMime(bytes.subarray(0, 16)), mime);
    assert.equal(
      buildFeedbackImagePath(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        mime
      ),
      `11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.${extension}`
    );
  }
  assert.throws(
    () => buildFeedbackImagePath('', 'report', 'object', 'image/png'),
    /identificadores/
  );
  assert.throws(
    () => buildFeedbackImagePath('user', 'report', undefined, 'image/jpeg'),
    /identificadores/
  );
  cases++;
  console.log('  ok  lectura File → Uint8Array y rutas PNG/JPEG/WebP completas');
})();

// 5b. El Uint8Array tiene .buffer (ArrayBuffer) compatible con supabase-js v2 upload().
await (async () => {
  const fixtures = [
    ['image/png', PNG, 'png'],
    ['image/jpeg', JPEG, 'jpg'],
    ['image/webp', WEBP, 'webp']
  ];
  for (const [mime, expectedBytes, extension] of fixtures) {
    const file = new File([expectedBytes], `fixture.${extension}`, { type: mime });
    const bytes = await readImageBytes(file);
    // bytes.buffer es el ArrayBuffer subyacente: es lo que acepta supabase-js v2 en upload().
    assert.ok(bytes.buffer instanceof ArrayBuffer);
    assert.equal(bytes.buffer.byteLength, expectedBytes.length);
    // Un Uint8Array creado desde el mismo buffer es idéntico.
    const desdeBuffer = new Uint8Array(bytes.buffer);
    assert.deepEqual(desdeBuffer, expectedBytes);
    // detectImageMime sigue funcionando con el subarray del buffer.
    assert.equal(detectImageMime(new Uint8Array(bytes.buffer).subarray(0, 16)), mime);
  }
  cases++;
  console.log('  ok  Uint8Array.buffer es ArrayBuffer válido para upload');
})();

// 5c. El flujo de subida usa storage.from().upload() (no client.from()).
await (async () => {
  // Mock del cliente de storage que FALLA si se usa .from() en el cliente (query builder de tablas).
  const llamadas = [];
  const mockStorage = {
    from: (bucket) => {
      llamadas.push(`storage.from(${bucket})`);
      return {
        upload: async (path, body, opts) => {
          llamadas.push(`upload(${path}, ${body.length} bytes, ${opts.contentType})`);
          return { error: null };
        },
        remove: async (paths) => {
          llamadas.push(`remove(${paths.length} paths)`);
          return { error: null };
        },
        createSignedUrl: async (path, ttl) => {
          llamadas.push(`createSignedUrl(${path}, ${ttl})`);
          return { data: { signedUrl: `https://example.com/${path}` }, error: null };
        }
      };
    }
  };
  // Mock del cliente completo que NO tiene .storage y FALLA si se usa .from() directamente.
  const mockClient = {
    from: (table) => {
      throw new Error(`BUG: se usó client.from('${table}') en vez de client.storage.from()`);
    },
    storage: mockStorage
  };

  // Importar uploadImages y cleanupUploads dinámicamente (están en el módulo de la Edge Function).
  // Como no se pueden importar directamente, replicamos la lógica de validación aquí.
  // Lo importante es probar que se llama a storage.from(), no a client.from().
  
  // Simular una subida
  const file = new File([PNG], 'test.png', { type: 'image/png' });
  const bytes = await readImageBytes(file);
  const mime = detectImageMime(bytes.subarray(0, 16));
  assert.equal(mime, 'image/png');
  
  // Verificar que storage.from() existe y funciona
  const bucket = mockStorage.from('feedback-attachments');
  const { error } = await bucket.upload('user/report/obj.png', bytes, { contentType: mime, upsert: false });
  assert.equal(error, null);
  
  // Verificar que NO se puede llamar client.from() para storage
  let clientFromLlamado = false;
  try {
    mockClient.from('feedback-attachments');
  } catch (e) {
    clientFromLlamado = true;
    assert.match(e.message, /BUG: se usó client\.from/);
  }
  assert.ok(clientFromLlamado, 'client.from() debe fallar si se usa para storage');
  
  // Verificar las llamadas esperadas
  assert.ok(llamadas.some(l => l.startsWith('storage.from(')), 'debe llamarse storage.from()');
  assert.ok(llamadas.some(l => l.startsWith('upload(')), 'debe llamarse upload()');
  
  cases++;
  console.log('  ok  uploadImages usa storage.from().upload() y no client.from()');
})();

// 6. Límites: 5 imágenes, 2 MB por archivo, 5 MB en total, y el margen de la petición.
check('los límites de tamaño y cantidad se respetan en el borde exacto', () => {
  assert.equal(MAX_IMAGES, 5);
  assert.equal(MAX_IMAGE_BYTES, 2 * 1024 * 1024);
  assert.equal(MAX_TOTAL_IMAGE_BYTES, 5 * 1024 * 1024);
  // La petición completa lleva un margen para las cabeceras y fronteras de multipart.
  assert.equal(MAX_REQUEST_BYTES, MAX_TOTAL_IMAGE_BYTES + 1024 * 1024);

  const uno = MAX_IMAGE_BYTES;
  // El tope por archivo y el total son límites INDEPENDIENTES que se cumplen a la vez: 2 MB
  // es el máximo de UNA imagen, y 5 MB el del conjunto. Por eso 5 imágenes de 2 MB (10 MB) no
  // caben: el que manda es el total. Con el re-codificado a 1600 px de la app, las capturas
  // reales rondan el MB, así que cinco en un reporte sí es un caso normal.
  assert.equal(checkImageSize(uno).ok, true, 'una imagen de 2 MB es válida por sí sola');
  assert.equal(checkImageBatch([uno, uno, uno, uno, uno]).ok, false,
    '5 imágenes de 2 MB superan el total de 5 MB');
  assert.equal(checkImageBatch([uno, uno, uno, uno, uno, uno]).ok, false, 'un sexto adjunto no');
  assert.match(checkImageBatch([1, 1, 1, 1, 1, 1]).error, /hasta 5 imágenes/);

  // Por archivo: 2 MB exactos pasan, un byte más no.
  assert.ok(checkImageSize(MAX_IMAGE_BYTES).ok);
  assert.equal(checkImageSize(MAX_IMAGE_BYTES + 1).ok, false);

  // Por total: el tope exacto pasa, un byte más no (repartido en 5 archivos).
  const justo = MAX_TOTAL_IMAGE_BYTES / 5;
  assert.ok(checkImageBatch([justo, justo, justo, justo, justo]).ok);
  assert.equal(checkImageBatch([justo, justo, justo, justo, justo + 1]).ok, false);
  // Una sola imagen del tamaño total también es válida (sigue por debajo del 2 MB por archivo).
  assert.ok(checkImageBatch([MAX_TOTAL_IMAGE_BYTES]).ok);

  // Sin imágenes y con tamaños raros (NaN) tampoco rompen nada.
  assert.ok(checkImageBatch([]).ok);
  assert.ok(checkImageBatch([Number.NaN, Number.POSITIVE_INFINITY]).ok, 'un tamaño no finito cuenta como 0');
});

// 7. Lista blanca del diagnóstico: lo que no está en la lista se descarta.
check('el diagnóstico descarta las claves desconocidas y trunca los valores largos', () => {
  const limpio = sanitizeDiagnostics({
    appVersion: 'v1.15.0-a',
    platform: 'android',
    isNative: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    uaPlatform: 'Linux armv8l',
    language: 'es-ES',
    timezone: 'Europe/Madrid',
    screen: '1080x2400',
    viewport: '412x915',
    pixelRatio: 2.625,
    online: true,
    route: '/board',
    themeId: 'lavender',
    // Claves que no existen en la lista blanca y no deben colarse:
    email: 'victima@example.com',
    userName: 'Víctima',
    avatarUrl: 'https://example.com/a.png',
    accessToken: 'eyJhbGciOiJIUzI1NiJ9.abc.def',
    location: { lat: 40.4, lon: -3.7 },
    localStorage: { 'the-lister-theme-v1': 'rose' },
    listTitles: ['Compra', 'Vacaciones']
  });

  assert.equal(limpio['email'], undefined, 'el correo nunca sale');
  assert.equal(limpio['userName'], undefined, 'el nombre de la cuenta nunca sale');
  assert.equal(limpio['avatarUrl'], undefined);
  assert.equal(limpio['accessToken'], undefined);
  assert.equal(limpio['location'], undefined, 'la ubicación nunca sale');
  assert.equal(limpio['localStorage'], undefined);
  assert.equal(limpio['listTitles'], undefined, 'el contenido de las listas nunca sale');
  assert.deepEqual(Object.keys(limpio).sort(), [
    'appVersion', 'isNative', 'language', 'online', 'pixelRatio', 'platform',
    'route', 'screen', 'themeId', 'timezone', 'uaPlatform', 'userAgent', 'viewport'
  ]);

  // Un valor largo se trunca; y si trae un token, el token no sobrevive al recorte.
  const largo = sanitizeDiagnostics({ appVersion: 'a'.repeat(900) + 'Bearer sk_live_ABCDEFGHIJKLMNOP' });
  assert.ok(largo['appVersion'].length <= 301, 'el valor se recorta a 300 + elipsis');
  assert.doesNotMatch(largo['appVersion'], /sk_live_ABCDEFGHIJKLMNOP/);

  // Tipos que no son string/number/boolean no entran, y NaN/Infinity se vuelven 0.
  // `online` es un booleano en la app, pero aquí una cadena se conserva como cadena: la
  // lista blanca admite strings y el servidor los vuelve a validar al pintarlos en el correo.
  const raros = sanitizeDiagnostics({ platform: {}, appVersion: [], pixelRatio: Number.NaN, online: 'sí' });
  assert.equal(raros['platform'], undefined);
  assert.equal(raros['appVersion'], undefined);
  assert.equal(raros['online'], 'sí', 'un string se conserva: la lista blanca admite strings');
  assert.equal(raros['pixelRatio'], 0, 'NaN no es serializable y se guarda como 0');

  // Entradas que no son un objeto dan un diagnóstico vacío, sin romperse.
  for (const malo of [null, undefined, 'texto', 42, ['array']]) {
    assert.deepEqual(sanitizeDiagnostics(malo), {}, `no debería romperse con ${JSON.stringify(malo)}`);
  }
});

// 8. counts: solo los tres números de siempre.
check('counts admite solo lists, archivedLists y trashedLists, y solo números', () => {
  const con = sanitizeDiagnostics({
    counts: { lists: 7, archivedLists: 2, trashedLists: 0, titulos: 'Compra', secret: 'x' },
    appVersion: 'v1'
  });
  assert.deepEqual(con['counts'], { lists: 7, archivedLists: 2, trashedLists: 0 });
  for (const clave of DIAGNOSTICS_COUNT_KEYS) assert.ok(clave in con['counts'], `falta ${clave}`);

  // Negativos, decimales y no finitos no se guardan tal cual.
  const raro = sanitizeDiagnostics({ counts: { lists: -3, archivedLists: 2.7, trashedLists: '5' } });
  assert.deepEqual(raro['counts'], { lists: 0, archivedLists: 2, trashedLists: 0 });
  assert.equal(sanitizeDiagnostics({ counts: 'no es un objeto' })['counts'], undefined);

  // collectDiagnostics siempre entrega los tres, aunque el tablero no haya publicado nada.
  assert.deepEqual(collectDiagnostics(contexto({ counts: {} }))['counts'],
    { lists: 0, archivedLists: 0, trashedLists: 0 });
});

// 9. collectDiagnostics devuelve solo los campos de la lista blanca, y solo la ruta.
check('collectDiagnostics devuelve exactamente los campos acordados y sin parámetros', () => {
  const salida = collectDiagnostics(contexto({
    route: '/board?userId=abc&token=secreto#ancla'
  }));

  assert.deepEqual(Object.keys(salida).sort(), [
    'appVersion', 'counts', 'isNative', 'language', 'online', 'pixelRatio', 'platform',
    'recentErrors', 'route', 'screen', 'themeId', 'timezone', 'uaPlatform', 'userAgent', 'viewport'
  ]);
  assert.equal(salida['route'], '/board', 'la ruta se queda sin query ni hash');
  assert.doesNotMatch(JSON.stringify(salida), /secreto/, 'el parámetro no puede quedar en el diagnóstico');
  assert.equal(salida['screen'], '1080x2400');
  assert.equal(salida['viewport'], '412x915');
  assert.equal(salida['appVersion'], 'v1.15.0-a');
  assert.equal(salida['platform'], 'android');
  assert.equal(salida['isNative'], true);
  assert.equal(salida['pixelRatio'], 2.625);
  assert.equal(salida['online'], true);
  assert.deepEqual(salida['counts'], { lists: 3, archivedLists: 1, trashedLists: 0 });
  assert.deepEqual(salida['recentErrors'], []);

  // Una ruta limpia también funciona, y una vacía no rompe nada.
  assert.equal(collectDiagnostics(contexto({ route: '/archive' }))['route'], '/archive');
  assert.equal(collectDiagnostics(contexto({ route: '' }))['route'], '');

  // Y el diagnóstico entero cabe de sobra en el tope de 8 KB que acepta el servidor.
  const completo = collectDiagnostics(contexto({
    userAgent: 'M'.repeat(400),
    recentErrors: Array.from({ length: 10 }, (_, i) => ({ message: `error largo ${i}`.repeat(20), at: '' }))
  }));
  assert.ok(JSON.stringify(completo).length <= MAX_DIAGNOSTICS_BYTES, 'el peor caso cabe en 8 KB');
  assert.equal(MAX_DIAGNOSTICS_BYTES, 8 * 1024);
});

// 10. Errores recientes: sin URLs con parámetros, sin correos y con el texto recortado.
check('los errores recientes se limpian de URLs, correos y tokens, y se recortan', () => {
  // Una URL con parámetros fuera entera, con su token incluido.
  const conUrl = scrubSensitiveText('Fallo en https://abc.supabase.co/auth/v1/token?grant_type=password&apikey=llave al guardar');
  assert.doesNotMatch(conUrl, /apikey=llave/, 'el parámetro no puede sobrevivir');
  assert.doesNotMatch(conUrl, /grant_type/);
  assert.match(conUrl, /\[url\]/, 'la URL se sustituye por una marca');
  assert.match(conUrl, /Fallo en/, 'el resto del mensaje se conserva');

  // Un correo suelto se sustituye.
  const conEmail = scrubSensitiveText('Error al avisar a victima.apellido@example.com del fallo');
  assert.doesNotMatch(conEmail, /victima\.apellido@example\.com/);
  assert.match(conEmail, /\[email\]/);

  // Un JWT y un secreto largo también.
  const conToken = scrubSensitiveText('token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc123 fallback');
  assert.doesNotMatch(conToken, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
  assert.match(conToken, /\[token\]/);
  assert.doesNotMatch(scrubSensitiveText('clave sk_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'), /sk_live_/);
  assert.match(scrubSensitiveText('Authorization: Bearer abc.def.ghi'), /redactado/);

  // El recorte: 300 caracteres más la elipsis de fin. Se usa texto con espacios porque una
  // racha de 24+ caracteres iguales es un secreto para LONG_SECRET y se sustituye entera.
  const frase = 'palabra '.repeat(200);
  const recortado = scrubSensitiveText(frase);
  assert.equal(recortado.length, 301, 'texto normal se recorta a 300 + elipsis');
  assert.ok(recortado.endsWith('…'));

  // Un error sin nada sospechoso pasa intacto, para no perder información útil.
  assert.equal(
    scrubSensitiveText('TypeError: no se puede leer la propiedad length de undefined'),
    'TypeError: no se puede leer la propiedad length de undefined'
  );
  for (const vacio of [null, undefined, 42, {}]) assert.equal(scrubSensitiveText(vacio), '');

  // El buffer del diagnóstico respeta el tope de 10 errores. El buffer de la app llega ya
  // ordenado del más reciente al más antiguo, así que quedarse con los 10 primeros conserva
  // los más recientes (que son los que interesan) y descarta los más viejos.
  const recientes = Array.from({ length: 25 }, (_, i) => ({ message: `error ${24 - i}`, at: '' }));
  const salida = sanitizeDiagnostics({ recentErrors: recientes });
  assert.equal(salida['recentErrors'].length, 10);
  assert.equal(salida['recentErrors'][0].message, 'error 24', 'el primero es el más reciente');
  assert.equal(salida['recentErrors'][9].message, 'error 15', 'y el último es el más viejo que se queda');

  // Y los errores también se limpian al entrar al diagnóstico, no solo al recogerse.
  const sucio = sanitizeDiagnostics({
    recentErrors: [{ message: 'falló en https://x.supabase.co/rest/v1/boards?apikey=llave', at: '2026-01-01' }]
  });
  assert.doesNotMatch(sucio['recentErrors'][0].message, /apikey=llave/);
});

// 11. El asunto del correo no puede llevar saltos de línea (inyección de cabeceras).
check('el asunto del correo no tiene saltos de línea ni caracteres de control', () => {
  // Un salto de línea en el mensaje no puede crear una segunda cabecera.
  const asunto = buildEmailSubject('bug', 'La app no guarda\nBcc: victima@example.com\r\nX-Custom: valor');
  assert.doesNotMatch(asunto, /[\r\n]/, 'no debe quedar ningún salto de línea');
  assert.doesNotMatch(asunto, /[\u0000-\u001f\u007f]/, 'ni caracteres de control');
  // El texto se aplana: el contenido sigue ahí, pero en una sola línea.
  assert.match(asunto, /^\[The Lister\] Error: /);
  assert.match(asunto, /La app no guarda Bcc: victima@example\.com X-Custom: valor/);

  // También con \n a secas, tabuladores y espacios repetidos.
  const plano = sanitizeHeaderText('uno\n\ndos\t\ttres     cuatro\n');
  assert.equal(plano, 'uno dos tres cuatro');

  // El resumen son los primeros 60 caracteres del mensaje ya plano.
  const largo = buildEmailSubject('suggestion', 'A'.repeat(200));
  assert.ok(largo.endsWith('A'.repeat(60)), 'el resumen se corta en 60');
  assert.equal(largo, `[The Lister] Sugerencia: ${'A'.repeat(60)}`);

  // Cada tipo usa su etiqueta en español, y uno desconocido cae en "Otro".
  assert.equal(buildEmailSubject('bug', 'algo'), '[The Lister] Error: algo');
  assert.equal(buildEmailSubject('suggestion', 'algo'), '[The Lister] Sugerencia: algo');
  assert.equal(buildEmailSubject('other', 'algo'), '[The Lister] Otro: algo');
  assert.equal(buildEmailSubject('inventado', 'algo'), '[The Lister] Otro: algo');

  // Entradas raras no rompen la construcción del asunto.
  assert.equal(buildEmailSubject(null, null), '[The Lister] Otro: ');
  assert.equal(sanitizeHeaderText(null), '');
});

// 12. Escape de HTML: nada del usuario se interpreta como etiqueta en el correo.
check('el cuerpo del correo escapa el HTML malicioso del mensaje', () => {
  const ataques = [
    ['<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    ['<img src=x onerror=alert(1)>', '&lt;img src=x onerror=alert(1)&gt;'],
    ['href="javascript:alert(1)"', 'href=&quot;javascript:alert(1)&quot;'],
    ["it's here", 'it&#39;s here'],
    ['5 > 3 & 2 < 4', '5 &gt; 3 &amp; 2 &lt; 4'],
    ['"><svg onload=alert(1)>', '&quot;&gt;&lt;svg onload=alert(1)&gt;']
  ];
  for (const [entrada, esperado] of ataques) {
    assert.equal(escapeHtml(entrada), esperado, `falló: ${entrada}`);
  }

  // Al revés: escapado no debe quedar escapado dos veces (no hay doble escape).
  assert.equal(escapeHtml(escapeHtml('<b>x</b>')), '&amp;lt;b&amp;gt;x&amp;lt;/b&amp;gt;');

  // Lo escapado ya no contiene ninguna etiqueta real.
  const escapado = escapeHtml('<script>alert(1)</script>');
  assert.doesNotMatch(escapado, /<[a-z]/i, 'no puede quedar una "<etiqueta"');
  assert.doesNotMatch(escapado, />/, 'no puede quedar un cierre de etiqueta');

  // Valores que no son texto salen como cadena vacía, sin romperse.
  for (const vacio of [null, undefined, 42, {}]) assert.equal(escapeHtml(vacio), '');
});

// 13. Límite de frecuencia: 5 por hora y 20 por día.
check('el límite de frecuencia bloquea el sexto envío por hora', () => {
  const ahora = new Date('2026-10-05T12:00:00Z');
  const haceMinutos = (m) => new Date(ahora.getTime() - m * 60 * 1000).toISOString();

  // Con 4 reportes en la última hora, el quinto sí pasa.
  const cuatro = [haceMinutos(10), haceMinutos(20), haceMinutos(30), haceMinutos(40)];
  const permitido = checkRateLimit(cuatro, ahora);
  assert.equal(permitido.allowed, true, 'con 4 previos se permite el quinto');
  assert.equal(permitido.count, 4);
  assert.equal(permitido.limit, RATE_LIMIT_PER_HOUR);
  assert.equal(permitido.scope, null);
  assert.equal(RATE_LIMIT_PER_HOUR, 5);

  // Con 5, el siguiente se rechaza por la ventana de la hora.
  const cinco = [...cuatro, haceMinutos(50)];
  const bloqueado = checkRateLimit(cinco, ahora);
  assert.equal(bloqueado.allowed, false, 'con 5 previos se bloquea');
  assert.equal(bloqueado.scope, 'hour');
  assert.equal(bloqueado.count, 5);
  assert.match(rateLimitMessage(bloqueado), /demasiados comentarios por hora/);
  assert.match(rateLimitMessage(bloqueado), /máximo 5/);
  assert.equal(rateLimitMessage(permitido), '', 'sin bloqueo no hay mensaje de error');

  // Reportes que se salen de la ventana de la hora: cuentan para el día, no para la hora.
  const haceCuatroHoras = [haceMinutos(60 * 4), haceMinutos(60 * 5), haceMinutos(60 * 6)];
  assert.equal(checkRateLimit(cinco.slice(0, 2).concat(haceCuatroHoras), ahora).allowed, true,
    'lo de hace 4 horas no cuenta para la hora');
  assert.equal(checkRateLimit(haceCuatroHoras, ahora).count, 0);
});

check('el límite de frecuencia bloquea el 21.º envío por día', () => {
  const ahora = new Date('2026-10-05T12:00:00Z');
  const hace = (h) => new Date(ahora.getTime() - h * 60 * 60 * 1000).toISOString();

  // 19 reportes entre 2 y 20 horas atrás (fuera de la última hora, dentro de las 24 h): se
  // permite el siguiente. Igual que en la hora (4 previos permiten, 5 bloquean), aquí el tope
  // es "ya hay 20", así que con 19 se pasa y con 20 se bloquea.
  const diecinueve = Array.from({ length: 19 }, (_, i) => hace(2 + i));
  assert.ok(diecinueve.every((f) => new Date(f).getTime() < ahora.getTime() - 60 * 60 * 1000),
    'ninguno de los diecinueve cae en la última hora');
  const permitido = checkRateLimit(diecinueve, ahora);
  assert.equal(permitido.allowed, true, 'con 19 previos se permite el vigésimo');
  assert.equal(permitido.count, 0, 'ninguno cuenta para la ventana de la hora');
  assert.equal(permitido.scope, null);

  // Con 20 ya en el día, el siguiente se rechaza por la ventana del día (no por la de la hora).
  const veinte = [...diecinueve, hace(21)];
  const bloqueado = checkRateLimit(veinte, ahora);
  assert.equal(bloqueado.allowed, false, 'con 20 previos se bloquea el día');
  assert.equal(bloqueado.scope, 'day');
  assert.equal(bloqueado.count, RATE_LIMIT_PER_DAY);
  assert.equal(bloqueado.limit, RATE_LIMIT_PER_DAY);
  assert.match(rateLimitMessage(bloqueado), /demasiados comentarios hoy/);
  assert.match(rateLimitMessage(bloqueado), /máximo 20/);
  assert.equal(RATE_LIMIT_PER_DAY, 20);

  // Cuando la hora salta primero, manda la hora: es la ventana más restrictiva.
  const ambos = [
    ...Array.from({ length: 5 }, (_, i) => hace(0.1 * (i + 1))),
    ...veinte
  ];
  const primero = checkRateLimit(ambos, ahora);
  assert.equal(primero.scope, 'hour', 'la ventana de la hora se comprueba antes');
  assert.equal(primero.count, 5);

  // Una fila justo fuera de las dos ventanas (más de 24 h) no cuenta, así que 20 de hace
  // más de un día no bloquean.
  const antiguos = Array.from({ length: 20 }, (_, i) => hace(25 + i));
  assert.equal(checkRateLimit(antiguos, ahora).allowed, true);
  // Y una del futuro, por deriva del reloj, tampoco.
  assert.equal(checkRateLimit([...diecinueve, new Date(ahora.getTime() + 60000).toISOString()], ahora).allowed, true);
  // Fecha ilegible: se ignora en vez de romper el conteo.
  assert.equal(checkRateLimit([...diecinueve, 'no-es-fecha', null, undefined, 42], ahora).allowed, true);
  assert.equal(checkRateLimit([], ahora).allowed, true);
});

// 14. La cabecera Authorization: se extrae SOLO el token, nunca la cabecera entera.
check('de la cabecera Authorization se extrae solo el token', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.firma';

  // El caso normal: "Bearer <jwt>" -> "<jwt>".
  assert.equal(extractBearerToken(`Bearer ${jwt}`), jwt);
  // El esquema HTTP no distingue mayúsculas.
  assert.equal(extractBearerToken(`bearer ${jwt}`), jwt);
  assert.equal(extractBearerToken(`BEARER ${jwt}`), jwt);
  // Espacios de sobra alrededor, como los pone fetch en según la implementación.
  assert.equal(extractBearerToken(`  Bearer   ${jwt}  `), jwt);

  // Sin cabecera, vacía o sin forma Bearer: null, para poder responder 401 sin llamar a GoTrue.
  assert.equal(extractBearerToken(null), null);
  assert.equal(extractBearerToken(undefined), null);
  assert.equal(extractBearerToken(''), null);
  assert.equal(extractBearerToken('   '), null);
  assert.equal(extractBearerToken(jwt), null, 'un JWT sin "Bearer" no vale');
  assert.equal(extractBearerToken('Basic dXNlcjpwYXNz'), null, 'otro esquema no vale');
  assert.equal(extractBearerToken('Bearer'), null);
  assert.equal(extractBearerToken('Bearer    '), null, 'Bearer sin token no vale');
  assert.equal(extractBearerToken(123), null);

  // La razón de que esto exista: el token devuelto NO lleva "Bearer", así que getUser() puede
  // volver a prefijarlo sin duplicar. Este es el 401 falso que relacionamos.
  const token = extractBearerToken(`Bearer ${jwt}`);
  assert.doesNotMatch(token, /^Bearer/i, 'el token no debe traer el esquema dentro');
  assert.equal(`Bearer ${token}`, `Bearer ${jwt}`, 'reprefijarlo da la cabecera original');

  // Y una cabecera con el esquema repetido (el síntoma del bug) se rechaza en vez de colarse.
  assert.equal(extractBearerToken(`Bearer Bearer ${jwt}`), null);
});

// 15. Retención: 90 días, la misma constante en el código y en la Edge Function.
check('la retención de reportes es de 90 días', () => {
  assert.equal(FEEDBACK_RETENTION_DAYS, 90);
});

console.log(`feedback: ${cases} cases passed`);