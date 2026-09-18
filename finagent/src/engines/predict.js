'use strict';

// 预测引擎（仅完整版启用）：线性回归 + 动量 组合，输出多周期目标价与置信度。
// 同时生成一条“预测记录”存入 data/predictions，供命中检测回测使用。

function predict(bars, cfg) {
  if (!cfg || !cfg.enabled) return null;
  const closes = bars.map((b) => b.close);
  if (closes.length < 60) return { error: 'insufficient-data' };
  const base = closes[closes.length - 1];
  const result = {
    ticker: bars[bars.length - 1].ticker,
    asOf: bars[bars.length - 1].date,
    base,
    horizons: [],
    model: cfg.model || 'linear+regression+momentum',
    id: `${bars[bars.length - 1].ticker}_${bars[bars.length - 1].date}`,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  const mom = momentum(closes, 20);
  (cfg.horizons || [5, 20, 60]).forEach((h) => {
    const lr = linearForecast(closes, h);
    const momF = mom * h;
    const target = (lr + base + momF) / 2;
    const conf = confidence(closes, h);
    result.horizons.push({
      days: h,
      target: Math.round(target * 100) / 100,
      expectedReturnPct: Math.round(((target - base) / base) * 10000) / 100,
      confidence: Math.round(conf * 100) / 100,
    });
  });

  // 生成预测记录（用于命中检测）
  const rec = {
    id: result.id,
    ticker: result.ticker,
    asOf: result.asOf,
    base,
    predictions: result.horizons.map((x) => ({ days: x.days, target: x.target })),
    resolved: [],
    status: 'pending',
    createdAt: result.createdAt,
  };
  result._record = rec;
  return result;
}

function momentum(closes, n) {
  if (closes.length < n + 1) return 0;
  return Math.log(closes[closes.length - 1] / closes[closes.length - 1 - n]) / n;
}

function linearForecast(closes, horizon) {
  const arr = closes.slice(-60);
  const n = arr.length;
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += arr[i];
    sxx += i * i;
    sxy += i * arr[i];
  }
  const denom = n * sxx - sx * sx || 1;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return slope * horizon + intercept;
}

function confidence(closes, h) {
  const rets = closes.slice(-30);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const sd = Math.sqrt(variance);
  // 波动越小、周期越短，置信度越高
  const c = 0.95 - sd * 10 - h * 0.001;
  return Math.max(0.35, Math.min(0.95, c));
}

module.exports = { predict };
