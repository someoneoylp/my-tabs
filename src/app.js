import { analyzeTabs, getDomain, getDomainGroups } from './analyzer.js';
import { browserApi } from './browserApi.js';
import { createActionManager } from './actions.js';
import { DEFAULT_RULES_TEXT } from './defaultRules.js';
import { DEFAULT_AUTO_GROUPING_ENABLED, DEFAULT_DISABLED_AUTO_GROUP_DOMAINS, isAutoGroupingAllowed, toggleAutoGroupingDomain } from './autoGroupingSettings.js';
import { createSmartGroupDraft, getUngroupedTabs } from './smartGrouping.js';

const app = document.querySelector('#app');
const actionManager = createActionManager(browserApi);
let state = {
  status: 'loading',
  tabs: [],
  tabGroups: [],
  bookmarks: [],
  analysis: null,
  settings: {
    inactiveDays: 3,
    groupingRulesText: DEFAULT_RULES_TEXT,
    autoGroupingEnabled: DEFAULT_AUTO_GROUPING_ENABLED,
    disabledAutoGroupDomains: DEFAULT_DISABLED_AUTO_GROUP_DOMAINS,
    bookmarkRemarks: {}
  },
  selectedTabIds: new Set(),
  searchQuery: '',
  smartGroupDraft: null,
  confirm: null
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

async function loadTabs() {
  state = { ...state, status: 'loading', confirm: null, smartGroupDraft: null, selectedTabIds: new Set() };
  render();
  try {
    const [tabs, tabGroups, bookmarks, settings] = await Promise.all([browserApi.getAllTabs(), browserApi.getTabGroups(), browserApi.getBookmarks(), browserApi.getSettings()]);
    const inactiveThresholdMs = settings.inactiveDays * 24 * 60 * 60 * 1000;
    state = { ...state, status: 'ready', tabs, tabGroups, bookmarks, settings, analysis: analyzeTabs(tabs, { inactiveThresholdMs }) };
  } catch (error) {
    state = { ...state, status: 'error', error: error?.message || '无法读取 Tab' };
  }
  render();
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function tabById(id) {
  return state.tabs.find(tab => tab.id === Number(id));
}

function nonPinnedTabs() {
  return state.tabs.filter(tab => !tab.pinned);
}

function visibleDomainGroups() {
  return getDomainGroups(state.tabs)
    .map(group => ({ ...group, tabs: group.tabs.filter(tab => !tab.pinned) }))
    .filter(group => group.tabs.length > 0);
}

function inactiveIdSet() {
  return new Set(state.analysis.inactiveTabs.map(tab => tab.id));
}

function duplicateCloseIdsAll() {
  return [...new Set(state.analysis.duplicateGroups.flatMap(group => group.recommendedCloseIds || []))];
}

function duplicateCloseIdsForDomain(domain) {
  const closeIds = [];
  for (const duplicateGroup of state.analysis.duplicateGroups) {
    const sameDomainTabs = duplicateGroup.tabs.filter(tab => !tab.pinned && getDomain(tab.url) === domain);
    if (sameDomainTabs.length <= 1) continue;
    closeIds.push(...sameDomainTabs.slice(1).map(tab => tab.id));
  }
  return [...new Set(closeIds)];
}

function inactiveCloseIdsForDomain(domain) {
  return state.analysis.inactiveTabs
    .filter(tab => getDomain(tab.url) === domain)
    .filter(tab => !tab.pinned)
    .map(tab => tab.id);
}

function selectedCountForGroup(group) {
  return group.tabs.filter(tab => state.selectedTabIds.has(tab.id)).length;
}

function bookmarkById(id) {
  return state.bookmarks.find(bookmark => bookmark.id === String(id));
}

function bookmarkRemark(bookmarkId) {
  return String(state.settings.bookmarkRemarks?.[bookmarkId] || '').trim();
}

function bookmarkDomainGroups() {
  const groups = new Map();
  for (const bookmark of state.bookmarks) {
    const domain = getDomain(bookmark.url);
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push(bookmark);
  }
  return [...groups.entries()]
    .map(([domain, bookmarks]) => ({
      domain,
      bookmarks: bookmarks.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
    }))
    .sort((a, b) => b.bookmarks.length - a.bookmarks.length || a.domain.localeCompare(b.domain));
}

function searchResults() {
  const query = state.searchQuery.trim().toLowerCase();
  if (!query) return { tabs: [], bookmarks: [] };
  const tabs = state.tabs
    .filter(tab => `${tab.title || ''}\n${tab.url || ''}`.toLowerCase().includes(query))
    .sort((a, b) => Number(b.active) - Number(a.active) || (b.lastAccessed || 0) - (a.lastAccessed || 0))
    .slice(0, 6);
  const bookmarks = state.bookmarks
    .filter(bookmark => `${bookmark.title || ''}\n${bookmark.url || ''}\n${bookmark.folder || ''}\n${bookmarkRemark(bookmark.id)}`.toLowerCase().includes(query))
    .sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0))
    .slice(0, 8);
  return { tabs, bookmarks };
}

