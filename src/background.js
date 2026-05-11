import { DEFAULT_RULES_TEXT } from './defaultRules.js';
import { getDomain } from './analyzer.js';
import { DEFAULT_AUTO_GROUPING_ENABLED, DEFAULT_DISABLED_AUTO_GROUP_DOMAINS, isAutoGroupingAllowed } from './autoGroupingSettings.js';
import { mergeRules, parseRulesText } from './groupingRules.js';
import { groupTabByRules } from './tabGrouper.js';

const groupApi = {
  queryTabs: query => chrome.tabs.query(query),
  getGroup: groupId => chrome.tabGroups.get(groupId),
  groupTabs: options => chrome.tabs.group(options),
  updateGroup: (groupId, update) => chrome.tabGroups.update(groupId, update)
};

async function getRules() {
  const result = await chrome.storage.local.get({ groupingRulesText: DEFAULT_RULES_TEXT });
  return mergeRules(parseRulesText(result.groupingRulesText), parseRulesText(DEFAULT_RULES_TEXT));
}

async function getAutoGroupingSettings() {
  return chrome.storage.local.get({
    autoGroupingEnabled: DEFAULT_AUTO_GROUPING_ENABLED,
    disabledAutoGroupDomains: DEFAULT_DISABLED_AUTO_GROUP_DOMAINS
  });
}

async function autoGroupTab(tab) {
  if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) return;
  const settings = await getAutoGroupingSettings();
  if (!isAutoGroupingAllowed(getDomain(tab.url), settings)) return;
  const rules = await getRules();
  await groupTabByRules(tab, rules, groupApi);
}

chrome.action.onClicked.addListener(async () => {
  const managerUrl = chrome.runtime.getURL('src/manager.html');
  const existingTabs = await chrome.tabs.query({ url: managerUrl });

  if (existingTabs.length > 0 && existingTabs[0].id !== undefined) {
    await chrome.tabs.update(existingTabs[0].id, { active: true });
    if (existingTabs[0].windowId !== undefined) {
      await chrome.windows.update(existingTabs[0].windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: managerUrl });
});

chrome.tabs.onCreated.addListener(tab => {
  autoGroupTab(tab).catch(console.error);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.title || changeInfo.url || changeInfo.status === 'complete') {
    autoGroupTab(tab).catch(console.error);
  }
});
