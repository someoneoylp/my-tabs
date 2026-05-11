export const DEFAULT_AUTO_GROUPING_ENABLED = true;
export const DEFAULT_DISABLED_AUTO_GROUP_DOMAINS = [];

export function normalizeDisabledDomains(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(domain => String(domain || '').trim().toLowerCase())
    .filter(Boolean))];
}

export function normalizeAutoGroupingSettings(settings = {}) {
  return {
    autoGroupingEnabled: settings.autoGroupingEnabled !== false,
    disabledAutoGroupDomains: normalizeDisabledDomains(settings.disabledAutoGroupDomains)
  };
}

export function isAutoGroupingAllowed(domain, settings = {}) {
  const normalized = normalizeAutoGroupingSettings(settings);
  if (!normalized.autoGroupingEnabled) return false;
  return !normalized.disabledAutoGroupDomains.includes(String(domain || '').trim().toLowerCase());
}

export function toggleAutoGroupingDomain(domain, disabledDomains, enabled) {
  const normalizedDomain = String(domain || '').trim().toLowerCase();
  const next = new Set(normalizeDisabledDomains(disabledDomains));
  if (!normalizedDomain) return [...next];
  if (enabled) next.delete(normalizedDomain);
  else next.add(normalizedDomain);
  return [...next];
}