function renderSearchResults() {
  const query = state.searchQuery.trim();
  if (!query) return '';
  const results = searchResults();
  if (results.tabs.length === 0 && results.bookmarks.length === 0) {
    return '<div class="search-empty">没有找到匹配的 Tab 或书签</div>';
  }
  return `
    <div class="search-result-list">
      ${results.tabs.map(tab => `
        <button class="search-result" data-action="focus-tab" data-tab-id="${tab.id}">
          <span class="search-title">${escapeHtml(tab.title)}</span>
          <span class="search-meta">Tab · ${escapeHtml(getDomain(tab.url))}${tab.pinned ? ' · 置顶' : ''}${tab.active ? ' · 当前' : ''}</span>
          <span class="search-url">${escapeHtml(tab.url)}</span>
        </button>
      `).join('')}
      ${results.bookmarks.map(bookmark => {
        const remark = bookmarkRemark(bookmark.id);
        return `
        <button class="search-result" data-action="open-bookmark" data-bookmark-id="${escapeHtml(bookmark.id)}">
          <span class="search-title">${escapeHtml(remark ? `${remark} · ${bookmark.title}` : bookmark.title)}</span>
          <span class="search-meta">书签 · ${escapeHtml(getDomain(bookmark.url))}</span>
          <span class="search-url">${escapeHtml(bookmark.url)}</span>
        </button>
      `;
      }).join('')}
    </div>
  `;
}

function renderSearchBox() {
  return `
    <section class="tab-search" aria-label="查找已打开的 Tab 和书签">
      <input type="search" data-setting="tab-search" value="${escapeHtml(state.searchQuery)}" placeholder="查找已打开的 Tab 或书签，输入名称或 URL" autocomplete="off" />
      <div class="search-results" data-search-results>${renderSearchResults()}</div>
    </section>
  `;
}

function renderHeader() {
  const groups = visibleDomainGroups();
  const cleanableCount = groups.reduce((sum, group) => sum + group.tabs.length, 0);
  const ungroupedCount = getUngroupedTabs(state.tabs).length;
  return `
    <header class="page-header">
      <div class="top-bar">
        <p class="brand">My Best Tabs</p>
        <div class="header-controls">
          <label class="toggle-control" title="自动匹配 Tab 分组">
            <input type="checkbox" data-setting="auto-grouping-enabled" ${state.settings.autoGroupingEnabled ? 'checked' : ''} />
            <span>自动匹配</span>
          </label>
          <label class="inactive-pill">
            <span></span>
            <select data-setting="inactive-days" aria-label="长时间未打开">
              ${[1, 3, 7, 14].map(days => `<option value="${days}" ${state.settings.inactiveDays === days ? 'selected' : ''}>${days} 天未打开</option>`).join('')}
            </select>
          </label>
          <button class="btn" data-action="open-smart-grouping" ${ungroupedCount === 0 ? 'disabled' : ''}>智能分组${ungroupedCount ? ` ${ungroupedCount}` : ''}</button>
          <button class="btn primary" data-action="reload">重新分析</button>
        </div>
      </div>

      <section class="hero">
        <img class="hero-logo" src="../icons/icon-128.png" alt="My Best Tabs" />
        <p>当前 ${nonPinnedTabs().length} 个非置顶 Tab，按 ${groups.length} 个域名整理；${cleanableCount} 个可清理，置顶已排除 · ${formatTime(state.analysis.snapshotTime)}</p>
      </section>
      ${renderSearchBox()}
    </header>
  `;
}

