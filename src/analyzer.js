const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INACTIVE_THRESHOLD_MS = 3 * ONE_DAY_MS;
const IGNORED_PROTOCOLS = new Set(['chrome:', 'chrome-extension:', 'edge:', 'about:']);

export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    return url.toString();
  } catch {
    return rawUrl || '';
  }
}

export function getDomain(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '未知来源';
  }
}

export function isManageableTab(tab) {
  if (!tab?.url) return false;
  try {
    const url = new URL(tab.url);
    return !IGNORED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function normalizeTitle(title) {
  return String(title || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildDuplicateGroup(id, title, reason, groupTabs, url = '') {
  const sorted = [...groupTabs].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    if (a.active && !b.active) return -1;
    if (!a.active && b.active) return 1;
    return (b.lastAccessed || 0) - (a.lastAccessed || 0);
  });
  const keep = sorted[0];
  return {
    id,
    url: url || keep.url,
    title: title || keep.title || url,
    domain: getDomain(keep.url || url),
    reason,
    keepId: keep.id,
    tabs: sorted,
    recommendedCloseIds: sorted.slice(1).filter(tab => !tab.active && !tab.pinned).map(tab => tab.id)
  };
}

export function getDuplicateGroups(tabs) {
  const manageableTabs = tabs.filter(isManageableTab);
  const byUrl = new Map();
  for (const tab of manageableTabs) {
    const key = normalizeUrl(tab.url);
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(tab);
  }

  const usedIds = new Set();
  const urlGroups = [...byUrl.entries()]
    .filter(([, groupTabs]) => groupTabs.length > 1)
    .map(([url, groupTabs]) => {
      groupTabs.forEach(tab => usedIds.add(tab.id));
      return buildDuplicateGroup(`duplicate:url:${url}`, groupTabs[0].title || url, '相同 URL', groupTabs, url);
    });

  const byTitle = new Map();
  for (const tab of manageableTabs.filter(tab => !usedIds.has(tab.id))) {
    const key = normalizeTitle(tab.title);
    if (!key) continue;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(tab);
  }

  const titleGroups = [...byTitle.entries()]
    .filter(([, groupTabs]) => groupTabs.length > 1)
    .map(([titleKey, groupTabs]) => buildDuplicateGroup(`duplicate:title:${titleKey}`, groupTabs[0].title, '标题相同', groupTabs));

  return [...urlGroups, ...titleGroups];
}

export function getInactiveTabs(tabs, now = Date.now(), thresholdMs = DEFAULT_INACTIVE_THRESHOLD_MS) {
  return tabs
    .filter(isManageableTab)
    .filter(tab => !tab.pinned)
    .filter(tab => typeof tab.lastAccessed === 'number')
    .filter(tab => now - tab.lastAccessed >= thresholdMs)
    .sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));
}

export function getDomainGroups(tabs) {
  const byDomain = new Map();
  for (const tab of tabs.filter(isManageableTab)) {
    const domain = getDomain(tab.url);
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain).push(tab);
  }

  return [...byDomain.entries()]
    .map(([domain, groupTabs]) => ({
      id: `domain:${domain}`,
      domain,
      title: domain,
      reason: `来自 ${domain} 的 ${groupTabs.length} 个 Tab，可按域名集中管理`,
      tabs: groupTabs,
      cleanupTabIds: groupTabs.filter(tab => !tab.pinned).map(tab => tab.id)
    }))
    .sort((a, b) => b.tabs.length - a.tabs.length || a.domain.localeCompare(b.domain));
}

export function getTopicClusters(tabs) {
  return getDomainGroups(tabs)
    .filter(group => group.tabs.length >= 2)
    .map(group => ({
      id: `topic:${group.domain}`,
      name: `${group.domain} 相关页面`,
      reason: `这些 Tab 来自同一域名 ${group.domain}，可能属于同一任务或资料组`,
      tabs: group.tabs,
      tabIds: group.cleanupTabIds
    }));
}

export function analyzeTabs(tabs, options = {}) {
  const now = options.now ?? Date.now();
  const manageableTabs = tabs.filter(isManageableTab);
  return {
    snapshotTime: new Date(now).toISOString(),
    totalTabs: manageableTabs.length,
    duplicateGroups: getDuplicateGroups(manageableTabs),
    inactiveTabs: getInactiveTabs(manageableTabs, now, options.inactiveThresholdMs ?? DEFAULT_INACTIVE_THRESHOLD_MS),
    topicClusters: getTopicClusters(manageableTabs)
  };
}
