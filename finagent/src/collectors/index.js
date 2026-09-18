'use strict';

// 数据采集源抽象层：多源聚合。
// 按 cfg.sources 顺序尝试每个真实源（yfinance / alpha_vantage），
// 取“bar 数最多”的源作为主源；全部失败则回退到确定性模拟数据，
// 保证仓库在无网络 / 无 API Key 的环境也能完整运行（GitHub 友好）。

const base = require('./base');
const path = require('path');

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

// 几何随机游走 + 趋势 + 波动 的确定性模拟日线
function simulateSeries(ticker, opts) {
  const { lookbackDays = 365 } = opts;
  const rand = seededRandom(ticker + ':seed');
  const bars = [];
  const startPrice = 20 + Math.floor(rand() * 480);
  const drift = (rand() - 0.45) * 0.001;
  const vola = 0.01 + rand() * 0.02;
  let price = startPrice;
  const today = new Date();
  const days = Math.min(lookbackDays, 2500);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const shock = (rand() - 0.5) * vola * price;
    const ret = drift + shock / price;
    const open = price;
    price = Math.max(0.5, price * (1 + ret));
    const close = price;
    const high = Math.max(open, close) * (1 + rand() * 0.008);
    const low = Math.min(open, close) * (1 - rand() * 0.008);
    const volume = Math.round((1e6 + rand() * 9e6) * (1 + ret * 20));
    bars.push({
      ticker,
      date: d.toISOString().slice(0, 10),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume,
      adjclose: round2(close),
      source: 'simulated',
    });
  }
  return bars;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function normalize(t) {
  const s = String(t || '').toLowerCase();
  if (s === 'yc') return 'yfinance';
  if (s === 'av') return 'alpha_vantage';
  return s;
}

async function loadSource(name) {
  try {
    const mod = require(path.join(__dirname, normalize(name) + '.js'));
    return mod;
  } catch (e) {
    return null;
  }
}

// 多源聚合：逐个尝试 cfg.sources，取 bar 数最多的；全失败则模拟
async function collectPriceData(ticker, cfg, log) {
  const out = { ticker, source: 'simulated', bars: [], multi: [] };
  const sources = Array.isArray(cfg.sources) && cfg.sources.length ? cfg.sources : ['simulated'];

  for (const s of sources) {
    const key = normalize(s);
    if (key === 'simulated') continue;
    const mod = await loadSource(key);
    if (!mod || typeof mod.collect !== 'function') continue;
    try {
      const bars = await mod.collect(ticker, cfg);
      if (Array.isArray(bars) && bars.length) {
        out.multi.push({ source: key, bars: bars.length });
        if (bars.length > out.bars.length) {
          out.bars = bars;
          out.source = key;
        }
      }
    } catch (e) {
      if (log) log(`[${ticker}] ${key} failed: ${e.message}`);
    }
  }

  if (!out.bars.length) {
    out.bars = simulateSeries(ticker, cfg);
    out.source = 'simulated';
    if (log && sources.some((s) => s !== 'simulated')) {
      log(`[${ticker}] no real source available, fallback to simulated`);
    }
  }
  return out;
}

module.exports = { collectPriceData, simulateSeries, base, round2, normalize };
