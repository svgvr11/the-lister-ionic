import assert from 'node:assert/strict';
import { focusListRemovalMessage } from '../src/app/core/focus-notice.ts';

assert.equal(focusListRemovalMessage('archived'), 'La lista fue archivada');
assert.equal(focusListRemovalMessage('trashed'), 'La lista fue eliminada');
assert.equal(focusListRemovalMessage('remote'), 'La lista ya no está disponible');

console.log('focus-notice: 3 cases passed');
