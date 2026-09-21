'use strict';
const test = require('node:test');
const assert = require('node:assert');
const regime = require('../src/engines/regime');
const inhouse = require('../src/engines/inhouse');
const evolution = require('../src/engines/evolution');
const { simulateSeries } = require('../src/collectors');

function series(ticker, days) {
  return simulateSeries(ticker, { lookbackDays: days }).map((b) => ({ ...b, ticker }));
}

test('regime features computed for a 1500-bar series', () => {
  const bars = series('REG', 1500);
  const r = regime.regimeFeatures(bars);
  assert.ok(r.available);
  assert.ok(['high', 'mid', 'low'].includes(r.volRegime));
  assert.ok(['expanding', 'contracting', 'stable'].includes(r.volTrend));
  assert.ok(['low-vol-uptrend', 'low-vol-downtrend', 'mid-vol-bull', 'mid-vol-bear', 'high-vol-trend-up', 'high-vol-trend-down'].includes(r.marketState));
  assert.ok(r.riskAdjust >= 0.5 && r.riskAdjust <= 1.4);
});

test('T4 signal carries regime in factors and thesis', () => {
  const bars = series('T4R', 1500);
  const sig = inhouse.pickModel(bars, null);
  const t4 = inhouse.t4Advanced(bars, null);
  assert.ok(t4.factors.regime, 'T4 factors should include regime');
  assert.ok(t4.regime, 'T4 signal should expose regime');
  const thesis = inhouse.reason(t4, bars, {});
  assert.ok(thesis.regime, 'thesis should carry regime');
  assert.ok(/Regime:/.test(thesis.thought), 'thought should reference regime');
  assert.ok(sig.model.startsWith('T'));
});

test('evolution log records and truncates events', () => {
  const ev = evolution.record({ kind: 'calibration', ticker: 'TEST', detail: 'test-event' });
  assert.ok(ev.id.startsWith('ev_'));
  const all = evolution.latest(5);
  assert.ok(all.length >= 1);
  assert.ok(all.some((x) => x.ticker === 'TEST'));
});

test('T3 factors carry regime (for adaptive feedback)', () => {
  const bars = series('T3R', 1500);
  const t3 = inhouse.t3Adaptive(bars, null);
  assert.ok(t3.factors.regime, 'T3 factors should include regime');
  assert.ok(t3.regime, 'T3 signal should expose regime');
});
