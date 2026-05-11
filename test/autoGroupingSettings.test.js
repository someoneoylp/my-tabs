import test from 'node:test';
import assert from 'node:assert/strict';
import { isAutoGroupingAllowed, normalizeAutoGroupingSettings, toggleAutoGroupingDomain } from '../src/autoGroupingSettings.js';

test('auto grouping is enabled by default', () => {
  assert.deepEqual(normalizeAutoGroupingSettings({}), {
    autoGroupingEnabled: true,
    disabledAutoGroupDomains: []
  });
  assert.equal(isAutoGroupingAllowed('github.com', {}), true);
});

test('global auto grouping switch disables every domain', () => {
  assert.equal(isAutoGroupingAllowed('github.com', { autoGroupingEnabled: false }), false);
});

test('disabled domains are normalized before matching', () => {
  const settings = normalizeAutoGroupingSettings({
    autoGroupingEnabled: true,
    disabledAutoGroupDomains: [' GitHub.com ', 'github.com', '']
  });

  assert.deepEqual(settings.disabledAutoGroupDomains, ['github.com']);
  assert.equal(isAutoGroupingAllowed('GITHUB.com', settings), false);
  assert.equal(isAutoGroupingAllowed('example.com', settings), true);
});

test('domain auto grouping toggle adds and removes the domain', () => {
  const disabled = toggleAutoGroupingDomain('github.com', [], false);
  assert.deepEqual(disabled, ['github.com']);

  const enabled = toggleAutoGroupingDomain('GITHUB.com', disabled, true);
  assert.deepEqual(enabled, []);
});
