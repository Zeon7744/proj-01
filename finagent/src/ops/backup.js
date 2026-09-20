'use strict';

// 数据保留 / 备份 / 清理：
// - backup: 把 data/{raw,processed,predictions,backtest} 打成带时间戳的 JSON 快照到 data/backups/
// - prune: 删除超过 keepDays 的旧预测 / 旧回测 / 旧 raw（按文件 mtime）
const fs = require('fs');
const path = require('path');
const db = require('../store/db');
const logger = require('./logger');

const SUBDIRS = ['raw', 'processed', 'predictions', 'backtest'];

function backup() {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const dir = path.join(db.DATA_ROOT, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `backup-${ts}.json`);
  const payload = {
    createdAt: new Date().toISOString(),
    tickers: db.listTickers(),
    raw: {},
    processed: {},
    predictions: db.listPredictions(),
    backtest: {},
  };
  db.listTickers().forEach((t) => {
    payload.raw[t] = db.loadRaw(t);
    payload.processed[t] = db.loadProcessed(t);
    const bt = db.loadBacktestReport(`${t}_bt`);
    if (bt) payload.backtest[t] = bt;
  });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  logger.info(`backup written: ${out}`);
  return { file: out, tickers: payload.tickers.length };
}

function pruneOld(keepDays = 30) {
  const cutoff = Date.now() - keepDays * 86400000;
  const removed = [];
  SUBDIRS.forEach((sub) => {
    const dir = path.join(db.DATA_ROOT, sub);
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach((f) => {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      if (st.isFile() && st.mtimeMs < cutoff) {
        fs.unlinkSync(p);
        removed.push(p);
      }
    });
  });
  if (removed.length) logger.info(`pruned ${removed.length} old files (keep ${keepDays}d)`);
  return removed;
}

// 限制 raw bars 数量，防止数据无限膨胀
function trimRaw(maxBars = 2500) {
  let touched = 0;
  db.listTickers().forEach((t) => {
    const rec = db.loadRaw(t);
    if (rec.bars && rec.bars.length > maxBars) {
      rec.bars = rec.bars.slice(-maxBars);
      db.saveRaw(t, rec.bars, maxBars);
      touched++;
    }
  });
  return touched;
}

module.exports = { backup, pruneOld, trimRaw };
