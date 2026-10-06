import assert from 'node:assert/strict';
import {
  collectAttachmentPaths,
  DELETE_ACCOUNT_BUCKET,
  DELETE_ACCOUNT_REMOVE_CHUNK,
  deleteAccount,
  DeleteAccountError,
} from '../supabase/functions/delete-account/core.ts';

let cases = 0;
const check = async (label, fn) => {
  await fn();
  cases++;
  console.log(`  ok  ${label}`);
};

const USER = 'user-123';

/** Cliente simulado con forma de supabase-js; registra el orden de las llamadas. */
function makeDb({ filas = [], fallaEn = null, mensajeFallo = 'boom' } = {}) {
  const calls = [];
  let removeCalls = [];
  const db = {
    calls,
    removeCalls,
    from(table) {
      if (table === 'storage.objects') {
        throw new Error('no se debe tocar storage.objects');
      }
      return {
        select(columns) {
          return {
            eq(column, value) {
              return {
                range(from, to) {
                  calls.push(`select:${table}:${column}:${value}:${from}-${to}`);
                  if (fallaEn === 'select') {
                    return Promise.resolve({ data: null, error: { message: mensajeFallo } });
                  }
                  const trozo = filas.slice(from, to + 1);
                  return Promise.resolve({ data: trozo, error: null });
                },
              };
            },
          };
        },
        delete() {
          return {
            eq(column, value) {
              calls.push(`delete:${table}:${column}:${value}`);
              if (
                (fallaEn === 'delete-reports' && table === 'feedback_reports') ||
                (fallaEn === 'delete-boards' && table === 'boards')
              ) {
                return Promise.resolve({ error: { message: mensajeFallo } });
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    storage: {
      from(bucket) {
        return {
          remove(paths) {
            calls.push(`remove:${bucket}:${paths.length}`);
            removeCalls.push({ bucket, count: paths.length, paths: [...paths] });
            if (fallaEn === 'remove') {
              return Promise.resolve({ error: { message: mensajeFallo } });
            }
            return Promise.resolve({ error: null });
          },
        };
      },
    },
    auth: {
      admin: {
        deleteUser(userId) {
          calls.push(`deleteUser:${userId}`);
          if (fallaEn === 'delete-user') {
            return Promise.resolve({ error: { message: mensajeFallo } });
          }
          if (fallaEn === 'delete-user-notfound') {
            return Promise.resolve({ error: { message: 'User not found' } });
          }
          return Promise.resolve({ error: null });
        },
      },
    },
  };
  return db;
}
// 1. Camino feliz: orden select → remove (storage) → deletes → deleteUser al final.
await check('el borrado sigue el orden y termina con deleteUser', async () => {
  const filas = [
    { attachments: ['a/1.png', 'a/2.png'] },
    { attachments: ['a/2.png', 'a/3.jpg'] },
  ];
  const db = makeDb({ filas });
  await deleteAccount(db, USER);
  assert.deepEqual(db.calls, [
    'select:feedback_reports:user_id:user-123:0-999',
    'remove:feedback-attachments:3',
    'delete:feedback_reports:user_id:user-123',
    'delete:boards:owner_id:user-123',
    'deleteUser:user-123',
  ]);
  assert.deepEqual(db.removeCalls[0].paths, ['a/1.png', 'a/2.png', 'a/3.jpg']);
});

// 2. Sin reportes: no se llama a storage.remove, pero sí a los deletes y deleteUser.
await check('sin reportes no se toca Storage', async () => {
  const db = makeDb({ filas: [] });
  await deleteAccount(db, USER);
  assert.deepEqual(db.calls, [
    'select:feedback_reports:user_id:user-123:0-999',
    'delete:feedback_reports:user_id:user-123',
    'delete:boards:owner_id:user-123',
    'deleteUser:user-123',
  ]);
});

// 3. `attachments` malformado no rompe: solo sobreviven strings no vacíos únicos.
await check('los adjuntos malformados se ignoran', async () => {
  assert.deepEqual(
    collectAttachmentPaths([
      { attachments: null },
      { attachments: 'no-es-array' },
      {},
      { attachments: ['x.png', null, 42, '', 'x.png', 'y.png'] },
    ]),
    ['x.png', 'y.png']
  );
  const db = makeDb({ filas: [{ attachments: [null, 'solo.png', 'solo.png'] }] });
  await deleteAccount(db, USER);
  assert.equal(db.removeCalls.length, 1);
  assert.deepEqual(db.removeCalls[0].paths, ['solo.png']);
});

// 4. Bloques de 100: 250 rutas → 3 llamadas a remove, ninguna mayor de 100.
await check('el borrado de Storage va en bloques de 100', async () => {
  assert.equal(DELETE_ACCOUNT_REMOVE_CHUNK, 100);
  const rutas = Array.from({ length: 250 }, (_, i) => `r/${i}.png`);
  const db = makeDb({ filas: [{ attachments: rutas }] });
  await deleteAccount(db, USER);
  assert.equal(db.removeCalls.length, 3);
  assert.ok(db.removeCalls.every((c) => c.count <= 100));
  assert.deepEqual(
    db.removeCalls.map((c) => c.count),
    [100, 100, 50]
  );
  assert.equal(db.removeCalls[0].bucket, DELETE_ACCOUNT_BUCKET);
});

// 5. Fallo en `remove`: se aborta, deleteUser NO se llama.
await check('si falla Storage no se borra nada más', async () => {
  const db = makeDb({ filas: [{ attachments: ['a.png'] }], fallaEn: 'remove' });
  await assert.rejects(deleteAccount(db, USER), DeleteAccountError);
  assert.ok(!db.calls.some((c) => c.startsWith('deleteUser')));
  assert.ok(!db.calls.some((c) => c.startsWith('delete:')));
  try {
    await deleteAccount(db, USER);
    assert.fail('debió fallar');
  } catch (error) {
    assert.ok(error instanceof DeleteAccountError);
    assert.equal(error.phase, 'remove');
  }
});

// 6. Fallo en `delete-reports`: boards y deleteUser no se tocan.
await check('si falla el delete de reportes no se sigue', async () => {
  const db = makeDb({ filas: [], fallaEn: 'delete-reports' });
  await assert.rejects(deleteAccount(db, USER), DeleteAccountError);
  assert.ok(!db.calls.some((c) => c.startsWith('delete:boards')));
  assert.ok(!db.calls.some((c) => c.startsWith('deleteUser')));
});

// 7. Fallo en `delete-boards`: deleteUser no se llama.
await check('si falla el delete de boards no se borra al usuario', async () => {
  const db = makeDb({ filas: [], fallaEn: 'delete-boards' });
  try {
    await deleteAccount(db, USER);
    assert.fail('debió fallar');
  } catch (error) {
    assert.ok(error instanceof DeleteAccountError);
    assert.equal(error.phase, 'delete-boards');
  }
  assert.ok(!db.calls.some((c) => c.startsWith('deleteUser')));
});

// 8. Fallo en `select`: no se llama a nada más.
await check('si falla la lectura no se borra nada', async () => {
  const db = makeDb({ fallaEn: 'select' });
  try {
    await deleteAccount(db, USER);
    assert.fail('debió fallar');
  } catch (error) {
    assert.ok(error instanceof DeleteAccountError);
    assert.equal(error.phase, 'select');
  }
  assert.equal(db.calls.length, 1);
});

// 9. `deleteUser` con usuario ya inexistente = éxito (reintento idempotente).
await check('deleteUser sobre usuario inexistente no falla', async () => {
  const db = makeDb({ filas: [], fallaEn: 'delete-user-notfound' });
  await deleteAccount(db, USER);
  assert.ok(db.calls.some((c) => c === 'deleteUser:user-123'));
});

// 10. El borrado usa la API de Storage, nunca `delete` sobre `storage.objects`.
//     (`makeDb.from` lanza si se pide `storage.objects`; si se llegara a pedir,
//     el test fallaría solo.)
await check('nunca se borra storage.objects como tabla', async () => {
  const db = makeDb({ filas: [{ attachments: ['a.png'] }] });
  await deleteAccount(db, USER);
  assert.ok(db.calls.some((c) => c.startsWith('remove:feedback-attachments')));
});

// 11. El `userId` nunca viene del cuerpo: `core.ts` ni siquiera recibe un cuerpo.
//     `deleteAccount(db, userId)` solo acepta el id como argumento; un cuerpo con
//     `user_id` de otro usuario no tiene por dónde entrar.
await check('el userId solo puede venir del argumento (JWT verificado)', async () => {
  const cuerpoMalicioso = { user_id: 'otro-usuario' };
  const db = makeDb({ filas: [] });
  await deleteAccount(db, USER);
  assert.ok(!db.calls.some((c) => c.includes('otro-usuario')));
  assert.ok(!db.calls.some((c) => c.includes(JSON.stringify(cuerpoMalicioso))));
  assert.ok(db.calls.every((c) => !c.includes('otro-usuario')));
  assert.ok(db.calls.some((c) => c.includes(USER)));
});

console.log(`delete-account: ${cases} cases passed`);

