import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTabs,
  normalizeUrl,
  getInactiveTabs,
  getDuplicateGroups,
  getTopicClusters,
  getDomainGroups
} from '../src/analyzer.js';

const now = new Date('2026-05-10T08:00:00Z').getTime();

const tabs = [
  { id: 1, windowId: 10, title: 'Chrome Extension Manifest V3', url: 'https://developer.chrome.com/docs/extensions/mv3', active: false, lastAccessed: now - 2 * 24 * 60 * 60 * 1000 },
  { id: 2, windowId: 10, title: 'Chrome Extension Manifest V3', url: 'https://developer.chrome.com/docs/extensions/mv3#intro', active: false, lastAccessed: now - 60 * 60 * 1000 },
  { id: 3, windowId: 10, title: 'Chrome Extension Manifest V3', url: 'https://developer.chrome.com/docs/extensions/mv3', active: false, lastAccessed: now - 30 * 60 * 1000 },
  { id: 4, windowId: 11, title: 'React useEffect guide', url: 'https://react.dev/reference/react/useEffect', active: true, lastAccessed: now - 5 * 60 * 1000 },
  { id: 5, windowId: 11, title: 'React state management', url: 'https://react.dev/learn/state-a-components-memory', active: false, lastAccessed: now - 3 * 24 * 60 * 60 * 1000 }
];

test('normalizeUrl removes hash but keeps meaningful path', () => {
  assert.equal(normalizeUrl('https://example.com/path?a=1#part'), 'https://example.com/path?a=1');
});

test('getDuplicateGroups groups normalized URLs and recommends non-active older duplicates', () => {
  const groups = getDuplicateGroups(tabs);
  const urlGroup = groups.find(group => group.reason === '相同 URL');
  assert.equal(urlGroup.tabs.length, 3);
  assert.deepEqual(urlGroup.recommendedCloseIds, [2, 1]);
});

test('getDuplicateGroups also groups tabs with the same title', () => {
  const sameTitleTabs = [
    { id: 10, windowId: 1, title: 'Same Doc', url: 'https://a.example/doc', active: false, lastAccessed: now - 5000 },
    { id: 11, windowId: 1, title: 'Same Doc', url: 'https://b.example/doc', active: false, lastAccessed: now - 1000 },
    { id: 12, windowId: 1, title: 'Other Doc', url: 'https://c.example/doc', active: false, lastAccessed: now - 1000 }
  ];
  const groups = getDuplicateGroups(sameTitleTabs);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].reason, '标题相同');
  assert.equal(groups[0].title, 'Same Doc');
  assert.deepEqual(groups[0].recommendedCloseIds, [10]);
});

test('getDuplicateGroups keeps pinned tabs and never recommends closing them', () => {
  const pinnedTabs = [
    { id: 20, windowId: 1, title: 'Pinned Doc', url: 'https://same.example/doc', pinned: true, active: false, lastAccessed: now - 10_000 },
    { id: 21, windowId: 1, title: 'Pinned Doc', url: 'https://same.example/doc', pinned: false, active: false, lastAccessed: now - 1_000 }
  ];
  const groups = getDuplicateGroups(pinnedTabs);
  assert.equal(groups[0].keepId, 20);
  assert.deepEqual(groups[0].recommendedCloseIds, [21]);
});

test('getInactiveTabs returns tabs inactive for at least three days by default', () => {
  const inactive = getInactiveTabs(tabs, now);
  assert.deepEqual(inactive.map(tab => tab.id), [5]);
});

test('getInactiveTabs excludes pinned tabs from cleanup candidates', () => {
  const inactive = getInactiveTabs([
    { id: 30, windowId: 1, title: 'Pinned Old', url: 'https://old.example', pinned: true, lastAccessed: now - 10 * 24 * 60 * 60 * 1000 },
    { id: 31, windowId: 1, title: 'Old', url: 'https://old2.example', pinned: false, lastAccessed: now - 10 * 24 * 60 * 60 * 1000 }
  ], now);
  assert.deepEqual(inactive.map(tab => tab.id), [31]);
});

test('getTopicClusters groups related tabs by domain keyword', () => {
  const clusters = getTopicClusters(tabs);
  assert.equal(clusters.some(cluster => cluster.name.includes('developer.chrome.com')), true);
  assert.equal(clusters.some(cluster => cluster.name.includes('react.dev')), true);
});

test('getTopicClusters excludes pinned tabs from cleanup ids', () => {
  const clusters = getTopicClusters([
    { id: 40, windowId: 1, title: 'Docs A', url: 'https://docs.example/a', pinned: true },
    { id: 41, windowId: 1, title: 'Docs B', url: 'https://docs.example/b', pinned: false }
  ]);
  assert.deepEqual(clusters[0].tabIds, [41]);
});

test('getDomainGroups groups tabs by domain and excludes pinned tabs from cleanup ids', () => {
  const groups = getDomainGroups([
    { id: 50, windowId: 1, title: 'Docs A', url: 'https://docs.example/a', pinned: true },
    { id: 51, windowId: 1, title: 'Docs B', url: 'https://docs.example/b', pinned: false },
    { id: 52, windowId: 1, title: 'Mail', url: 'https://mail.example/inbox', pinned: false }
  ]);
  const docs = groups.find(group => group.domain === 'docs.example');
  assert.equal(docs.tabs.length, 2);
  assert.deepEqual(docs.cleanupTabIds, [51]);
  assert.equal(groups[0].domain, 'docs.example');
});

test('analyzeTabs returns suggestion cards and snapshot metadata', () => {
  const result = analyzeTabs(tabs, { now });
  assert.equal(result.totalTabs, 5);
  assert.equal(result.duplicateGroups.length, 1);
  assert.equal(result.inactiveTabs.length, 1);
  assert.equal(result.topicClusters.length >= 2, true);
  assert.equal(typeof result.snapshotTime, 'string');
});
