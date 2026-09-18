'use strict';

// 命中检测 / 回测引擎：检测“预测”是否命中实际价格走势，输出命中率。
// 命中误差 <= threshold（默认 2%）计为命中；并生成 adaptive 反馈项，
// 供 T3/T4 自研模型在下一次推理时自我校准权重。

function resolvePrediction(pred, actualPrices, threshold = 0.02) {
  const base = pred.base;
  const resolved = pred.predictions.map((p) => {
    const targetDate = addDays(pred.asOf, p.days);
    const actual = findCloseOnOrAfter(actualPrices, targetDate);
    let hit = null,
      actualReturn = null,
      errPct = null;
    if (actual != null) {
      actualReturn = actual / base - 1;
      const predReturn = p.target / base - 1;
      errPct = Math.abs(actualReturn - predReturn);
      hit = errPct <= threshold;
    }
    return { days: p.days, target: p.target, targetDate, actual, actualReturn, hit, errPct };
  });
  const total = resolved.length;
  const resolvedCount = resolved.filter((r) => r.hit !== null).length;
  const hits = resolved.filter((r) => r.hit === true).length;
  const feedback = adaptiveFeedback(pred, resolved, threshold);
  return {
    ...pred,
    status: resolvedCount === total ? 'resolved' : 'partial',
    resolved,
    hitRate: resolvedCount ? Math.round((hits / resolvedCount) * 10000) / 100 : null,
    resolvedAt: new Date().toISOString(),
    feedback,
  };
}

// 为 T3/T4 提供在线校准信号：predErr = actualReturn - predReturn
function adaptiveFeedback(pred, resolved, threshold) {
  return resolved
    .filter((r) => r.hit !== null)
    .map((r) => {
      const base = pred.base;
      const predReturn = r.target / base - 1;
      const actualReturn = r.actual / base - 1;
      return {
        days: r.days,
        predErr: actualReturn - predReturn,
        absErr: r.errPct,
        hit: r.hit,
        hitThreshold: threshold,
        factorsAt: pred.factorsAt || null,
      };
    });
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function findCloseOnOrAfter(prices, date) {
  let best = null;
  for (const p of prices) {
    if (p.date >= date) {
      best = p.close;
      break;
    }
  }
  return best;
}

// 对某 ticker 的历史预测做批量回测（含命中 + adaptive 反馈汇总）
function backtest(ticker, bars, predictions, cfg) {
  const prices = bars.map((b) => ({ date: b.date, close: b.close }));
  const threshold = (cfg && cfg.threshold) || 0.02;
  const reports = predictions
    .filter((p) => p.ticker === ticker)
    .map((p) => resolvePrediction(p, prices, threshold));
  const total = reports.length;
  const resolvedReports = reports.filter((r) => r.status === 'resolved' || r.status === 'partial');
  let totalPreds = 0,
    totalHits = 0;
  const allFeedback = [];
  resolvedReports.forEach((r) => {
    r.resolved.forEach((x) => {
      if (x.hit !== null) {
        totalPreds++;
        if (x.hit) totalHits++;
      }
    });
    if (Array.isArray(r.feedback)) allFeedback.push(...r.feedback);
  });
  const avgAbsErr = allFeedback.length
    ? Math.round((allFeedback.reduce((a, b) => a + b.absErr, 0) / allFeedback.length) * 10000) / 10000
    : null;
  return {
    id: `${ticker}_bt`,
    ticker,
    model: (predictions[0] && predictions[0].model) || 'unknown',
    threshold,
    predictions: total,
    resolvedPredictions: resolvedReports.length,
    totalForecastPoints: totalPreds,
    hitPoints: totalHits,
    accuracyPct: totalPreds ? Math.round((totalHits / totalPreds) * 10000) / 100 : null,
    avgAbsErrPct: avgAbsErr == null ? null : avgAbsErr * 100,
    feedbackCount: allFeedback.length,
    adaptiveFeedback: allFeedback.slice(0, 60),
    details: reports,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { resolvePrediction, backtest, addDays, findCloseOnOrAfter, adaptiveFeedback };
