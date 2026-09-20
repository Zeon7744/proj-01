'use strict';

// 自我升级日志：记录模型晋级 / 权重校准 / 竞技场胜出等“进化事件”，
// 让 agent 的自我思考与自我升级可审计、可追溯（三端共享同一份日志）。
const db = require('../store/db');
const path = require('path');
const fs = require('fs');

const EVOLUTION_FILE = path.join(db.DATA_ROOT, 'evolution.json');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(EVOLUTION_FILE, 'utf8')).events || [];
  } catch (e) {
    return [];
  }
}

function record(event) {
  const events = readAll();
  const full = {
    ...event,
    id: event.id || `ev_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
    ts: event.ts || new Date().toISOString(),
  };
  events.unshift(full);
  // 保留最近 200 条进化事件
  const trimmed = events.slice(0, 200);
  fs.mkdirSync(path.dirname(EVOLUTION_FILE), { recursive: true });
  fs.writeFileSync(EVOLUTION_FILE, JSON.stringify({ events: trimmed }, null, 2));
  return full;
}

// 从一次 agent 运行的 ticker 结果生成进化事件（晋级 / 自适应 / 竞技场胜出）
function fromRun(tickerResult) {
  const events = [];
  const ih = tickerResult.inHouse;
  if (ih && ih.upgraded) {
    events.push({
      kind: 'promotion',
      ticker: tickerResult.ticker,
      detail: `${ih.tier} -> ${ih.model} (walk-forward verified)`,
      tier: ih.tier,
      to: ih.model,
    });
  }
  if (tickerResult.modelArena && tickerResult.modelArena.best) {
    const b = tickerResult.modelArena.best;
    events.push({
      kind: 'arena-win',
      ticker: tickerResult.ticker,
      detail: `${b.key} winRate=${b.winRate}% threshold=${(tickerResult.modelArena.threshold || 0.015) * 100}%`,
      model: b.key,
      winRate: b.winRate,
    });
  }
  if (tickerResult.backtest && tickerResult.backtest.historical) {
    const h = tickerResult.backtest.historical;
    events.push({
      kind: 'calibration',
      ticker: tickerResult.ticker,
      detail: `dry-run hit ${h.hits}/${h.samples}=${h.accuracyPct}% adaptiveSamples=${(h.adaptiveFeedback || []).length}`,
      accuracyPct: h.accuracyPct,
      adaptiveSamples: (h.adaptiveFeedback || []).length,
    });
  }
  return events;
}

function latest(n = 50) {
  return readAll().slice(0, n);
}

module.exports = { record, fromRun, latest, readAll, EVOLUTION_FILE };
