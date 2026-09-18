'use strict';

// 模型竞技场：对同一组 bars 运行 T1..T4 + baseline，用 walk-forward 命中率评估，选出最佳模型。
// 结果会持久化到 data/processed/{ticker}.modelArena，供命中回测与自我升级使用。
const inhouse = require('./inhouse');

function arena(bars, feedback) {
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

  // walk-forward hit rate 评估（命中率越高越优）
  const scored = results.map((sig) => {
    if (sig.error) return { ...sig, winRate: 0, avgAbsErr: Infinity };
    const wf = walkForward(bars, sig.model);
    return { ...sig, winRate: wf.winRate, avgAbsErr: wf.avgAbsErr, samples: wf.samples };
  });

  // 排序：先 winRate，再 avgAbsErr
  scored.sort((a, b) => (b.winRate - a.winRate) || (a.avgAbsErr - b.avgAbsErr));
  const best = scored[0];
  return {
    bars: bars.length,
    asOf: bars[bars.length - 1].date,
    scored,
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

// walk-forward：滚动 252 窗口，评估模型在 5 天预测上的命中（阈值 2%）
function walkForward(bars, model) {
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
    wins.push(errPct <= 0.02);
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
    case 'T1-lite-rule': {
      const s = inhouse.t1Signal(win);
      return s.target;
    }
    case 'T2-multifactor': {
      const s = inhouse.t2Factors(win);
      return s.target;
    }
    case 'T3-adaptive': {
      const s = inhouse.t3Adaptive(win, null);
      return s.target;
    }
    case 'T4-advanced': {
      const s = inhouse.t4Advanced(win, null);
      return s.target;
    }
    default:
      return inhouse.baselineForecast(win, h);
  }
}

module.exports = { arena, walkForward, modelForecast };
