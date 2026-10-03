import assert from 'node:assert/strict';
import { mergeBoardAdditions } from '../src/app/core/board-merge.ts';

const base = {
  id: 'board-1',
  title: 'Board',
  createdAt: '2026-01-01T00:00:00.000Z',
  lists: [
    {
      id: 'list-1',
      boardId: 'board-1',
      title: 'List',
      position: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      tasks: [
        { id: 'task-1', listId: 'list-1', text: 'Existing', completed: false, position: 0, createdAt: '2026-01-01T00:00:00.000Z' }
      ]
    }
  ]
};

const newList = (id, title = id) => ({
  id,
  boardId: 'board-1',
  title,
  position: 1,
  createdAt: '2026-01-02T00:00:00.000Z',
  tasks: []
});

const newTask = (id, text = id) => ({
  id,
  listId: 'list-1',
  text,
  completed: false,
  position: 1,
  createdAt: '2026-01-02T00:00:00.000Z'
});

{
  const local = structuredClone(base);
  local.lists.push(newList('local-list'));
  const result = mergeBoardAdditions(base, local, structuredClone(base));
  assert.deepEqual(result.lists.map((list) => list.id), ['list-1', 'local-list']);
}

{
  const remote = structuredClone(base);
  remote.lists.push(newList('remote-list'));
  const result = mergeBoardAdditions(base, structuredClone(base), remote);
  assert.deepEqual(result.lists.map((list) => list.id), ['list-1', 'remote-list']);
}

{
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.lists[0].tasks.push(newTask('local-task'));
  remote.lists[0].tasks.push(newTask('remote-task'));
  const result = mergeBoardAdditions(base, local, remote);
  assert.deepEqual(result.lists[0].tasks.map((task) => task.id), ['task-1', 'remote-task', 'local-task']);
}

{
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.lists[0].tasks.push(newTask('shared-task', 'Same addition'));
  remote.lists[0].tasks.push(newTask('shared-task', 'Same addition'));
  const result = mergeBoardAdditions(base, local, remote);
  assert.equal(result.lists[0].tasks.filter((task) => task.id === 'shared-task').length, 1);
}

{
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.lists[0].tasks[0].text = 'Local edit';
  remote.lists[0].tasks[0].text = 'Remote edit';
  assert.throws(() => mergeBoardAdditions(base, local, remote), /no son adiciones|editadas/i);
}

{
  const local = structuredClone(base);
  const remote = structuredClone(base);
  local.lists.push(newList('local-list'));
  remote.lists[0].title = 'Remote edit';
  const result = mergeBoardAdditions(base, local, remote);
  assert.equal(result.lists[0].title, 'Remote edit');
  assert.equal(result.lists[1].id, 'local-list');
}

console.log('board-merge: 6 cases passed');