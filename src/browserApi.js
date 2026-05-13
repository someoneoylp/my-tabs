import { DEFAULT_RULES_TEXT } from './defaultRules.js';
import { DEFAULT_AUTO_GROUPING_ENABLED, DEFAULT_DISABLED_AUTO_GROUP_DOMAINS, normalizeAutoGroupingSettings } from './autoGroupingSettings.js';
import { mergeRules, parseRulesText, serializeRules } from './groupingRules.js';

function collectBookmarks(nodes, path = [], results = []) {
  for (const node of nodes || []) {
    if (node.url) {
      results.push({
        id: node.id,
        title: node.title || node.url,
        url: node.url,
        folder: path.filter(Boolean).join(' / ') || 'Bookmarks',
        dateAdded: node.dateAdded || 0
      });
      continue;
    }

    const nextPath = node.title ? [...path, node.title] : path;
    collectBookmarks(node.children, nextPath, results);
  }
  return results;
}

export const browserApi = {
  async getAllTabs() {
    const tabs = await chrome.tabs.query({});
    return tabs.map(tab => ({
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title || '未命名页面',
      url: tab.url || '',
      favIconUrl: tab.favIconUrl || '',
      active: Boolean(tab.active),
      pinned: Boolean(tab.pinned),
      groupId: typeof tab.groupId === 'number' ? tab.groupId : -1,
      lastAccessed: tab.lastAccessed || Date.now()
    }));
  },

  async getTabGroups() {
    if (!chrome.tabGroups?.query) return [];
    const groups = await chrome.tabGroups.query({});
    return groups.map(group => ({
      id: group.id,
      windowId: group.windowId,
      title: group.title || '未命名分组',
      color: group.color || 'grey'
    }));
  },

  async getTab(tabId) {
    try {
      return await chrome.tabs.get(tabId);
    } catch {
      return null;
    }
  },

  async closeTabs(tabIds) {
    if (tabIds.length === 0) return;
    await chrome.tabs.remove(tabIds);
  },

  async createTab({ url, windowId, active = false }) {
    return chrome.tabs.create({ url, windowId, active });
  },

  async openUrl(url) {
    const currentTab = await chrome.tabs.getCurrent();
    if (currentTab?.id !== undefined) {
      return chrome.tabs.update(currentTab.id, { url, active: true });
    }
    return chrome.tabs.create({ url, active: true });
  },

  async focusTab(tabId) {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab?.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return tab;
  },

  async groupTabs({ tabIds, groupId }) {
    if (!tabIds?.length) return null;
    const options = groupId === undefined || groupId === null ? { tabIds } : { tabIds, groupId };
    return chrome.tabs.group(options);
  },

  async updateGroup(groupId, update) {
    return chrome.tabGroups.update(groupId, update);
  },

  async getBookmarks() {
    if (!chrome.bookmarks?.getTree) return [];
    const tree = await chrome.bookmarks.getTree();
    return collectBookmarks(tree);
  },

  async getSettings() {
    const result = await chrome.storage.local.get({
      inactiveDays: 3,
      groupingRulesText: DEFAULT_RULES_TEXT,
      autoGroupingEnabled: DEFAULT_AUTO_GROUPING_ENABLED,
      disabledAutoGroupDomains: DEFAULT_DISABLED_AUTO_GROUP_DOMAINS,
      bookmarkRemarks: {}
    });
    const groupingRules = mergeRules(parseRulesText(result.groupingRulesText), parseRulesText(DEFAULT_RULES_TEXT));
    const autoGroupingSettings = normalizeAutoGroupingSettings(result);
    return {
      inactiveDays: Number(result.inactiveDays) || 3,
      groupingRulesText: serializeRules(groupingRules),
      bookmarkRemarks: result.bookmarkRemarks && typeof result.bookmarkRemarks === 'object' ? result.bookmarkRemarks : {},
      ...autoGroupingSettings
    };
  },

  async saveSettings(settings) {
    await chrome.storage.local.set(settings);
  }
};
