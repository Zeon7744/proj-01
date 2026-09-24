'use strict';

// 市场基准对标（Benchmark Gap Analysis）：
// 用“市场相对强弱”作为代理基准（market-relative strength, MRS）：
//   MRS = 等权组合内该标的相对全组合的超额收益（5 日 / 20 日 / 60 日）
// 将自研模型（T 系列）的 walk-forward 命中率与 MRS 基线对比，
// 输出“差距报告”：领先 / 落后 / 持平 + 绝对数值，供 strategist（数字员工）消费。
//
// 设计取舍：
//   - 不依赖外部指数数据（GitHub 离线友好），用同组合内相对强弱做基准，
//     逻辑上与“跑赢市场”等价（相对收益为正即跑赢组合）。
//   - 输出 byTicker 与 byRegime 两级，与 arena.byRegime 对齐，便于 regime 分组对比。
//   - 仅 enterprise 会员在 applyTier 中保留此字段（其余等级隐藏，与 regime 同级）。

const { regimeFeatures } = require('./regime');

// MRS：5/20/60 日等权组合相对超额收益（百分比）
function marketRelativeStrength(tickerBars, opts = {}) {
  const { horizonDays = 20 } = opts;
  if (!tickerBars || !tickerBars.length) return null;
  const closes = tickerBars.map((b) => b.close);
  const n = closes.length;
  const last = closes[n - 1];
  const look = Math.min(horizonDays, n - 1);
  const base = closes[n - 1 - look];
  const ret = (last - base) / base;
  return {
    ticker: tickerBars[0] ? tickerBars[0].ticker : null,
    horizonDays,
    retPct: Math.round(ret * 10000) / 100,
    asOf: tickerBars[n - 1].date,
  };
}

// 等权组合基准：所有标的同窗口相对收益的均值（代表“市场”）
function portfolioBaseline(tickerBarsList, opts = {}) {
  const rs = tickerBarsList
    .map((b) => marketRelativeStrength(b, opts))
    .filter(Boolean);
  if (!rs.length) return null;
  const avgRet = rs.reduce((a, x) => a + x.retPct, 0) / rs.length;
  return {
    tickers: rs.length,
    avgRetPct: Math.round(avgRet * 100) / 100,
    best: rs.reduce((a, b) => (b.retPct > a.retPct ? b : a), rs[0]),
    worst: rs.reduce((a, b) => (b.retPct < a.retPct ? b : a), rs[0]),
  };
}

// 自研模型 walk-forward 命中率（与 arena 同口径，阈值可配）
function modelWalkForwardHitRate(bars, model, threshold = 0.015) {
  const closes = bars.map((b) => b.close);
  const start = Math.max(252, Math.floor(closes.length * 0.35));
  let wins = 0;
  let samples = 0;
  for (let i = start; i < closes.length; i += 10) {
    const win = bars.slice(Math.max(0, i - 252), i + 1);
    let pred;
    try {
      pred = modelForecastSafe(model, win, 5);
    } catch (e) {
      continue;
    }
    if (pred == null) continue;
    const actual = closes[i + 5] || closes[closes.length - 1];
    const errPct = Math.abs(pred - actual) / actual;
    samples++;
    if (errPct <= threshold) wins++;
  }
  return samples ? Math.round((wins / samples) * 10000) / 100 : 0;
}

function modelForecastSafe(model, win, h) {
  switch (model) {
    case 'T1-lite-rule':
      return t1Local(win).target;
    case 'T2-multifactor':
      return t2Local(win).target;
    case 'T3-adaptive':
      return t2Local(win).target; // 无 feedback 时退化为 T2 口径
    case 'T4-advanced':
      return t2Local(win).target;
    default:
      return baselineMomentum(win, h);
  }
}

function baselineMomentum(win, h) {
  const c = win.map((b) => b.close);
  const last = c[c.length - 1];
  const look = Math.min(20, c.length - 1);
  const mom = Math.log(last / c[c.length - 1 - look]) / look;
  return last * (1 + mom * h);
}

