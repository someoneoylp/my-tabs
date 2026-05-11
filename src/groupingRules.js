function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function titleKeywords(name) {
  const normalized = normalize(name);
  const compact = normalized.replace(/(tab|group|分组|页面)$/i, '');
  return [normalized, compact]
    .filter(keyword => keyword.length >= 2)
    .filter((keyword, index, list) => list.indexOf(keyword) === index);
}

export function titleMatchesRule(titleValue, rule) {
  return titleMatchScore(titleValue, rule) > 0;
}

export function titleMatchScore(titleValue, rule) {
  const title = normalize(titleValue);
  if (!title) return 0;
  return titleKeywords(rule.name)
    .filter(keyword => title.includes(keyword))
    .reduce((best, keyword) => Math.max(best, keyword.length), 0);
}

export function parseRuleLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return null;
  const slashIndex = trimmed.indexOf('/');
  const name = slashIndex >= 0 ? trimmed.slice(0, slashIndex).trim() : trimmed;
  const urlKeyword = slashIndex >= 0 ? trimmed.slice(slashIndex + 1).trim() : '';
  if (!name) return null;
  return { name, urlKeyword };
}

export function parseRulesText(text) {
  return String(text || '')
    .split('\n')
    .map(parseRuleLine)
    .filter(Boolean);
}

export function mergeRules(primaryRules, fallbackRules) {
  const seen = new Set();
  const merged = [];

  for (const rule of [...primaryRules, ...fallbackRules]) {
    const key = `${normalize(rule.name)}/${normalize(rule.urlKeyword)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(rule);
  }

  return merged;
}

export function serializeRules(rules) {
  return rules
    .map(rule => rule.urlKeyword ? `${rule.name}/${rule.urlKeyword}` : rule.name)
    .join('\n');
}

export function findMatchingRule(tab, rules) {
  const title = normalize(tab?.title);
  const url = normalize(tab?.url);

  const titleMatch = rules
    .map((rule, index) => ({ rule, index, score: titleMatchScore(title, rule) }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.rule;
  if (titleMatch) return titleMatch;

  return rules.find(rule => rule.urlKeyword && url.includes(normalize(rule.urlKeyword))) || null;
}