function renderBookmarksSection() {
  if (state.bookmarks.length === 0) return '';
  const groups = bookmarkDomainGroups();
  return `
    <section class="bookmarks-section">
      <div class="section-head">
        <div>
          <p class="section-label">Bookmarks</p>
          <h2>快速书签</h2>
        </div>
        <span class="section-note">${state.bookmarks.length} 个书签 · 按 ${groups.length} 个域名整理</span>
      </div>
      <div class="bookmark-grid">
        ${groups.map(group => renderBookmarkCard(group)).join('')}
      </div>
    </section>
  `;
}

function renderBookmarkCard(group) {
  return `
    <article class="bookmark-card">
      <div class="bookmark-card-head">
        <div>
          <h3>${escapeHtml(group.domain)}</h3>
          <p>${group.bookmarks.length} 个链接</p>
        </div>
      </div>
      <div class="bookmark-list">
        ${group.bookmarks.map(bookmark => renderBookmarkItem(bookmark)).join('')}
      </div>
    </article>
  `;
}

function renderBookmarkItem(bookmark) {
  const domain = getDomain(bookmark.url);
  const remark = bookmarkRemark(bookmark.id);
  return `
    <div class="bookmark-item" title="${escapeHtml(bookmark.url)}">
      <button class="bookmark-open" data-action="open-bookmark" data-bookmark-id="${escapeHtml(bookmark.id)}">
        <span class="bookmark-mark">${escapeHtml(domain.slice(0, 1).toUpperCase())}</span>
        <span class="bookmark-copy">
          <span>${escapeHtml(remark || bookmark.title)}</span>
          <small>${escapeHtml(remark ? bookmark.title : bookmark.folder)}</small>
        </span>
      </button>
      <input class="bookmark-remark" data-setting="bookmark-remark" data-bookmark-id="${escapeHtml(bookmark.id)}" value="${escapeHtml(remark)}" placeholder="备注" aria-label="书签备注名" />
    </div>
  `;
}

function renderRulesPanel() {
  return `
    <section class="rules-section">
      <p class="section-label">Auto-archive rules</p>
      <div class="rules-card">
        <div class="rules-card-header">
          <div class="rules-title">
            <span class="rules-icon">≡</span>
            <strong>Grouping rules</strong>
          </div>
          <button class="link-button" data-action="save-grouping-rules">Save</button>
        </div>
        <div class="rules-grid">
          <label>
            <span>Group name / URL keyword</span>
            <textarea data-setting="grouping-rules" spellcheck="false" placeholder="One rule per line&#10;e.g. inbox&#10;github">${escapeHtml(state.settings.groupingRulesText)}</textarea>
          </label>
          <label>
            <span>Example</span>
            <pre>email
飞书文档/bytedance.larkoffice.com</pre>
          </label>
        </div>
        <p class="rules-help">Title match takes priority over URL. URL keyword can be left blank.</p>
      </div>
    </section>
  `;
}

function renderDomainGrid(groups) {
  if (groups.length === 0) {
    return '<section class="empty-board">没有可管理的非置顶 Tab。</section>';
  }
  const selectedTotal = state.selectedTabIds.size;
  const duplicateTotal = duplicateCloseIdsAll().length;
  return `
    <section class="groups-section">
      <div class="section-head">
        <div>
          <p class="section-label">Tab groups</p>
          <h2>按域名清理</h2>
        </div>
        <div class="batch-actions">
          <span>${selectedTotal ? `已选 ${selectedTotal} 个` : '勾选后可批量清理'}</span>
          <button class="btn danger ghost" data-action="clear-all-duplicates" ${duplicateTotal === 0 ? 'disabled' : ''}>清理重复</button>
          <button class="btn danger ghost" data-action="clear-selected-all" ${selectedTotal === 0 ? 'disabled' : ''}>清理已选</button>
        </div>
      </div>
      <div class="card-grid">
        ${groups.map(group => renderDomainCard(group)).join('')}
      </div>
    </section>
  `;
}