function t1Local(win) {
  const c = win.map((b) => b.close);
  const last = c[c.length - 1];
  const s20 = sma(c, 20);
  const s60 = sma(c, 60);
  let score = 0;
  if (s20 != null && last > s20) score += 1;
  if (s20 != null && s60 != null && s20 > s60) score += 1;
  return { target: last * (1 + score * 0.01), model: 'T1-lite-rule' };
}

function t2Local(win) {
  const c = win.map((b) => b.close);
  const last = c[c.length - 1];
  const s20 = sma(c, 20);
  const s60 = sma(c, 60);
  const trend = s20 != null && s60 != null ? (s20 - s60) / last : 0;
  const look = Math.min(20, c.length - 1);
  const mom = look ? Math.log(last / c[c.length - 1 - look]) / look : 0;
  const mr = s20 ? (s20 - last) / last : 0;
  const combined = 0.4 * trend + 0.4 * mom + 0.2 * mr;
  return { target: last * (1 + combined * 5), model: 'T2-multifactor' };
}

function sma(arr, n) {
  if (arr.length < n) return null;
  return arr.slice(-n).reduce((a, b) => a + b, 0) / n;
}

// 差距报告：自研 T 模型 vs MRS 基准
function benchmarkGap(tickerBarsList, opts = {}) {
  const modelKey = opts.modelKey || 'T4-advanced';
  const threshold = opts.threshold || 0.015;
  const horizonDays = opts.horizonDays || 20;
  const baseline = portfolioBaseline(tickerBarsList, { horizonDays });
  if (!baseline) return { available: false };

  const perTicker = tickerBarsList.map((bars) => {
    const mrs = marketRelativeStrength(bars, { horizonDays });
    const hit = modelWalkForwardHitRate(bars, modelKey, threshold);
    const regime = regimeFeatures(bars);
    // 相对基准：该标的 MRS 相对组合均值的超额（跑赢/跑输组合）
    const outperformancePct = mrs ? mrs.retPct - baseline.avgRetPct : 0;
    return {
      ticker: mrs ? mrs.ticker : (bars[0] && bars[0].ticker) || '?',
      mrsRetPct: mrs ? mrs.retPct : null,
      outperformancePct: Math.round(outperformancePct * 100) / 100,
      modelHitRate: hit,
      regime: regime.available ? regime.marketState : null,
    };
  });

  // 聚合：跑赢/跑输数量、平均超额、平均模型命中率
  const winners = perTicker.filter((x) => x.outperformancePct > 0.5);
  const losers = perTicker.filter((x) => x.outperformancePct < -0.5);
  const avgOut = perTicker.length
    ? Math.round((perTicker.reduce((a, x) => a + x.outperformancePct, 0) / perTicker.length) * 100) / 100
    : 0;
  const avgHit = perTicker.length
    ? Math.round((perTicker.reduce((a, x) => a + x.modelHitRate, 0) / perTicker.length) * 100) / 100
    : 0;
  const verdict = avgOut > 0.5 ? 'outperforming' : avgOut < -0.5 ? 'underperforming' : 'on-par';

  return {
    available: true,
    benchmark: 'equal-weight portfolio MRS',
    modelKey,
    horizonDays,
    threshold,
    portfolio: { avgRetPct: baseline.avgRetPct, best: baseline.best, worst: baseline.worst },
    perTicker,
    summary: {
      verdict,
      avgOutperformancePct: avgOut,
      avgModelHitRate: avgHit,
      winners: winners.length,
      losers: losers.length,
      neutral: perTicker.length - winners.length - losers.length,
    },
    gapNote:
      verdict === 'outperforming'
        ? `自研 ${modelKey} 平均超额 +${avgOut}%（vs 等权组合 MRS），${winners.length} 个标的跑赢组合基准`
        : verdict === 'underperforming'
          ? `自研 ${modelKey} 平均超额 ${avgOut}%（vs 等权组合 MRS），${losers.length} 个标的跑输组合基准，建议收缩仓位或收紧阈值`
          : `自研 ${modelKey} 与等权组合 MRS 基本持平（平均超额 ${avgOut}%），命中率 ${avgHit}%`,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  marketRelativeStrength,
  portfolioBaseline,
  modelWalkForwardHitRate,
  benchmarkGap,
};
