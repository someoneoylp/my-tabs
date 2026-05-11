import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTabByRules } from '../src/tabGrouper.js';

test('groupTabByRules creates a group when no matching group exists', async () => {
  const calls = [];
  const api = {
    queryTabs: async () => [],
    groupTabs: async ({ tabIds }) => { calls.push(['groupTabs', tabIds]); return 7; },
    updateGroup: async (groupId, update) => calls.push(['updateGroup', groupId, update])
  };

  const result = await groupTabByRules({ id: 1, title: '飞书文档 需求', url: 'https://example.com' }, [{ name: '飞书文档', urlKeyword: 'bytedance.larkoffice.com' }], api);

  assert.equal(result.grouped, true);
  assert.equal(result.groupTitle, '飞书文档');
  assert.deepEqual(calls, [
    ['groupTabs', [1]],
    ['updateGroup', 7, { title: '飞书文档', color: 'green' }]
  ]);
});

test('groupTabByRules adds tab to an existing titled group', async () => {
  const calls = [];
  const api = {
    queryTabs: async () => [{ id: 2, title: '旧文档', groupId: 9 }],
    getGroup: async groupId => ({ id: groupId, title: '飞书文档' }),
    groupTabs: async ({ tabIds, groupId }) => calls.push(['groupTabs', tabIds, groupId]),
    updateGroup: async () => calls.push(['updateGroup'])
  };

  const result = await groupTabByRules({ id: 1, title: '产品需求', url: 'https://bytedance.larkoffice.com/doc/abc' }, [{ name: '飞书文档', urlKeyword: 'bytedance.larkoffice.com' }], api);

  assert.equal(result.grouped, true);
  assert.deepEqual(calls, [['groupTabs', [1], 9]]);
});

test('groupTabByRules ignores tabs without matching rule or id', async () => {
  const api = {
    queryTabs: async () => [],
    groupTabs: async () => { throw new Error('should not group'); }
  };

  assert.deepEqual(await groupTabByRules({ id: 1, title: 'GitHub', url: 'https://github.com' }, [{ name: '邮箱', urlKeyword: '' }], api), { grouped: false, reason: 'no-match' });
  assert.deepEqual(await groupTabByRules({ title: '邮箱', url: 'https://mail.example.com' }, [{ name: '邮箱', urlKeyword: '' }], api), { grouped: false, reason: 'missing-tab-id' });
});

test('groupTabByRules ignores pinned tabs even when rules match', async () => {
  const api = {
    queryTabs: async () => [{ id: 2, title: 'AI Home', groupId: 13 }],
    getGroup: async groupId => ({ id: groupId, title: 'ai' }),
    groupTabs: async () => { throw new Error('should not group pinned tabs'); },
    updateGroup: async () => { throw new Error('should not update pinned tabs'); }
  };

  assert.deepEqual(
    await groupTabByRules({ id: 1, pinned: true, title: 'GitHub', url: 'https://github.com/' }, [{ name: 'ai', urlKeyword: 'github.com' }], api),
    { grouped: false, reason: 'pinned-tab' }
  );
});

test('groupTabByRules moves tab from URL matched group to higher priority title matched existing group', async () => {
  const calls = [];
  const api = {
    queryTabs: async () => [
      { id: 2, title: '飞书旧页', groupId: 9 },
      { id: 3, title: '小助手旧页', groupId: 10 }
    ],
    getGroup: async groupId => ({ id: groupId, title: groupId === 9 ? '飞书文档' : '小助手Tab' }),
    groupTabs: async ({ tabIds, groupId }) => calls.push(['groupTabs', tabIds, groupId]),
    updateGroup: async () => calls.push(['updateGroup'])
  };

  const result = await groupTabByRules(
    { id: 1, title: '小助手需求文档', url: 'https://bytedance.larkoffice.com/wiki/abc' },
    [{ name: '飞书文档', urlKeyword: 'bytedance.larkoffice.com' }],
    api
  );

  assert.equal(result.groupTitle, '小助手Tab');
  assert.deepEqual(calls, [['groupTabs', [1], 10]]);
});

test('groupTabByRules prefers the most specific existing title group', async () => {
  const calls = [];
  const api = {
    queryTabs: async () => [
      { id: 2, title: '飞书旧页', groupId: 9 },
      { id: 3, title: '小助手旧页', groupId: 10 }
    ],
    getGroup: async groupId => ({ id: groupId, title: groupId === 9 ? '飞书文档' : '小助手' }),
    groupTabs: async ({ tabIds, groupId }) => calls.push(['groupTabs', tabIds, groupId]),
    updateGroup: async () => calls.push(['updateGroup'])
  };

  const result = await groupTabByRules(
    { id: 1, title: '2026.05 以旧换新小助手 - 飞书云文档', url: 'https://bytedance.larkoffice.com/wiki/HyklwpfR4ilN2ykMvs0cpndCnne' },
    [{ name: '飞书文档', urlKeyword: 'bytedance.larkoffice.com' }],
    api
  );

  assert.equal(result.groupTitle, '小助手');
  assert.deepEqual(calls, [['groupTabs', [1], 10]]);
});

