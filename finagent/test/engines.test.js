'use strict';
const test = require('node:test');
const assert = require('node:assert');
const analyze = require('../src/engines/analyze');
const predict = require('../src/engines/predict');
const backtest = require('../src/engines/backtest');
const inhouse = require('../src/engines/inhouse');
const arena = require('../src/engines/arena');
const dryrun = require('../src/engines/dryrun');
const { simulateSeries } = require('../src/collectors');

function series(ticker, days) {
  return simulateSeries(ticker, { lookbackDays: days }).map((b) => ({ ...b, ticker }));
}

test('analyze simple metrics shape', () => {
  const bars = series('T1', 200);
  const m = analyze.simpleMetrics(bars);
  assert.ok(m.sma20 != null && m.rsi != null && m.atr != null);
  assert.ok(['bullish', 'bearish', 'neutral'].includes(m.trend));
});

test('analyze full metrics + score', () => {
  const bars = series('T2', 400);
  const m = analyze.fullMetrics(bars);
  assert.ok(m.macd != null && m.boll != null && m.vol != null);
  assert.ok(Number.isFinite(m.score));
});

test('predict returns horizons with confidence (in-house)', () => {
  const bars = series('T3', 500);
  const p = predict.predict(bars, { enabled: true, horizons: [5, 20, 60] });
  assert.strictEqual(p.horizons.length, 3);
  assert.ok(p.horizons.every((h) => h.target > 0 && h.confidence > 0));
  assert.ok(p.modelTier); // in-house tier
});

test('backtest hit rate computed', () => {
  const bars = series('T4', 500);
  const p = predict.predict(bars, { enabled: true, horizons: [5, 20, 60] });
  const rec = p._record;
  const baseIdx = Math.max(0, bars.length - 100);
  rec.asOf = bars[baseIdx].date;
  const report = backtest.backtest('T4', bars, [rec], { threshold: 0.05 });
  assert.ok(report.accuracyPct != null || report.totalForecastPoints === 0);
});

test('in-house model picks a tier and reasons', () => {
  const bars = series('IH', 1500);
  const sig = inhouse.pickModel(bars, null);
  assert.ok(sig.model.startsWith('T'));
  const thesis = inhouse.reason(sig, bars, {});
  assert.ok(['up', 'down', 'flat'].includes(thesis.direction));
  assert.ok(Array.isArray(thesis.hypotheses) && thesis.hypotheses.length > 0);
  assert.ok(thesis.uncertainty >= 0 && thesis.uncertainty <= 100);
});

test('model arena ranks T1..T4 + baseline by win rate', () => {
  const bars = series('AR', 1500);
  const a = arena.arena(bars, null);
  assert.strictEqual(a.scored.length, 5);
  assert.ok(a.best.key);
  assert.ok(a.scored.every((s) => s.winRate >= 0));
});

test('historical dry-run produces immediate hit rate', () => {
  const bars = series('DR', 1500);
  const rep = dryrun.historicalDryRun(bars, { horizon: 5, threshold: 0.02 });
  assert.ok(rep.samples > 0);
  assert.ok(rep.accuracyPct != null && rep.accuracyPct >= 0);
  assert.ok(Array.isArray(rep.adaptiveFeedback) && rep.adaptiveFeedback.length > 0);
  assert.ok(rep.modelArena.best.key);
});
