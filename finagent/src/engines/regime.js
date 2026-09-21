'use strict';

// Regime 感知增强（v3）：在 T4 基础之上引入“波动率状态持续性”与“趋势持续天数”，
// 让模型对市场状态（高/中/低波 + 趋势长度）更敏感，输出更强的风险调整目标。
// 纯函数，输入 bars -> 输出 regime 特征对象，供 T4 / 推理 / 竞技场消费。

function regimeFeatures(bars) {
  const closes = bars.map((b) => b.close);
  if (closes.length < 60) return { available: false };
  const volNow = annVol(closes, 20);
  const volLong = annVol(closes, 60);
  // 波动率变化：>1.2 = 扩张, <0.8 = 收缩
  const volDrift = volLong ? volNow / volLong : 1;
  const volRegime = volNow > 35 ? 'high' : volNow > 18 ? 'mid' : 'low';
  const volTrend = volDrift > 1.2 ? 'expanding' : volDrift < 0.8 ? 'contracting' : 'stable';

  // 趋势持续：price 连续高于 SMA20 的交易日数（最多取最近 60）
  const s20 = sma(closes, 20);
  let upStreak = 0;
  let downStreak = 0;
  for (let i = closes.length - 1; i >= Math.max(0, closes.length - 60); i--) {
    if (s20 == null) break;
    if (closes[i] > s20) { upStreak++; if (upStreak > downStreak) downStreak = 0; }
    else { downStreak++; if (downStreak > upStreak) upStreak = 0; }
  }
  const trendStreak = upStreak > downStreak ? upStreak : -downStreak;

  // 市场状态：趋势 + 波动综合
  const marketState =
    volRegime === 'high' ? (trendStreak > 0 ? 'high-vol-trend-up' : 'high-vol-trend-down')
    : volRegime === 'mid' ? (trendStreak > 0 ? 'mid-vol-bull' : 'mid-vol-bear')
    : trendStreak > 0 ? 'low-vol-uptrend' : 'low-vol-downtrend';

  // 风险调整系数：高波 + 扩张 -> 降权; 低波 + 收缩 + 趋势 -> 增权
  let riskAdj = 1.0;
  if (volRegime === 'high') riskAdj = 0.6;
  else if (volRegime === 'mid') riskAdj = 0.85;
  if (volTrend === 'expanding') riskAdj *= 0.85;
  if (volTrend === 'contracting' && volRegime !== 'high') riskAdj *= 1.1;
  if (Math.abs(trendStreak) >= 20) riskAdj *= 1.05; // 长趋势加分

  return {
    available: true,
    volNow: Math.round(volNow * 100) / 100,
    volLong: Math.round(volLong * 100) / 100,
    volDrift: Math.round(volDrift * 1000) / 1000,
    volRegime,
    volTrend,
    upStreak,
    downStreak,
    trendStreak,
    marketState,
    riskAdjust: Math.round(clamp(riskAdj, 0.5, 1.4) * 1000) / 1000,
  };
}

function sma(arr, n) {
  if (arr.length < n) return null;
  return arr.slice(-n).reduce((a, b) => a + b, 0) / n;
}
function annVol(arr, n) {
  if (arr.length < n + 1) return 0;
  const rets = [];
  for (let i = arr.length - n; i < arr.length; i++) rets.push(Math.log(arr[i] / arr[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}
function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

module.exports = { regimeFeatures };
