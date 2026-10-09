/**
 * Tests for login-spinner.ts pure logic.
 * Run with: npm run test:login-spinner
 */

import { LOGIN_SPINNER_MIN_MS, LOGIN_SPINNER_MAX_MS, remainingMinMs, shouldForceStop } from '../src/app/core/login-spinner.ts';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    console.log(`✓ ${name}`);
    passed++;
  } else {
    console.error(`✗ ${name}`);
    failed++;
  }
}

function assertEqual(name: string, actual: number, expected: number) {
  if (actual === expected) {
    console.log(`✓ ${name} (${actual})`);
    passed++;
  } else {
    console.error(`✗ ${name} — expected ${expected}, got ${actual}`);
    failed++;
  }
}

const NOW = 10000;

// Constants
assertEqual('LOGIN_SPINNER_MIN_MS', LOGIN_SPINNER_MIN_MS, 3000);
assertEqual('LOGIN_SPINNER_MAX_MS', LOGIN_SPINNER_MAX_MS, 20000);

// remainingMinMs
assertEqual('remainingMinMs at start (0ms elapsed)', remainingMinMs(NOW, NOW), 3000);
assertEqual('remainingMinMs at 1s elapsed', remainingMinMs(NOW, NOW + 1000), 2000);
assertEqual('remainingMinMs at 2.5s elapsed', remainingMinMs(NOW, NOW + 2500), 500);
assertEqual('remainingMinMs at 3s elapsed', remainingMinMs(NOW, NOW + 3000), 0);
assertEqual('remainingMinMs at 5s elapsed', remainingMinMs(NOW, NOW + 5000), 0);
assertEqual('remainingMinMs at 20s elapsed', remainingMinMs(NOW, NOW + 20000), 0);

// shouldForceStop
assert('shouldForceStop false at 0ms', !shouldForceStop(NOW, NOW));
assert('shouldForceStop false at 1s', !shouldForceStop(NOW, NOW + 1000));
assert('shouldForceStop false at 10s', !shouldForceStop(NOW, NOW + 10000));
assert('shouldForceStop false at 19.9s', !shouldForceStop(NOW, NOW + 19900));
assert('shouldForceStop true at 20s', shouldForceStop(NOW, NOW + 20000));
assert('shouldForceStop true at 21s', shouldForceStop(NOW, NOW + 21000));

// Edge: startedAt in future (should not happen, but handle gracefully)
assertEqual('remainingMinMs with future start', remainingMinMs(NOW + 5000, NOW), 3000);
assert('shouldForceStop with future start', !shouldForceStop(NOW + 5000, NOW));

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}