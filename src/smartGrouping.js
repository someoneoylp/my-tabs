import { DEFAULT_RULES_TEXT } from './defaultRules.js';
import { findMatchingRule, mergeRules, parseRulesText, titleMatchScore } from './groupingRules.js';

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

function findGroupByRule(rule, groups) {
  if (!rule) return null;
  const ruleName = normalize(rule.name);
  return groups.find(group => normalize(group.title) === ruleName)
    || groups.find(group => titleMatchScore(group.title, rule) > 0)
    || null;
}

function findGroupByTitle(tab, groups) {
  return groups
    .map((group, index) => ({ group, index, score: titleMatchScore(tab.title, { name: group.title }) }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.group || null;
}

function suggestionForTab(tab, groups, rules) {
  const candidateGroups = groups.filter(group => group.windowId === undefined || tab.windowId === undefined || group.windowId === tab.windowId);
  const titleGroup = findGroupByTitle(tab, candidateGroups);
  if (titleGroup) {
    return {
      tabId: tab.id,
      targetMode: 'existing',
      targetGroupId: titleGroup.id,
      newGroupTitle: '',
      reason: `标题匹配「${titleGroup.title}」`
    };
  }

  const rule = findMatchingRule(tab, rules);
  const ruleGroup = findGroupByRule(rule, candidateGroups);
  if (ruleGroup) {
    return {
      tabId: tab.id,
      targetMode: 'existing',
      targetGroupId: ruleGroup.id,
      newGroupTitle: '',
      reason: `规则匹配「${rule.name}」`
    };
  }

  if (rule) {
    return {
      tabId: tab.id,
      targetMode: 'new',
      targetGroupId: null,
      newGroupTitle: rule.name,
      reason: `建议新建规则分组`
    };
  }

  return {
    tabId: tab.id,
    targetMode: 'new',
    targetGroupId: null,
    newGroupTitle: domainFromUrl(tab.url),
    reason: '按域名建议新分组'
  };
}

export function getUngroupedTabs(tabs) {
  return tabs
    .filter(tab => !tab.pinned)
    .filter(tab => tab.groupId === undefined || tab.groupId === null || tab.groupId < 0)
    .filter(tab => isManageableUrl(tab.url));
}

export function createSmartGroupDraft({ tabs, groups, rulesText }) {
  const rules = mergeRules(parseRulesText(rulesText), parseRulesText(DEFAULT_RULES_TEXT));
  const ungroupedTabs = getUngroupedTabs(tabs);
  return {
    suggestions: ungroupedTabs.map(tab => suggestionForTab(tab, groups, rules)),
    existingGroups: groups.map(group => ({
      id: group.id,
      windowId: group.windowId,
      title: group.title || '未命名分组',
      color: group.color || 'grey'
    }))
  };
}
