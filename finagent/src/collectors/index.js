'use strict';

// 数据采集源抽象层。
// 优先尝试真实数据源（yfinance / alpha_vantage），不可用时回退到确定性模拟数据，
// 保证仓库在无网络 / 无 API Key 的环境也能完整运行与演示（GitHub 友好）。

const base = require('./base');

// 确定性伪随机（按 ticker + 日期 种子），保证可复现
function seededRandom(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 15), 104729);
    h = Math.imul(h ^ (h >>> 13), 5949);
    h ^= h + Math.imul(h ^ (h >>> 16), 2247633);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };
}

// 模拟一个资产 10 年级别的日线行情（几何随机游走 + 趋势 + 波动）
function simulateSeries(ticker, opts) {
  const { lookbackDays = 365, fields = ['close'] } = opts;
  const rand = seededRandom(ticker + ':seed');
  const bars = [];
  const startPrice = 20 + Math.floor(rand() * 480);
  const drift = (rand() - 0.45) * 0.001; // 每日漂移
  const vola = 0.01 + rand() * 0.02;
  let price = startPrice;
  const today = new Date();
  const days = Math.min(lookbackDays, 2500);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // 跳过周末
    const shock = (rand() - 0.5) * vola * price;
    const ret = drift + shock / price;
    const open = price;
    price = Math.max(0.5, price * (1 + ret));
    const close = price;
    const high = Math.max(open, close) * (1 + rand() * 0.008);
    const low = Math.min(open, close) * (1 - rand() * 0.008);
    const volume = Math.round((1e6 + rand() * 9e6) * (1 + ret * 20));
    const rec = {
      ticker,
      date: d.toISOString().slice(0, 10),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume,
      adjclose: round2(close),
      source: 'simulated',
    };
    bars.push(rec);
  }
  return bars;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function collectPriceData(ticker, cfg, log) {
  const out = { ticker, source: 'simulated', bars: [] };
  try {
    // 若安装了真实数据源则优先使用
    const dyn = await tryLoad('yfinance');
    if (dyn) {
      out.source = 'yfinance';
      out.bars = await dyn(ticker, cfg);
    } else {
      out.bars = simulateSeries(ticker, cfg);
    }
  } catch (e) {
    if (log) log(`[${ticker}] real source failed, fallback to simulated: ${e.message}`);
    out.bars = simulateSeries(ticker, cfg);
  }
  return out;
}

async function tryLoad(name) {
  try {
    const mod = require('./' + name);
    return mod;
  } catch (e) {
    return null;
  }
}

module.exports = { collectPriceData, simulateSeries, base, round2 };
