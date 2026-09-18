'use strict';

// 预测入口（已并入自研 in-house 模型）。
// 保留旧 API 形态以向后兼容；内部委托给 src/engines/inhouse，
// 使 lite/full 共享同一套高精度自研算法，避免两套预测分叉。
const inhouse = require('./inhouse');

function predict(bars, cfg) {
  if (!cfg || !cfg.enabled) return null;
  if (!Array.isArray(bars) || bars.length < 60) return { error: 'insufficient-data' };
  const sig = inhouse.pickModel(bars, null);
  const last = bars[bars.length - 1].close;
  const result = {
    ticker: bars[bars.length - 1].ticker,
    asOf: bars[bars.length - 1].date,
    base: last,
    horizons: [],
    model: sig.model,
    modelTier: sig.tier,
    upgraded: sig.upgraded,
    confidence: sig.confidence,
    id: `${bars[bars.length - 1].ticker}_${bars[bars.length - 1].date}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  (cfg.horizons || [5, 20, 60]).forEach((h) => {
    const dailyRet = (sig.target - last) / last / 5;
    const target = last * Math.pow(1 + dailyRet, h / 5);
    result.horizons.push({
      days: h,
      target: Math.round(target * 100) / 100,
      expectedReturnPct: Math.round(((target - last) / last) * 10000) / 100,
      confidence: Math.round(clamp01(sig.confidence * Math.pow(0.97, h / 5)) * 100) / 100,
    });
  });
  result._record = {
    id: result.id,
    ticker: result.ticker,
    asOf: result.asOf,
    base: last,
    model: sig.model,
    predictions: result.horizons.map((x) => ({ days: x.days, target: x.target })),
    factorsAt: sig.factors || sig.weights || null,
    resolved: [],
    status: 'pending',
    createdAt: result.createdAt,
  };
  return result;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

module.exports = { predict };