test('groupTabByRules does not regroup a tab already in the matched group', async () => {
  const calls = [];
  const api = {
    queryTabs: async () => [{ id: 1, title: '当前页', groupId: 10 }],
    getGroup: async groupId => ({ id: groupId, title: '小助手' }),
    groupTabs: async () => calls.push(['groupTabs']),
    updateGroup: async () => calls.push(['updateGroup'])
  };

  const result = await groupTabByRules(
    { id: 1, groupId: 10, title: '2026.05 以旧换新小助手 - 飞书云文档', url: 'https://bytedance.larkoffice.com/wiki/HyklwpfR4ilN2ykMvs0cpndCnne' },
    [{ name: '飞书文档', urlKeyword: 'bytedance.larkoffice.com' }],
    api
  );

  assert.equal(result.grouped, true);
  assert.equal(result.reason, 'already-grouped');
  assert.equal(result.groupTitle, '小助手');
  assert.deepEqual(calls, []);
});

test('groupTabByRules treats temporarily uneditable tabs as a soft failure', async () => {
  const api = {
    queryTabs: async () => [{ id: 2, title: '小助手旧页', groupId: 10 }],
    getGroup: async groupId => ({ id: groupId, title: '小助手' }),
    groupTabs: async () => {
      throw new Error('Tabs cannot be edited right now (user may be dragging a tab).');
    },
    updateGroup: async () => {
      throw new Error('should not update');
    }
  };

  const result = await groupTabByRules(
    { id: 1, groupId: 9, title: '2026.05 以旧换新小助手 - 飞书云文档', url: 'https://bytedance.larkoffice.com/wiki/HyklwpfR4ilN2ykMvs0cpndCnne' },
    [{ name: '飞书文档', urlKeyword: 'bytedance.larkoffice.com' }],
    api
  );

  assert.deepEqual(result, { grouped: false, reason: 'temporarily-uneditable' });
});

test('groupTabByRules keeps a manually grouped tab during URL-only refresh events', async () => {
  const calls = [];
  const api = {
    queryTabs: async () => [
      { id: 1, title: '飞书云文档', groupId: 10 },
      { id: 2, title: '飞书旧页', groupId: 9 }
    ],
    getGroup: async groupId => ({ id: groupId, title: groupId === 9 ? '飞书文档' : '小助手' }),
    groupTabs: async ({ tabIds, groupId }) => calls.push(['groupTabs', tabIds, groupId]),
    updateGroup: async () => calls.push(['updateGroup'])
  };

  const result = await groupTabByRules(
    { id: 1, groupId: 10, title: '飞书云文档', url: 'https://bytedance.larkoffice.com/wiki/HyklwpfR4ilN2ykMvs0cpndCnne' },
    [{ name: '飞书文档', urlKeyword: 'bytedance.larkoffice.com' }],
    api
  );

  assert.deepEqual(result, { grouped: true, groupId: 10, groupTitle: '小助手', reason: 'keep-manual-group' });
  assert.deepEqual(calls, []);
});

test('groupTabByRules keeps manually assigned groups above title matched groups', async () => {
  const calls = [];
  const api = {
    queryTabs: async () => [
      { id: 1, title: 'AI 文档', groupId: 12 },
      { id: 2, title: 'AI 资料', groupId: 13 }
    ],
    getGroup: async groupId => ({ id: groupId, title: groupId === 12 ? '待阅读文档' : 'ai' }),
    groupTabs: async ({ tabIds, groupId }) => calls.push(['groupTabs', tabIds, groupId]),
    updateGroup: async () => calls.push(['updateGroup'])
  };

  const result = await groupTabByRules(
    { id: 1, groupId: 12, title: 'AI 阅读材料 - 飞书云文档', url: 'https://bytedance.larkoffice.com/wiki/Sn7rwMYqtiyx78kr2iccbxc4nUd' },
    [{ name: '飞书文档', urlKeyword: 'bytedance.larkoffice.com' }],
    api
  );

  assert.deepEqual(result, { grouped: true, groupId: 12, groupTitle: '待阅读文档', reason: 'keep-manual-group' });
  assert.deepEqual(calls, []);
});

test('groupTabByRules groups GitHub into an existing ai group by URL rule', async () => {
  const calls = [];
  const api = {
    queryTabs: async () => [{ id: 2, title: 'AI Home', groupId: 13 }],
    getGroup: async groupId => ({ id: groupId, title: 'ai' }),
    groupTabs: async ({ tabIds, groupId }) => calls.push(['groupTabs', tabIds, groupId]),
    updateGroup: async () => calls.push(['updateGroup'])
  };

  const result = await groupTabByRules(
    { id: 1, title: 'GitHub', url: 'https://github.com/' },
    [{ name: 'ai', urlKeyword: 'github.com' }],
    api
  );

  assert.equal(result.groupTitle, 'ai');
  assert.deepEqual(calls, [['groupTabs', [1], 13]]);
});
