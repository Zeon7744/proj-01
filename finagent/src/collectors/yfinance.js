'use strict';

// 可选真实数据源：yfinance（Node 端通过 @node-yfinance 或官方 REST 端点拉取）。
// 未安装依赖时返回 null，上层自动回退到模拟数据，保证可运行。
const { fakeSeries } = require('./base');

async function collect(ticker, cfg) {
  // yfinance 官方无稳定公共 REST；这里优先尝试本地包 @node-yfinance，
  // 否则返回 null 以触发模拟回退。
  try {
    const yf = require('@node-yfinance');
    const data = await yf.default ? yf.default.historical(ticker, { period: '10y' }) : null;
    if (data && data.length) {
      return data.map((row) => ({
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        source: 'yfinance',
      }));
    }
    return null;
  } catch (e) {
    return null; // 包不存在或网络失败 -> 模拟回退
  }
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
