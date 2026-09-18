'use strict';

// 数据仓库：本地 JSON 文件存储 + 增量更新。
// 每个 ticker 一个目录：data/raw/{ticker}.json（行情），
// data/processed/{ticker}.json（指标 + 分析 + 预测），
// data/predictions/*.json（预测记录，用于命中回测）。
const fs = require('fs');
const path = require('path');

const DATA_ROOT = process.env.FINAGENT_DATA_DIR || path.join(__dirname, '..', '..', 'data');
const RAW = path.join(DATA_ROOT, 'raw');
const PROCESSED = path.join(DATA_ROOT, 'processed');
const PRED = path.join(DATA_ROOT, 'predictions');
const BACKTEST = path.join(DATA_ROOT, 'backtest');

function ensureDirs() {
  [RAW, PROCESSED, PRED, BACKTEST, DATA_ROOT].forEach((d) => fs.mkdirSync(d, { recursive: true }));
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback !== undefined ? fallback : null;
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function rawFile(ticker) {
  return path.join(RAW, safeName(ticker) + '.json');
}
function procFile(ticker) {
  return path.join(PROCESSED, safeName(ticker) + '.json');
}
function predFile(id) {
  return path.join(PRED, safeName(id) + '.json');
}

function safeName(s) {
  return String(s).replace(/[\\/:*?"<>|]/g, '_');
}

// 保存原始行情（去重、按日期升序、保留最新 N 条）
function saveRaw(ticker, bars, maxBars) {
  ensureDirs();
  const file = rawFile(ticker);
  const existing = readJson(file, { ticker, bars: [] });
  const seen = new Map(existing.bars.map((b) => [b.date, b]));
  bars.forEach((b) => {
    if (b.date) seen.set(b.date, b);
  });
  const merged = Array.from(seen.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  const trimmed = maxBars ? merged.slice(-maxBars) : merged;
  writeJson(file, {
    ticker,
    updatedAt: new Date().toISOString(),
    count: trimmed.length,
    bars: trimmed,
  });
  return { count: trimmed.length, file };
}

function loadRaw(ticker) {
  return readJson(rawFile(ticker), { ticker, bars: [] });
}

function saveProcessed(ticker, record) {
  ensureDirs();
  writeJson(procFile(ticker), record);
  return procFile(ticker);
}

function loadProcessed(ticker) {
  return readJson(procFile(ticker), null);
}

function listTickers() {
  ensureDirs();
  return fs
    .readdirSync(RAW)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

function savePrediction(pred) {
  ensureDirs();
  writeJson(predFile(pred.id), pred);
  return pred;
}

function loadPrediction(id) {
  return readJson(predFile(id), null);
}

function listPredictions() {
  ensureDirs();
  return fs
    .readdirSync(PRED)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const p = readJson(path.join(PRED, f), null);
      return p ? p : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function saveBacktestReport(report) {
  ensureDirs();
  const id = report.id || 'latest';
  writeJson(path.join(BACKTEST, safeName(id) + '.json'), report);
  return report;
}

function loadBacktestReport(id) {
  return readJson(path.join(BACKTEST, safeName(id || 'latest') + '.json'), null);
}

module.exports = {
  ensureDirs,
  saveRaw,
  loadRaw,
  saveProcessed,
  loadProcessed,
  listTickers,
  savePrediction,
  loadPrediction,
  listPredictions,
  saveBacktestReport,
  loadBacktestReport,
  DATA_ROOT,
};
