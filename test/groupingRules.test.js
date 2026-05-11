import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRuleLine,
  parseRulesText,
  findMatchingRule,
  mergeRules,
  serializeRules,
  titleMatchScore
} from '../src/groupingRules.js';

test('parseRuleLine supports group name and optional URL keyword', () => {
  assert.deepEqual(parseRuleLine('飞书文档/bytedance.larkoffice.com'), {
    name: '飞书文档',
    urlKeyword: 'bytedance.larkoffice.com'
  });
  assert.deepEqual(parseRuleLine('邮箱'), {
    name: '邮箱',
    urlKeyword: ''
  });
});

test('parseRulesText ignores blank lines and invalid empty names', () => {
  assert.deepEqual(parseRulesText('\n邮箱\n /empty\n飞书文档/bytedance.larkoffice.com\n'), [
    { name: '邮箱', urlKeyword: '' },
    { name: '飞书文档', urlKeyword: 'bytedance.larkoffice.com' }
  ]);
});

test('findMatchingRule prefers title match over URL match', () => {
  const rules = parseRulesText('邮箱/mail.example.com\n飞书文档/bytedance.larkoffice.com');
  const rule = findMatchingRule({ title: 'Outlook 邮箱', url: 'https://bytedance.larkoffice.com/doc/1' }, rules);
  assert.equal(rule.name, '邮箱');
});

test('findMatchingRule falls back to URL keyword when title does not match', () => {
  const rules = parseRulesText('邮箱/mail.example.com\n飞书文档/bytedance.larkoffice.com');
  const rule = findMatchingRule({ title: '产品 PRD', url: 'https://bytedance.larkoffice.com/doc/1' }, rules);
  assert.equal(rule.name, '飞书文档');
});

test('findMatchingRule returns null when nothing matches', () => {
  const rules = parseRulesText('邮箱/mail.example.com');
  assert.equal(findMatchingRule({ title: 'GitHub', url: 'https://github.com' }, rules), null);
});

test('findMatchingRule treats group names as bidirectional title keywords', () => {
  const rules = parseRulesText('小助手Tab\n飞书文档/bytedance.larkoffice.com');
  const rule = findMatchingRule({ title: '小助手项目文档', url: 'https://bytedance.larkoffice.com/wiki/abc' }, rules);
  assert.equal(rule.name, '小助手Tab');
});

test('findMatchingRule prefers the most specific title match before URL fallback', () => {
  const rules = parseRulesText('飞书文档/bytedance.larkoffice.com\n小助手');
  const rule = findMatchingRule(
    { title: '2026.05 以旧换新小助手 - 飞书云文档', url: 'https://bytedance.larkoffice.com/wiki/HyklwpfR4ilN2ykMvs0cpndCnne' },
    rules
  );
  assert.equal(rule.name, '小助手');
});

test('mergeRules appends missing default rules without duplicating user rules', () => {
  const rules = mergeRules(
    parseRulesText('邮箱\nai/github.com'),
    parseRulesText('邮箱\n飞书文档/bytedance.larkoffice.com\nai/github.com')
  );

  assert.equal(serializeRules(rules), '邮箱\nai/github.com\n飞书文档/bytedance.larkoffice.com');
});

test('titleMatchScore matches useful parts split by separators', () => {
  assert.equal(
    titleMatchScore('服务商工作台', { name: '服务商&商家工作台' }),
    3
  );
});