function renderDomainCard(group) {
  const duplicateCount = duplicateCloseIdsForDomain(group.domain).length;
  const inactiveCount = inactiveCloseIdsForDomain(group.domain).length;
  const selectedCount = selectedCountForGroup(group);
  const domainAutoGroupingEnabled = isAutoGroupingAllowed(group.domain, state.settings);
  return `
    <article class="mini-card">
      <div class="mini-card-header">
        <div class="domain-mark">${escapeHtml(group.domain.slice(0, 1).toUpperCase())}</div>
        <div class="domain-copy">
          <h2>${escapeHtml(group.domain)}</h2>
          <p>${group.tabs.length} 个 Tab · ${duplicateCount} 个重复${selectedCount ? ` · 已选 ${selectedCount}` : ''}</p>
        </div>
        <div class="card-actions">
          <label class="domain-toggle" title="${escapeHtml(group.domain)} 自动匹配">
            <input type="checkbox" data-setting="domain-auto-grouping" data-domain="${escapeHtml(group.domain)}" ${domainAutoGroupingEnabled ? 'checked' : ''} ${state.settings.autoGroupingEnabled ? '' : 'disabled'} />
            <span>自动</span>
          </label>
          <button class="link-button" data-action="clear-duplicates" data-domain="${escapeHtml(group.domain)}" ${duplicateCount === 0 ? 'disabled' : ''}>重复</button>
          <button class="link-button" data-action="clear-inactive-domain" data-domain="${escapeHtml(group.domain)}" ${inactiveCount === 0 ? 'disabled' : ''}>${state.settings.inactiveDays}天未开</button>
          <button class="link-button danger" data-action="clear-domain" data-domain="${escapeHtml(group.domain)}">全部</button>
        </div>
      </div>

      <div class="url-stack">
        ${group.tabs.map(tab => renderUrlChip(tab, group.domain)).join('')}
      </div>
    </article>
  `;
}

function renderUrlChip(tab, domain) {
  const inactiveIds = inactiveIdSet();
  const checked = state.selectedTabIds.has(tab.id) ? 'checked' : '';
  const badges = [
    inactiveIds.has(tab.id) ? `<span class="badge">${state.settings.inactiveDays} 天未打开</span>` : '',
    tab.active ? '<span class="badge">当前</span>' : ''
  ].filter(Boolean).join('');
  return `
    <div class="url-chip">
      <input type="checkbox" data-action="toggle-tab" data-tab-id="${tab.id}" ${checked} />
      <div class="url-chip-main">
        <div class="url-chip-title">${escapeHtml(tab.title)}</div>
        <div class="url-chip-url">${escapeHtml(tab.url)}</div>
        ${badges ? `<div class="url-badges">${badges}</div>` : ''}
      </div>
      <div class="url-chip-actions">
        <button class="icon-open" title="打开这个 Tab" data-action="focus-tab" data-tab-id="${tab.id}">打开</button>
        <button class="icon-clean" title="单独清理" data-action="clear-one" data-domain="${escapeHtml(domain)}" data-tab-id="${tab.id}">关闭</button>
      </div>
    </div>
  `;
}

function smartSuggestionTab(suggestion) {
  return tabById(suggestion.tabId);
}

