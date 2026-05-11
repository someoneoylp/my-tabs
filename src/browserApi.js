import { DEFAULT_RULES_TEXT } from './defaultRules.js';
import { DEFAULT_AUTO_GROUPING_ENABLED, DEFAULT_DISABLED_AUTO_GROUP_DOMAINS, normalizeAutoGroupingSettings } from './autoGroupingSettings.js';
import { mergeRules, parseRulesText, serializeRules } from './groupingRules.js';

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
      lastAccessed: tab.lastAccessed || Date.now()
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

  async getSettings() {
    const result = await chrome.storage.local.get({
      inactiveDays: 3,
      groupingRulesText: DEFAULT_RULES_TEXT,
      autoGroupingEnabled: DEFAULT_AUTO_GROUPING_ENABLED,
      disabledAutoGroupDomains: DEFAULT_DISABLED_AUTO_GROUP_DOMAINS
    });
    const groupingRules = mergeRules(parseRulesText(result.groupingRulesText), parseRulesText(DEFAULT_RULES_TEXT));
    const autoGroupingSettings = normalizeAutoGroupingSettings(result);
    return {
      inactiveDays: Number(result.inactiveDays) || 3,
      groupingRulesText: serializeRules(groupingRules),
      ...autoGroupingSettings
    };
  },

  async saveSettings(settings) {
    await chrome.storage.local.set(settings);
  }
};
