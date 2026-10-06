import assert from 'node:assert/strict';
import { OwnBoardSnapshots } from '../src/app/core/board-sync.ts';
import { mergeBoardAdditions } from '../src/app/core/board-merge.ts';

const base = {
  id: 'board-1',
  title: 'Board',
  createdAt: '2026-01-01T00:00:00.000Z',
  pinnedListId: null,
  lists: [{
    id: 'list-1',
    title: 'List',
    position: 0,
    tasks: [{
      id: 'task-1',
      text: 'Original',
      completed: false,
      position: 0,
      createdAt: '2026-01-01T00:00:00.000Z'
    }]
  }],
  trashedLists: [],
  archivedLists: []
};

const failures = [];
const test = (name, run) => {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`not ok - ${name}: ${error.message}`);
  }
};

test('canonicalizes server metadata, key order, and date formats', () => {
  const snapshots = new OwnBoardSnapshots();
  const token = snapshots.begin(base);
  snapshots.complete(token, true);
  const equivalentEcho = {
    archivedLists: [],
    trashedLists: [],
    lists: [{
      tasks: [{
        position: 0,
        completed: false,
        text: 'Original',
        id: 'task-1',
        createdAt: '2025-12-31T21:00:00-03:00'
      }],
      position: 0,
      title: 'List',
      id: 'list-1',
      updated_at: 'server-only',
      serverVersion: 'row-version'
    }],
    pinnedListId: null,
    createdAt: '2026-01-01T00:00:00Z',
    title: 'Board',
    id: 'board-1',
    version: 3,
    updated_at: 'another-server-value'
  };
  assert.equal(snapshots.has(equivalentEcho), true, 'canonical equivalent own echo is recognized');
});

test('discards an out-of-order echo of A without replacing newer local B', () => {
  const snapshots = new OwnBoardSnapshots();
  const savedA = structuredClone(base);
  savedA.lists[0].title = 'Saved A';
  const tokenA = snapshots.begin(savedA);
  snapshots.complete(tokenA, true);

  const savedB = structuredClone(savedA);
  savedB.lists[0].title = 'Saved B';
  const tokenB = snapshots.begin(savedB);
  snapshots.complete(tokenB, true);

  let current = structuredClone(savedB);
  const echoedA = structuredClone(savedA);
  if (!snapshots.has(echoedA)) current = echoedA;
  assert.equal(current.lists[0].title, 'Saved B', 'late echo A cannot replace newer local B');
  assert.equal(snapshots.has(echoedA), true, 'late echo A is recognized without conflict');
});

test('does not classify a genuinely different remote update as an own echo', () => {
  const snapshots = new OwnBoardSnapshots();
  const token = snapshots.begin(base);
  snapshots.complete(token, true);
  const remote = structuredClone(base);
  remote.lists[0].title = 'Changed remotely';
  assert.equal(snapshots.has(remote), false, 'a nonmatching remote update is not classified as an echo');
});

test('real divergent edits to an existing task still conflict', () => {
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.lists[0].tasks[0].text = 'Local task edit';
  remote.lists[0].tasks[0].text = 'Remote task edit';
  assert.throws(() => mergeBoardAdditions(base, local, remote), /editadas/i);
});

test('keeps only the last 20 saved snapshots and forgets failed saves', () => {
  const snapshots = new OwnBoardSnapshots();
  const boards = Array.from({ length: 21 }, (_, index) => ({
    ...structuredClone(base),
    title: `Snapshot ${index}`
  }));
  for (const board of boards) {
    const token = snapshots.begin(board);
    snapshots.complete(token, true);
  }
  assert.equal(snapshots.has(boards[0]), false);
  assert.equal(snapshots.has(boards[20]), true);

  const failed = snapshots.begin({ ...structuredClone(base), title: 'Failed save' });
  snapshots.complete(failed, false);
  assert.equal(snapshots.has({ ...structuredClone(base), title: 'Failed save' }), false);
});

if (failures.length) {
  console.error(`board-sync: ${failures.length} of 5 cases failed`);
  process.exitCode = 1;
} else {
  console.log('board-sync: 5 cases passed');
}
