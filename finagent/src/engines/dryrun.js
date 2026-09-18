'use strict';

// 历史 dry-run 回测：在“已有历史数据”中模拟预测并校验命中，
// 用于首次部署时即可展示命中率、算法晋级、自适应反馈。
const inhouse = require('./inhouse');
const arena = require('./arena');

function historicalDryRun(bars, cfg = {}) {
  const h = (cfg.horizon && Number(cfg.horizon)) || 5;
  const threshold = (cfg.threshold && Number(cfg.threshold)) || 0.02;
  const start = Math.max(300, Math.floor(bars.length * 0.55));
  const preds = [];
  let hits = 0;
  let resolved = 0;

  for (let i = start; i < bars.length - h; i += 10) {
    const win = bars.slice(0, i + 1);
    const last = win[win.length - 1].close;
    const asOf = win[win.length - 1].date;
    const sig = inhouse.pickModel(win, null);
    const target = scaleToHorizon(sig.target, last, h);
    const actual = bars[i + h].close;
    const predRet = target / last - 1;
    const actualRet = actual / last - 1;
    const errPct = Math.abs(actualRet - predRet);
    const hit = errPct <= threshold;
    resolved++;
    if (hit) hits++;
    preds.push({
      asOf,
      days: h,
      base: last,
      target,
      actual,
      predRet,
      actualRet,
      errPct: Math.round(errPct * 10000) / 10000,
      hit,
      model: sig.model,
      tier: sig.tier,
      factorsAt: sig.factors || sig.weights || null,
    });
  }

  // 汇总 adaptive feedback，供下一次真实预测自我校准
  const adaptiveFeedback = preds.map((p) => ({
    days: p.days,
    predErr: p.actualRet - p.predRet,
    absErr: p.errPct,
    hit: p.hit,
    hitThreshold: threshold,
    factorsAt: p.factorsAt,
  }));

  // 模型竞技场历史 dry-run（用同样规则评估 T1..T4 的 winRate）
  const modelArena = arena.arena(bars, adaptiveFeedback);

  return {
    ticker: bars[bars.length - 1].ticker,
    mode: 'historical-dry-run',
    horizon: h,
    threshold,
    samples: preds.length,
    resolved,
    hits,
    accuracyPct: resolved ? Math.round((hits / resolved) * 10000) / 100 : null,
    avgAbsErrPct: preds.length ? Math.round((preds.reduce((a, b) => a + b.errPct, 0) / preds.length) * 100) / 100 : null,
    predictions: preds.slice(-12),
    adaptiveFeedback: adaptiveFeedback.slice(0, 60),
    modelArena,
    generatedAt: new Date().toISOString(),
  };
}

// 自研目标默认是 5 天，按比例外推到 h 天
function scaleToHorizon(target5d, base, h) {
  if (h === 5) return target5d;
  const r5 = target5d / base - 1;
  return base * Math.pow(1 + r5, h / 5);
}

module.exports = { historicalDryRun };
