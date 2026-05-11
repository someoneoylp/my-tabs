import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionManager } from '../src/actions.js';

test('closeTabs records undo snapshot and restores closed URLs', async () => {
  const calls = [];
  const api = {
    closeTabs: async ids => calls.push(['closeTabs', ids]),
    createTab: async tab => calls.push(['createTab', tab])
  };
  const manager = createActionManager(api);
  const tabs = [
    { id: 1, windowId: 10, title: 'A', url: 'https://a.example' },
    { id: 2, windowId: 11, title: 'B', url: 'https://b.example' }
  ];

  await manager.closeTabs(tabs, '重复 Tab 清理');
  assert.deepEqual(calls[0], ['closeTabs', [1, 2]]);
  assert.equal(manager.canUndo(), true);

  const result = await manager.undoLastAction();
  assert.equal(result.restored, 2);
  assert.equal(calls[1][0], 'createTab');
  assert.equal(calls[1][1].url, 'https://a.example');
  assert.equal(calls[2][1].windowId, 11);
  assert.equal(manager.canUndo(), false);
});

test('undoLastAction reports no action when history is empty', async () => {
  const manager = createActionManager({ closeTabs: async () => {}, createTab: async () => {} });
  const result = await manager.undoLastAction();
  assert.deepEqual(result, { restored: 0, failed: 0, message: '没有可撤销的操作' });
});
