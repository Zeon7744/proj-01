'use strict';

// 模型竞技场：对同一组 bars 运行 T1..T4 + baseline，用 walk-forward 命中率评估，选出最佳模型。
// 结果会持久化到 data/processed/{ticker}.modelArena，供命中回测与自我升级使用。
// v2: 命中阈值收紧到 1.5%（更严格），并暴露 threshold 字段。
const inhouse = require('./inhouse');
const { regimeFeatures } = require('./regime');

function arena(bars, feedback, opts = {}) {
  const threshold = (opts.threshold && Number(opts.threshold)) || 0.015;
  const models = [
    { key: 'baseline', label: 'Baseline momentum', fn: () => ({ ...inhouse.baselineForecast(bars, 5), model: 'baseline' }) },
    { key: 'T1', label: 'T1 lite rule', fn: () => inhouse.t1Signal(bars) },
    { key: 'T2', label: 'T2 multi-factor', fn: () => inhouse.t2Factors(bars) },
    { key: 'T3', label: 'T3 adaptive', fn: () => inhouse.t3Adaptive(bars, feedback) },
    { key: 'T4', label: 'T4 advanced', fn: () => inhouse.t4Advanced(bars, feedback) },
  ];

  const results = models.map((m) => {
    let sig;
    try {
      sig = m.fn();
    } catch (e) {
      sig = { model: m.label, target: null, confidence: 0, reason: `error: ${e.message}`, error: true };
    }
    sig.key = m.key;
    sig.label = m.label;
    return sig;
  });

  const scored = results.map((sig) => {
    if (sig.error) return { ...sig, winRate: 0, avgAbsErr: Infinity };
    const wf = walkForward(bars, sig.model, threshold);
    return { ...sig, winRate: wf.winRate, avgAbsErr: wf.avgAbsErr, samples: wf.samples };
  });

  scored.sort((a, b) => b.winRate - a.winRate || a.avgAbsErr - b.avgAbsErr);
  const best = scored[0];
  return {
    bars: bars.length,
    asOf: bars[bars.length - 1].date,
    threshold,
    scored,
    byRegime: byRegimeGrouping(bars, scored, threshold),
    best: {
      key: best.key,
      label: best.label,
      winRate: best.winRate,
      avgAbsErr: best.avgAbsErr,
      model: best.model,
      target: best.target,
      confidence: best.confidence,
    },
    generatedAt: new Date().toISOString(),
  };
}

// regime 分组评估：对每个 walk-forward 采样点，记录当时的 regime.marketState，
// 统计同一 regime 下每个模型的胜率，方便发现“某模型只在特定市场状态下表现好”。
// 仅 enterprise 用户会在 applyTier 中保留此字段（其余等级隐藏）。
function byRegimeGrouping(bars, scored, threshold) {
  if (!bars || bars.length < 252) return null;
  const modelKeys = scored.map((s) => s.key);
  const byRegime = {};

  // 对所有采样点：按 regime.marketState 分桶，统计每个模型在该桶内的命中/总样本
  const closes = bars.map((b) => b.close);
  const start = Math.max(252, Math.floor(closes.length * 0.35));
  for (let i = start; i < closes.length; i += 10) {
    const win = bars.slice(Math.max(0, i - 252), i + 1);
    const reg = regimeFeatures(win);
    if (!reg || !reg.available) continue;
    const state = reg.marketState || 'unknown';
    if (!byRegime[state]) byRegime[state] = { samples: 0, byModel: {} };
    byRegime[state].samples++;
    for (const key of modelKeys) {
      const sig = scored.find((s) => s.key === key);
      if (!sig || sig.error) continue;
      const pred = modelForecast(sig.model, win, 5);
      if (pred == null) continue;
      const actual = closes[i + 5] || closes[closes.length - 1];
      const errPct = Math.abs(pred - actual) / actual;
      const hit = errPct <= threshold;
      if (!byRegime[state].byModel[key]) byRegime[state].byModel[key] = { hits: 0, total: 0 };
      byRegime[state].byModel[key].total++;
      if (hit) byRegime[state].byModel[key].hits++;
    }
  }

  // 计算每个 regime 下各模型胜率 + 最佳模型
  const out = {};
  for (const [state, d] of Object.entries(byRegime)) {
    const modelWinRates = {};
    let bestKey = null;
    let bestRate = -1;
    for (const [key, c] of Object.entries(d.byModel)) {
      const rate = c.total ? Math.round((c.hits / c.total) * 10000) / 100 : 0;
      modelWinRates[key] = { winRate: rate, hits: c.hits, total: c.total };
      if (rate > bestRate) { bestRate = rate; bestKey = key; }
    }
    out[state] = { samples: d.samples, best: bestKey, byModel: modelWinRates };
  }
  return out;
}

// walk-forward：滚动 252 窗口，评估模型在 5 天预测上的命中（阈值可配，默认 1.5%）
function walkForward(bars, model, threshold = 0.015) {
  const closes = bars.map((b) => b.close);
  const wins = [];
  const errs = [];
  const start = Math.max(252, Math.floor(closes.length * 0.35));
  for (let i = start; i < closes.length; i += 10) {
    const win = bars.slice(Math.max(0, i - 252), i + 1);
    const pred = modelForecast(model, win, 5);
    if (pred == null) continue;
    const actual = closes[i + 5] || closes[closes.length - 1];
    const errPct = Math.abs(pred - actual) / actual;
    wins.push(errPct <= threshold);
    errs.push(errPct);
  }
  const hit = wins.filter(Boolean).length;
  return {
    winRate: wins.length ? Math.round((hit / wins.length) * 10000) / 100 : 0,
    avgAbsErr: errs.length ? Math.round((errs.reduce((a, b) => a + b, 0) / errs.length) * 10000) / 10000 : null,
    samples: wins.length,
  };
}

function modelForecast(model, win, h) {
  const c = win.map((b) => b.close);
  const last = c[c.length - 1];
  switch (model) {
    case 'T1-lite-rule':
      return inhouse.t1Signal(win).target;
    case 'T2-multifactor':
      return inhouse.t2Factors(win).target;
    case 'T3-adaptive':
      return inhouse.t3Adaptive(win, null).target;
    case 'T4-advanced':
      return inhouse.t4Advanced(win, null).target;
    default:
      return inhouse.baselineForecast(win, h);
  }
}

module.exports = { arena, walkForward, modelForecast };
