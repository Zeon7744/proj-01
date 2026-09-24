'use strict';

// 数字员工系统 + 基准对标 单元测试
const test = require('node:test');
const assert = require('node:assert');
const workers = require('../src/engines/workers');
const benchmark = require('../src/engines/benchmark');

// 造一段足够长的确定性 bars（1700 bar，触发 T4）
function fakeBars(n = 1700, seed = 100) {
  const bars = [];
  let p = seed;
  for (let i = 0; i < n; i++) {
    const d = new Date(2016, 0, 1 + Math.floor(i / 5));
    p = p * (1 + 0.0004 + Math.sin(i / 40) * 0.002);
    const close = Math.round(p * 100) / 100;
    bars.push({
      ticker: 'TEST',
      date: d.toISOString().slice(0, 10),
      open: close,
      high: close * 1.005,
      low: close * 0.995,
      close,
      volume: 1e6,
      adjclose: close,
    });
  }
  return bars;
}

test('workers.rosterFor returns tier-sized rosters', () => {
  assert.strictEqual(workers.rosterFor('free').length, 3);
  assert.strictEqual(workers.rosterFor('pro').length, 5);
  assert.strictEqual(workers.rosterFor('enterprise').length, 7);
  // roster key 形式
  assert.strictEqual(workers.rosterFor('lite3').length, 3);
  assert.strictEqual(workers.rosterFor('enterprise7').length, 7);
});

test('workers.ROLES defines all 7 digital employees', () => {
  const keys = Object.keys(workers.ROLES);
  for (const k of ['collector', 'analyst', 'modeler', 'forecaster', 'backtester', 'auditor', 'strategist']) {
    assert.ok(keys.includes(k), 'missing role ' + k);
  }
  for (const k of keys) {
    assert.ok(workers.ROLES[k].title, 'role ' + k + ' needs a title');
    assert.ok(workers.ROLES[k].duty, 'role ' + k + ' needs a duty');
  }
});

test('workers.workerReport builds a per-employee row with status', () => {
  const bars = fakeBars(1700);
  const rec = {
    ticker: 'TEST',
    version: 'full',
    source: 'simulated',
    multi: [{ source: 'simulated', bars: bars.length }],
    bars: bars.length,
    metrics: { lastPrice: 100, trend: 'bullish', rsi: 62 },
    inHouse: { model: 'T4-advanced', tier: 'T4', upgraded: false },
    prediction: { horizons: [{ days: 5, target: 101.2, expectedReturnPct: 1.2 }] },
    backtest: { historical: { hits: 70, samples: 80, accuracyPct: 87.5 } },
    modelArena: { byRegime: { 'low-vol-uptrend': {} } },
  };
  const report = workers.workerReport('enterprise', rec, {});
  assert.strictEqual(report.tier, 'enterprise');
  assert.strictEqual(report.headcount, 7);
  const keys = report.rows.map((r) => r.key);
  for (const k of ['collector', 'analyst', 'modeler', 'forecaster', 'backtester', 'auditor', 'strategist']) {
    assert.ok(keys.includes(k));
  }
  const backtester = report.rows.find((r) => r.key === 'backtester');
  assert.strictEqual(backtester.status, 'ok');
  assert.ok(backtester.produced.includes('87.5%'));
});

test('benchmark.benchmarkGap produces a verdict on a single ticker', () => {
  const bars = fakeBars(1700, 80);
  const gap = benchmark.benchmarkGap([bars], { modelKey: 'T4-advanced', horizonDays: 20 });
  assert.strictEqual(gap.available, true);
  assert.ok(['outperforming', 'underperforming', 'on-par'].includes(gap.summary.verdict));
  assert.ok(Array.isArray(gap.perTicker));
  assert.strictEqual(gap.perTicker.length, 1);
  // 单标的 MRS = 该标的自身收益，相对组合均值（=自身）超额应为 0
  assert.strictEqual(gap.perTicker[0].outperformancePct, 0);
  assert.ok(typeof gap.summary.avgModelHitRate === 'number');
  assert.ok(gap.generatedAt);
});

test('benchmark.marketRelativeStrength returns null on empty input', () => {
  assert.strictEqual(benchmark.marketRelativeStrength([]), null);
  assert.strictEqual(benchmark.marketRelativeStrength(null), null);
});

test('benchmark.portfolioBaseline aggregates multiple tickers', () => {
  const a = fakeBars(300, 100);
  const b = fakeBars(300, 200);
  b.forEach((x) => (x.ticker = 'B'));
  const base = benchmark.portfolioBaseline([a, b], { horizonDays: 20 });
  assert.strictEqual(base.tickers, 2);
  assert.ok(base.best && base.worst);
  assert.ok(typeof base.avgRetPct === 'number');
});

test('benchmark.modelWalkForwardHitRate returns a 0-100 percentage', () => {
  const bars = fakeBars(1700, 50);
  const rate = benchmark.modelWalkForwardHitRate(bars, 'T4-advanced', 0.015);
  assert.ok(rate >= 0 && rate <= 100, 'hit rate out of range: ' + rate);
});
