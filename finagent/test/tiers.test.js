'use strict';

// 会员等级（entitlement）单元测试：
// 验证 can() / applyTier() / allowedVersions() 对三种角色（viewer/pro/analyst/pro/admin/enterprise）的输出
const test = require('node:test');
const assert = require('node:assert');
const { TIER, tierOf, can, allowedVersions, applyTier } = require('../src/entitlements/tiers');

test('tierOf maps roles to expected tiers', () => {
  assert.strictEqual(tierOf('viewer'), 'free');
  assert.strictEqual(tierOf('analyst'), 'pro');
  assert.strictEqual(tierOf('admin'), 'enterprise');
  assert.strictEqual(tierOf('unknown-role'), 'free'); // 兜底 free
});

test('allowedVersions returns tier-specific version list', () => {
  assert.deepStrictEqual(allowedVersions('viewer'), ['lite']);
  assert.deepStrictEqual(allowedVersions('analyst'), ['lite', 'full']);
  assert.deepStrictEqual(allowedVersions('admin'), ['lite', 'full']);
});

test('can() enforces feature gates by tier', () => {
  // free
  assert.strictEqual(can('predict', 'viewer'), false);
  assert.strictEqual(can('hitBacktest', 'viewer'), false);
  assert.strictEqual(can('regime', 'viewer'), false);
  assert.strictEqual(can('modelArena', 'viewer'), false);
  assert.strictEqual(can('evolution', 'viewer'), true); // 全部等级可看（条数受限）
  // pro
  assert.strictEqual(can('predict', 'analyst'), true);
  assert.strictEqual(can('hitBacktest', 'analyst'), true);
  assert.strictEqual(can('regime', 'analyst'), false); // regime 仅企业版
  assert.strictEqual(can('modelArena', 'analyst'), true);
  // enterprise
  assert.strictEqual(can('regime', 'admin'), true);
  assert.strictEqual(can('modelArena', 'admin'), true);
});

test('TIER quotas are monotonic: free < pro < enterprise', () => {
  assert.ok(TIER.free.apiRate < TIER.pro.apiRate);
  assert.ok(TIER.pro.apiRate < TIER.enterprise.apiRate);
  assert.ok(TIER.free.keyQuota < TIER.pro.keyQuota);
  assert.strictEqual(TIER.enterprise.keyQuota, Infinity);
  assert.strictEqual(TIER.enterprise.evolutionLimit, Infinity);
});

test('applyTier strips predict/regime/arena for free', () => {
  const snap = {
    ticker: 'AAPL',
    version: 'full',
    prediction: { horizons: [] },
    backtest: { historical: { accuracyPct: 50 } },
    inHouse: { model: 'T4-advanced', regime: { marketState: 'high-vol-trend-up' }, factors: { regime: 1 } },
    modelArena: { best: { key: 'T4' }, byRegime: { 'high-vol-trend-up': {} } },
    reasoning: { thought: 'x', regime: { marketState: 'low-vol-uptrend' } },
    metrics: { lastPrice: 100 },
  };
  const out = applyTier(snap, 'viewer');
  // free 用户访问 full 快照：prediction / backtest / modelArena / inHouse 整体被剥掉（降级为 lite 字段）
  assert.strictEqual(out.prediction, undefined);
  assert.strictEqual(out.backtest, undefined);
  assert.strictEqual(out.modelArena, undefined);
  assert.strictEqual(out.inHouse, undefined);
  // reasoning.regime 也隐藏（但 reasoning 本身保留）
  assert.ok(out.reasoning);
  assert.strictEqual(out.reasoning.regime, undefined);
  // 基础字段保留
  assert.strictEqual(out.metrics.lastPrice, 100);
});

test('applyTier preserves everything for enterprise', () => {
  const snap = {
    ticker: 'AAPL',
    version: 'full',
    prediction: { horizons: [] },
    backtest: { historical: { accuracyPct: 50 } },
    inHouse: { model: 'T4-advanced', regime: { marketState: 'high-vol-trend-up' } },
    modelArena: { best: { key: 'T4' }, byRegime: { 'high-vol-trend-up': {} } },
    reasoning: { thought: 'x', regime: { marketState: 'low-vol-uptrend' } },
    metrics: { lastPrice: 100 },
  };
  const out = applyTier(snap, 'admin');
  assert.deepStrictEqual(out, snap); // enterprise 全量保留
});

test('applyTier hides byRegime for non-enterprise but keeps arena', () => {
  const snap = {
    ticker: 'AAPL',
    version: 'full',
    modelArena: { best: { key: 'T4' }, byRegime: { 'mid-vol-bull': { byModel: {} } } },
    inHouse: { model: 'T4-advanced', regime: { marketState: 'mid-vol-bull' } },
    reasoning: { regime: { marketState: 'mid-vol-bull' } },
    metrics: { lastPrice: 100 },
  };
  const out = applyTier(snap, 'analyst'); // pro
  assert.ok(out.modelArena); // 保留竞技场本身
  assert.strictEqual(out.modelArena.byRegime, undefined); // 但隐藏 regime 分组
  assert.strictEqual(out.inHouse.regime, undefined);
  assert.strictEqual(out.reasoning.regime, undefined);
});

test('applyTier returns null for null snapshot', () => {
  assert.strictEqual(applyTier(null, 'viewer'), null);
  assert.strictEqual(applyTier(undefined, 'viewer'), undefined);
});