function renderSmartGroupPanel() {
  if (!state.smartGroupDraft) return '';
  const suggestions = state.smartGroupDraft.suggestions;
  const activeSuggestions = suggestions.filter(suggestion => suggestion.targetMode !== 'skip');

  return `
    <div class="confirm-backdrop">
      <section class="smart-panel">
        <div class="smart-panel-head">
          <div>
            <p class="eyebrow">Smart grouping preview</p>
            <h2>未分组 Tab 智能预览</h2>
            <p class="subtitle">先检查建议结果，可以改到已有分组、新建分组，或跳过某个页面。</p>
          </div>
          <button class="link-button" data-action="cancel-smart-grouping">关闭</button>
        </div>
        ${suggestions.length === 0 ? '<div class="empty-board compact">当前没有可自动分组的未分组 Tab。</div>' : `
          <div class="smart-list">
            ${suggestions.map(suggestion => {
              const tab = smartSuggestionTab(suggestion);
              if (!tab) return '';
              const selectedValue = suggestion.targetMode === 'existing' ? `existing:${suggestion.targetGroupId}` : suggestion.targetMode;
              const existingOptions = state.smartGroupDraft.existingGroups
                .filter(group => group.windowId === undefined || tab.windowId === undefined || group.windowId === tab.windowId)
                .map(group => `
                <option value="existing:${group.id}" ${selectedValue === `existing:${group.id}` ? 'selected' : ''}>${escapeHtml(group.title)}</option>
              `).join('');
              return `
                <div class="smart-row">
                  <div class="smart-tab-copy">
                    <strong>${escapeHtml(tab.title)}</strong>
                    <span>${escapeHtml(getDomain(tab.url))}</span>
                    <small>${escapeHtml(suggestion.reason)}</small>
                  </div>
                  <div class="smart-controls">
                    <select data-setting="smart-target" data-tab-id="${tab.id}">
                      ${existingOptions}
                      <option value="new" ${selectedValue === 'new' ? 'selected' : ''}>新建分组</option>
                      <option value="skip" ${selectedValue === 'skip' ? 'selected' : ''}>跳过</option>
                    </select>
                    <input data-setting="smart-new-title" data-tab-id="${tab.id}" value="${escapeHtml(suggestion.newGroupTitle || '')}" placeholder="新分组名" ${suggestion.targetMode === 'new' ? '' : 'disabled'} />
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <div class="smart-panel-footer">
            <span>将处理 ${activeSuggestions.length} 个 Tab</span>
            <div class="actions">
              <button class="btn" data-action="cancel-smart-grouping">取消</button>
              <button class="btn primary" data-action="apply-smart-grouping" ${activeSuggestions.length === 0 ? 'disabled' : ''}>确认分组</button>
            </div>
          </div>
        `}
      </section>
    </div>
  `;
}

function renderConfirmDialog() {
  if (!state.confirm) return '';
  const tabs = state.confirm.tabIds.map(tabById).filter(Boolean);
  return `
    <div class="confirm-backdrop">
      <section class="confirm-dialog">
        <p class="eyebrow">${escapeHtml(state.confirm.label)}</p>
        <h2>确认关闭 ${tabs.length} 个 Tab？</h2>
        <p class="subtitle">此操作不会影响置顶 Tab。关闭后页面会重新分析当前列表。</p>
        <div class="confirm-list">
          ${tabs.map(tab => `<div class="confirm-item"><strong>${escapeHtml(tab.title)}</strong><br><span class="muted">${escapeHtml(getDomain(tab.url))} · 将执行：关闭</span></div>`).join('')}
        </div>
        <div class="actions">
          <button class="btn" data-action="cancel-confirm">取消</button>
          <button class="btn danger" data-action="confirm-close">确认关闭</button>
        </div>
      </section>
    </div>
  `;
}

function render() {
  if (state.status === 'loading') {
    app.innerHTML = '<section class="loading-card"><p class="eyebrow">My Best Tabs</p><h1>正在分析当前 Tab…</h1><p>正在按域名整理 Tab，置顶页面不会进入统计。</p></section>';
    return;
  }
  if (state.status === 'error') {
    app.innerHTML = `<section class="error-card"><h1>无法读取 Tab</h1><p>${escapeHtml(state.error)}</p><button class="btn" data-action="reload">重试</button></section>`;
    return;
  }
  const groups = visibleDomainGroups();
  app.innerHTML = `${renderHeader()}${renderBookmarksSection()}${renderDomainGrid(groups)}${renderRulesPanel()}${renderSmartGroupPanel()}${renderConfirmDialog()}`;
}

async function changeInactiveDays(days) {
  const inactiveDays = Number(days) || 3;
  await browserApi.saveSettings({ inactiveDays });
  state = { ...state, settings: { ...state.settings, inactiveDays } };
  await loadTabs();
}

async function changeAutoGroupingEnabled(enabled) {
  const autoGroupingEnabled = Boolean(enabled);
  await browserApi.saveSettings({ autoGroupingEnabled });
  state = {
    ...state,
    settings: { ...state.settings, autoGroupingEnabled }
  };
  render();
}

async function changeDomainAutoGrouping(domain, enabled) {
  const disabledAutoGroupDomains = toggleAutoGroupingDomain(domain, state.settings.disabledAutoGroupDomains, Boolean(enabled));
  await browserApi.saveSettings({ disabledAutoGroupDomains });
  state = {
    ...state,
    settings: { ...state.settings, disabledAutoGroupDomains }
  };
  render();
}

async function saveGroupingRules() {
  const textarea = app.querySelector('[data-setting="grouping-rules"]');
  const groupingRulesText = textarea?.value || '';
  await browserApi.saveSettings({ groupingRulesText });
  state = { ...state, settings: { ...state.settings, groupingRulesText } };
  render();
}

function openSmartGrouping() {
  const draft = createSmartGroupDraft({
    tabs: state.tabs,
    groups: state.tabGroups,
    rulesText: state.settings.groupingRulesText
  });
  state = { ...state, smartGroupDraft: draft };
  render();
}

function updateSmartSuggestion(tabId, updater) {
  if (!state.smartGroupDraft) return;
  const suggestions = state.smartGroupDraft.suggestions.map(suggestion => {
    if (suggestion.tabId !== Number(tabId)) return suggestion;
    return updater(suggestion);
  });
  state = { ...state, smartGroupDraft: { ...state.smartGroupDraft, suggestions } };
}

function changeSmartTarget(tabId, value) {
  updateSmartSuggestion(tabId, suggestion => {
    if (value === 'skip') return { ...suggestion, targetMode: 'skip', targetGroupId: null };
    if (value === 'new') return { ...suggestion, targetMode: 'new', targetGroupId: null, newGroupTitle: suggestion.newGroupTitle || getDomain(tabById(tabId)?.url) };
    const groupId = Number(value.replace('existing:', ''));
    return { ...suggestion, targetMode: 'existing', targetGroupId: groupId };
  });
  render();
}

function changeSmartNewTitle(tabId, value) {
  updateSmartSuggestion(tabId, suggestion => ({ ...suggestion, newGroupTitle: value }));
}

async function applySmartGrouping() {
  if (!state.smartGroupDraft) return;
  const existingGroups = new Map();
  const newGroups = new Map();

  for (const suggestion of state.smartGroupDraft.suggestions) {
    const tab = tabById(suggestion.tabId);
    if (!tab || tab.pinned || suggestion.targetMode === 'skip') continue;
    if (suggestion.targetMode === 'existing' && suggestion.targetGroupId !== null) {
      const key = Number(suggestion.targetGroupId);
      if (!existingGroups.has(key)) existingGroups.set(key, []);
      existingGroups.get(key).push(tab.id);
    }
    if (suggestion.targetMode === 'new') {
      const title = String(suggestion.newGroupTitle || '').trim();
      if (!title) continue;
      const key = `${tab.windowId || 'current'}::${title}`;
      if (!newGroups.has(key)) newGroups.set(key, { title, tabIds: [] });
      newGroups.get(key).tabIds.push(tab.id);
    }
  }

  for (const [groupId, tabIds] of existingGroups.entries()) {
    await browserApi.groupTabs({ tabIds, groupId });
  }
  const colors = ['blue', 'green', 'yellow', 'purple', 'cyan', 'pink'];
  let colorIndex = 0;
  for (const { title, tabIds } of newGroups.values()) {
    const groupId = await browserApi.groupTabs({ tabIds });
    if (groupId !== null && groupId !== undefined) {
      await browserApi.updateGroup(groupId, { title, color: colors[colorIndex % colors.length] });
      colorIndex += 1;
    }
  }

  state = { ...state, smartGroupDraft: null };
  await loadTabs();
}

async function changeBookmarkRemark(bookmarkId, value) {
  const nextRemarks = { ...(state.settings.bookmarkRemarks || {}) };
  const remark = String(value || '').trim();
  if (remark) nextRemarks[String(bookmarkId)] = remark;
  else delete nextRemarks[String(bookmarkId)];
  await browserApi.saveSettings({ bookmarkRemarks: nextRemarks });
  state = { ...state, settings: { ...state.settings, bookmarkRemarks: nextRemarks } };
  render();
}

function groupByDomain(domain) {
  return visibleDomainGroups().find(group => group.domain === domain);
}

function toggleTab(tabId) {
  const tab = tabById(tabId);
  if (!tab || tab.pinned) return;
  const next = new Set(state.selectedTabIds);
  if (next.has(tab.id)) next.delete(tab.id); else next.add(tab.id);
  state = { ...state, selectedTabIds: next };
  render();
}

function requestCloseTabIds(tabIds, label) {
  const safeIds = tabIds.filter(id => {
    const tab = tabById(id);
    return tab && !tab.pinned;
  });
  if (safeIds.length === 0) {
    state = { ...state, confirm: null };
    render();
    return;
  }
  state = { ...state, confirm: { tabIds: safeIds, label } };
  render();
}

function requestClearDomain(domain) {
  const group = groupByDomain(domain);
  requestCloseTabIds(group.tabs.map(tab => tab.id), `清理 ${domain} 下的全部非置顶 Tab`);
}

function requestClearDuplicates(domain) {
  requestCloseTabIds(duplicateCloseIdsForDomain(domain), `清理 ${domain} 下的重复 Tab，并保留每组 1 个`);
}

function requestClearAllDuplicates() {
  requestCloseTabIds(duplicateCloseIdsAll(), '清理全部重复 Tab，并保留每组 1 个');
}

function requestClearInactiveDomain(domain) {
  requestCloseTabIds(inactiveCloseIdsForDomain(domain), `清理 ${domain} 下 ${state.settings.inactiveDays} 天未打开的 Tab`);
}

function requestClearSelectedDomain(domain) {
  const group = groupByDomain(domain);
  const selectedIds = group.tabs.map(tab => tab.id).filter(id => state.selectedTabIds.has(id));
  requestCloseTabIds(selectedIds, `清理 ${domain} 下已选 ${selectedIds.length} 个 Tab`);
}

function requestClearSelectedAll() {
  requestCloseTabIds([...state.selectedTabIds], `批量清理已选 ${state.selectedTabIds.size} 个 Tab`);
}

function requestClearOne(tabId) {
  const tab = tabById(tabId);
  requestCloseTabIds([Number(tabId)], `单独清理「${tab?.title || 'Tab'}」`);
}

async function confirmClose() {
  const tabs = state.confirm.tabIds.map(tabById).filter(Boolean);
  await actionManager.closeTabs(tabs, state.confirm.label);
  state = { ...state, confirm: null, selectedTabIds: new Set() };
  await loadTabs();
  render();
}

async function focusTab(tabId) {
  await browserApi.focusTab(tabId);
}

async function openBookmark(bookmarkId) {
  const bookmark = bookmarkById(bookmarkId);
  if (!bookmark?.url) return;
  await browserApi.openUrl(bookmark.url);
}

app.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'reload') await loadTabs();
  if (action === 'save-grouping-rules') await saveGroupingRules();
  if (action === 'open-smart-grouping') openSmartGrouping();
  if (action === 'cancel-smart-grouping') { state = { ...state, smartGroupDraft: null }; render(); }
  if (action === 'apply-smart-grouping') await applySmartGrouping();
  if (action === 'toggle-tab') toggleTab(Number(target.dataset.tabId));
  if (action === 'clear-domain') requestClearDomain(target.dataset.domain);
  if (action === 'clear-duplicates') requestClearDuplicates(target.dataset.domain);
  if (action === 'clear-all-duplicates') requestClearAllDuplicates();
  if (action === 'clear-inactive-domain') requestClearInactiveDomain(target.dataset.domain);
  if (action === 'clear-selected-domain') requestClearSelectedDomain(target.dataset.domain);
  if (action === 'clear-selected-all') requestClearSelectedAll();
  if (action === 'clear-one') requestClearOne(Number(target.dataset.tabId));
  if (action === 'cancel-confirm') { state = { ...state, confirm: null }; render(); }
  if (action === 'confirm-close') await confirmClose();
  if (action === 'focus-tab') await focusTab(Number(target.dataset.tabId));
  if (action === 'open-bookmark') await openBookmark(target.dataset.bookmarkId);
});

app.addEventListener('input', event => {
  const target = event.target.closest('[data-setting]');
  if (!target) return;
  if (target.dataset.setting === 'tab-search') {
    state = { ...state, searchQuery: target.value };
    const results = app.querySelector('[data-search-results]');
    if (results) results.innerHTML = renderSearchResults();
  }
  if (target.dataset.setting === 'smart-new-title') {
    changeSmartNewTitle(Number(target.dataset.tabId), target.value);
  }
});

app.addEventListener('change', async event => {
  const target = event.target.closest('[data-setting]');
  if (!target) return;
  if (target.dataset.setting === 'inactive-days') await changeInactiveDays(target.value);
  if (target.dataset.setting === 'auto-grouping-enabled') await changeAutoGroupingEnabled(target.checked);
  if (target.dataset.setting === 'domain-auto-grouping') await changeDomainAutoGrouping(target.dataset.domain, target.checked);
  if (target.dataset.setting === 'smart-target') changeSmartTarget(Number(target.dataset.tabId), target.value);
  if (target.dataset.setting === 'bookmark-remark') await changeBookmarkRemark(target.dataset.bookmarkId, target.value);
});

loadTabs();
