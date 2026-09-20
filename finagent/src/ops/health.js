'use strict';

// 健康检查 / 数据巡检：暴露 API 端点 + CLI 报告，供运维监控。
const fs = require('fs');
const path = require('path');
const db = require('../store/db');
const logger = require('./logger');

function dataHealth() {
  const tickers = db.listTickers();
  const rawSize = dirSize(path.join(db.DATA_ROOT, 'raw'));
  const processed = tickers.map((t) => {
    const rec = db.loadProcessed(t);
    const raw = db.loadRaw(t);
    return {
      ticker: t,
      rawBars: raw ? raw.count || (raw.bars ? raw.bars.length : 0) : 0,
      processedAt: rec ? rec.updatedAt : null,
      model: rec && rec.inHouse ? rec.inHouse.model : null,
      modelTier: rec && rec.inHouse ? rec.inHouse.tier : null,
      hitRate: rec && rec.backtest && rec.backtest.historical ? rec.backtest.historical.accuracyPct : null,
      prediction: rec ? rec.prediction : null,
    };
  });
  const stale = processed.filter((p) => {
    if (!p.processedAt) return true;
    const age = Date.now() - new Date(p.processedAt).getTime();
    return age > 24 * 3600 * 1000; // >24h 视为 stale
  });
  return {
    ok: true,
    tickers: tickers.length,
    staleTickers: stale.map((s) => s.ticker),
    rawBytes: rawSize,
    processed: processed,
    checkedAt: new Date().toISOString(),
  };
}

function dirSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else total += st.size;
    }
  };
  walk(dir);
  return total;
}

// 巡检：输出运维摘要，可选告警
function audit(opts = {}) {
  const h = dataHealth();
  const lines = [];
  lines.push(`FinAgent audit @ ${h.checkedAt}`);
  lines.push(`tickers=${h.tickers} rawBytes=${(h.rawBytes / 1048576).toFixed(1)}MB stale=${h.staleTickers.length}`);
  h.staleTickers.forEach((t) => lines.push(`  STALE: ${t}`));
  const rep = { ...h, lines };
  if (opts.log !== false) {
    h.staleTickers.length ? logger.warn(`audit: ${h.staleTickers.length} stale tickers`, h.staleTickers) : logger.info('audit: healthy', { tickers: h.tickers });
  }
  return rep;
}

module.exports = { dataHealth, audit, dirSize };
