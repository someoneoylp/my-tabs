import test from 'node:test';
import assert from 'node:assert/strict';
import { createSmartGroupDraft, getUngroupedTabs } from '../src/smartGrouping.js';

test('only suggests manageable ungrouped non-pinned tabs', () => {
  const tabs = [
    { id: 1, title: 'AI Home', url: 'https://chatgpt.com', groupId: -1 },
    { id: 2, title: 'Pinned', url: 'https://example.com', groupId: -1, pinned: true },
    { id: 3, title: 'Grouped', url: 'https://github.com', groupId: 11 },
    { id: 4, title: 'Settings', url: 'chrome://extensions', groupId: -1 }
  ];

  assert.deepEqual(getUngroupedTabs(tabs).map(tab => tab.id), [1]);
});

test('prefers existing group titles before domain fallback', () => {
  const draft = createSmartGroupDraft({
    tabs: [{ id: 1, title: '服务商工作台 | 橙蕉', url: 'https://partner.jinritemai.com/service/service-ability', groupId: -1 }],
    groups: [{ id: 21, title: '服务商&商家工作台' }, { id: 13, title: 'partner.jinritemai.com' }]
  });

  assert.deepEqual(draft.suggestions[0], {
    tabId: 1,
    targetMode: 'existing',
    targetGroupId: 21,
    targetTitleOverride: '',
    newGroupTitle: '',
    reason: '匹配已有分组「服务商&商家工作台」'
  });
});

test('uses domain to suggest existing or new groups', () => {
  const draft = createSmartGroupDraft({
    tabs: [
      { id: 1, title: 'GitHub issue', url: 'https://github.com/someoneoylp/my-tabs', groupId: -1 },
      { id: 2, title: 'Inbox', url: 'https://mail.example.com', groupId: -1 }
    ],
    groups: [{ id: 13, title: 'github.com' }]
  });

  assert.equal(draft.suggestions[0].targetMode, 'existing');
  assert.equal(draft.suggestions[0].targetGroupId, 13);
  assert.equal(draft.suggestions[1].targetMode, 'new');
  assert.equal(draft.suggestions[1].newGroupTitle, 'mail.example.com');
});

test('only suggests existing groups in the same window', () => {
  const draft = createSmartGroupDraft({
    tabs: [{ id: 1, windowId: 1, title: 'AI Home', url: 'https://github.com/someoneoylp/my-tabs', groupId: -1 }],
    groups: [{ id: 13, windowId: 2, title: 'ai' }]
  });

  assert.equal(draft.suggestions[0].targetMode, 'new');
  assert.equal(draft.suggestions[0].newGroupTitle, 'github.com');
});

test('falls back to domain for unknown tabs', () => {
  const draft = createSmartGroupDraft({
    tabs: [{ id: 1, title: 'Dashboard', url: 'https://docs.example.com/a', groupId: -1 }],
    groups: []
  });

  assert.equal(draft.suggestions[0].targetMode, 'new');
  assert.equal(draft.suggestions[0].newGroupTitle, 'docs.example.com');
});
