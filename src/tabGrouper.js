import { findMatchingRule, titleMatchScore } from './groupingRules.js';

const DEFAULT_GROUP_COLOR = 'green';

async function getExistingGroups(api) {
  const tabs = await api.queryTabs({});
  const groupIds = [...new Set(tabs.map(tab => tab.groupId).filter(groupId => typeof groupId === 'number' && groupId >= 0))];
  const groups = [];

  for (const groupId of groupIds) {
    if (!api.getGroup) continue;
    try {
      groups.push(await api.getGroup(groupId));
    } catch {
      // Ignore stale group ids.
    }
  }
  return groups;
}

function findExistingGroupIdByTitle(title, groups) {
  return groups.find(group => group?.title === title)?.id ?? null;
}

function findExistingGroupById(groupId, groups) {
  return groups.find(group => group?.id === groupId) || null;
}

function isRuleManagedGroup(group, rules) {
  return rules.some(rule => rule.name === group?.title);
}

function findTitleMatchedExistingGroup(tabTitle, groups) {
  return groups
    .map((group, index) => ({ group, index, score: titleMatchScore(tabTitle, { name: group?.title || '' }) }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.group || null;
}

function isTemporarilyUneditable(error) {
  return /tabs cannot be edited right now/i.test(error?.message || '');
}

async function groupIntoExistingGroup(tab, group, api) {
  if (tab.groupId === group.id) {
    return { grouped: true, groupId: group.id, groupTitle: group.title, reason: 'already-grouped' };
  }

  try {
    await api.groupTabs({ tabIds: [tab.id], groupId: group.id });
  } catch (error) {
    if (isTemporarilyUneditable(error)) return { grouped: false, reason: 'temporarily-uneditable' };
    throw error;
  }

  return { grouped: true, groupId: group.id, groupTitle: group.title };
}

export async function groupTabByRules(tab, rules, api) {
  if (!tab?.id) return { grouped: false, reason: 'missing-tab-id' };
  if (tab.pinned) return { grouped: false, reason: 'pinned-tab' };

  const rule = findMatchingRule(tab, rules);
  const groups = await getExistingGroups(api);
  const currentGroup = findExistingGroupById(tab.groupId, groups);
  const titleMatchedGroup = findTitleMatchedExistingGroup(tab.title, groups);
  if (currentGroup && titleMatchedGroup?.id === currentGroup.id) {
    return groupIntoExistingGroup(tab, titleMatchedGroup, api);
  }

  if (currentGroup && !isRuleManagedGroup(currentGroup, rules)) {
    return { grouped: true, groupId: currentGroup.id, groupTitle: currentGroup.title, reason: 'keep-manual-group' };
  }

  if (titleMatchedGroup) {
    return groupIntoExistingGroup(tab, titleMatchedGroup, api);
  }

  if (!rule) return { grouped: false, reason: 'no-match' };

  if (currentGroup) {
    return { grouped: true, groupId: currentGroup.id, groupTitle: currentGroup.title, reason: 'keep-existing-group' };
  }

  const existingGroupId = findExistingGroupIdByTitle(rule.name, groups);
  if (existingGroupId !== null) {
    return groupIntoExistingGroup(tab, { id: existingGroupId, title: rule.name }, api);
  }

  let groupId;
  try {
    groupId = await api.groupTabs({ tabIds: [tab.id] });
  } catch (error) {
    if (isTemporarilyUneditable(error)) return { grouped: false, reason: 'temporarily-uneditable' };
    throw error;
  }
  await api.updateGroup(groupId, { title: rule.name, color: DEFAULT_GROUP_COLOR });
  return { grouped: true, groupId, groupTitle: rule.name };
}
