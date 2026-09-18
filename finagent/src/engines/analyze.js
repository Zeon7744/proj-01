'use strict';

// 分析引擎：简版用少量简单指标，完整版用更精准的一组指标。
// 纯函数，输入 close 序列 -> 输出指标对象。

function sma(arr, n) {
  if (arr.length < n) return null;
  const s = arr.slice(-n).reduce((a, b) => a + b, 0);
  return s / n;
}
function ema(arr, n) {
  if (arr.length < n) return null;
  const k = 2 / (n + 1);
  let e = arr.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
  return e;
}
function rsi(arr, n = 14) {
  if (arr.length < n + 1) return null;
  let gains = 0,
    losses = 0;
  const start = arr.length - n - 1;
  for (let i = start + 1; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}
function macd(arr) {
  const fast = ema(arr, 12);
  const slow = ema(arr, 26);
  if (fast == null || slow == null) return null;
  return { macd: fast - slow, signal: null, hist: fast - slow };
}
function bollinger(arr, n = 20) {
  if (arr.length < n) return null;
  const win = arr.slice(-n);
  const mid = win.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(win.reduce((a, b) => a + (b - mid) ** 2, 0) / n);
  return { upper: mid + 2 * sd, lower: mid - 2 * sd, mid };
}
function atr(highs, lows, closes, n = 14) {
  if (closes.length < n + 1) return null;
  let trSum = 0,
    count = 0;
  for (let i = closes.length - n - 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trSum += tr;
    count++;
  }
  return count ? trSum / count : null;
}
function volatility(arr, n = 20) {
  if (arr.length < n + 1) return null;
  const rets = [];
  for (let i = arr.length - n; i < arr.length; i++) rets.push(Math.log(arr[i] / arr[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100; // 年化百分比
}

// 简单版指标集（算法简单、数据少）
function simpleMetrics(bars, cfg) {
  const closes = bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  return {
    version: 'lite',
    asOf: bars[bars.length - 1].date,
    lastPrice: last,
    sma20: sma(closes, 20),
    sma60: sma(closes, 60),
    rsi: rsi(closes, 14),
    atr: atr(
      bars.map((b) => b.high),
      bars.map((b) => b.low),
      closes,
      14
    ),
    trend: last > sma(closes, 20) ? 'bullish' : last < sma(closes, 60) ? 'bearish' : 'neutral',
  };
}

// 完整版指标集（更精准）
function fullMetrics(bars, cfg) {
  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const last = closes[closes.length - 1];
  const m = {
    version: 'full',
    asOf: bars[bars.length - 1].date,
    lastPrice: last,
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    ema12: ema(closes, 12),
    ema26: ema(closes, 26),
    macd: macd(closes),
    rsi: rsi(closes, 14),
    boll: bollinger(closes, 20),
    atr: atr(highs, lows, closes, 14),
    vol: volatility(closes, 20),
  };
  // 综合评分：多因子融合
  m.score = compositeScore(m, last);
  m.trend = goldCross(m) ? 'bullish' : deathCross(m) ? 'bearish' : 'neutral';
  m.signal = interpret(m);
  return m;
}

function goldCross(m) {
  return m.sma50 && m.sma200 && m.sma50 > m.sma200;
}
function deathCross(m) {
  return m.sma50 && m.sma200 && m.sma50 < m.sma200;
}

function compositeScore(m, last) {
  let s = 0;
  if (goldCross(m)) s += 2;
  if (m.rsi != null && m.rsi < 30) s += 1;
  if (m.rsi != null && m.rsi > 70) s -= 1;
  if (m.macd && m.macd.macd > 0) s += 1;
  if (m.boll && last > m.boll.upper) s -= 1;
  if (m.boll && last < m.boll.lower) s += 1;
  return s;
}

function interpret(m) {
  if (m.score >= 3) return 'strong-buy';
  if (m.score >= 1) return 'buy';
  if (m.score <= -3) return 'strong-sell';
  if (m.score <= -1) return 'sell';
  return 'hold';
}

module.exports = {
  simpleMetrics,
  fullMetrics,
  sma,
  ema,
  rsi,
  macd,
  bollinger,
  atr,
  volatility,
  compositeScore,
  interpret,
};
