'use strict';

// 可选真实数据源：Alpha Vantage（需 ALPHAVANTAGE_API_KEY）。
// 未安装/未配置 key 时，collect() 返回 null，上层自动回退到模拟数据。
const { fakeSeries } = require('./base');

async function collect(ticker, cfg) {
  const key = process.env.ALPHAVANTAGE_API_KEY;
  if (!key) return null; // 无 key 时交给模拟源
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(
    ticker
  )}&outputsize=compact&apikey=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  const series = data['Time Series (Daily)'] || {};
  const bars = Object.entries(series)
    .map(([date, v]) => ({
      date,
      open: parseFloat(v['1. open']),
      high: parseFloat(v['2. high']),
      low: parseFloat(v['3. low']),
      close: parseFloat(v['4. close']),
      volume: parseInt(v['5. volume'], 10),
      source: 'alpha_vantage',
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!bars.length) throw new Error('alpha_vantage empty response');
  return bars.slice(0, cfg.maxBars || 400);
}

async function collectSimulated(ticker, cfg) {
  return fakeSeries({
    length: cfg.lookbackDays,
    seed: ticker,
    startPrice: 100,
    drift: 0.0004,
    vol: 0.02,
  }).map((b) => ({ ...b, source: 'simulated' }));
}

module.exports = { collect, collectSimulated };
