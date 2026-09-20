'use strict';

// 轻量日志：输出到 console + 落盘 logs/finagent.log（按天滚动，保留 14 天）。
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}
function todayFile() {
  const d = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `finagent-${d}.log`);
}
function write(level, msg, meta) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(meta || {}) });
  const out = level === 'error' ? console.error : console.log;
  out(`[${level}] ${msg}`);
  if (process.env.FINAGENT_NO_FILE_LOG === '1') return;
  try {
    ensureDir();
    fs.appendFileSync(todayFile(), line + '\n');
  } catch (e) {
    // 日志失败不应中断主流程
  }
}
function prune(keepDays = 14) {
  try {
    ensureDir();
    const cutoff = Date.now() - keepDays * 86400000;
    fs.readdirSync(LOG_DIR).forEach((f) => {
      const p = path.join(LOG_DIR, f);
      if (!f.endsWith('.log')) return;
      try {
        if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
      } catch (e) {}
    });
  } catch (e) {}
}
module.exports = {
  info: (m, meta) => write('info', m, meta),
  warn: (m, meta) => write('warn', m, meta),
  error: (m, meta) => write('error', m, meta),
  debug: (m, meta) => (process.env.DEBUG ? write('debug', m, meta) : null),
  prune,
  LOG_DIR,
};
