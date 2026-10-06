import assert from 'node:assert/strict';
import { OverlayStack } from '../src/app/core/overlay-stack.ts';

const stack = new OverlayStack();
const closed = [];

stack.register('focus', () => closed.push('focus'));
stack.register('remove', () => closed.push('remove'));
assert.equal(stack.size, 2);
assert.equal(stack.topId, 'remove');
assert.equal(stack.closeTop(), 'closed');
assert.deepEqual(closed, ['remove']);
assert.equal(stack.topId, 'focus');

stack.register('session-blocked', () => closed.push('blocked'), false);
assert.equal(stack.closeTop(), 'blocked');
assert.equal(stack.topId, 'session-blocked');
assert.deepEqual(closed, ['remove']);
assert.equal(stack.unregister('session-blocked'), true);
assert.equal(stack.closeTop(), 'closed');
assert.deepEqual(closed, ['remove', 'focus']);
assert.equal(stack.closeTop(), 'empty');

const unregister = stack.register('archive:help', () => closed.push('help'));
assert.equal(unregister(), true);
assert.equal(unregister(), false);
assert.equal(stack.size, 0);

stack.register('board:menu', () => closed.push('menu'));
stack.register('board:focus', () => closed.push('focus'));
stack.unregisterPrefix('board:');
assert.equal(stack.size, 0);

console.log('overlay-stack: 16 assertions passed');
