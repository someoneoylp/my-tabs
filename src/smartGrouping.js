import { titleMatchScore } from './groupingRules.js';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function isManageableUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || '未命名分组';
  } catch {
    return '未命名分组';
  }
}

function findGroupByTitle(tab, groups) {
  return groups
    .map((group, index) => ({ group, index, score: titleMatchScore(tab.title, { name: group.title }) }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.group || null;
}

function findGroupByDomain(tab, groups) {
  const domain = normalize(domainFromUrl(tab.url));
  return groups.find(group => normalize(group.title) === domain) || null;
}

function suggestionForTab(tab, groups) {
  const candidateGroups = groups.filter(group => group.windowId === undefined || tab.windowId === undefined || group.windowId === tab.windowId);
  const titleGroup = findGroupByTitle(tab, candidateGroups);
  if (titleGroup) {
    return {
      tabId: tab.id,
      targetMode: 'existing',
      targetGroupId: titleGroup.id,
      targetTitleOverride: '',
      newGroupTitle: '',
      reason: `匹配已有分组「${titleGroup.title}」`
    };
  }

  const domainGroup = findGroupByDomain(tab, candidateGroups);
  if (domainGroup) {
    return {
      tabId: tab.id,
      targetMode: 'existing',
      targetGroupId: domainGroup.id,
      targetTitleOverride: '',
      newGroupTitle: '',
      reason: `域名匹配已有分组「${domainGroup.title}」`
    };
  }

  return {
    tabId: tab.id,
    targetMode: 'new',
    targetGroupId: null,
    targetTitleOverride: '',
    newGroupTitle: domainFromUrl(tab.url),
    reason: '按域名新建分组'
  };
}

export function getUngroupedTabs(tabs) {
  return tabs
    .filter(tab => !tab.pinned)
    .filter(tab => tab.groupId === undefined || tab.groupId === null || tab.groupId < 0)
    .filter(tab => isManageableUrl(tab.url));
}

export function createSmartGroupDraft({ tabs, groups }) {
  const ungroupedTabs = getUngroupedTabs(tabs);
  return {
    suggestions: ungroupedTabs.map(tab => suggestionForTab(tab, groups)),
    existingGroups: groups.map(group => ({
      id: group.id,
      windowId: group.windowId,
      title: group.title || '未命名分组',
      color: group.color || 'grey'
    }))
  };
}
