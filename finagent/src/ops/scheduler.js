'use strict';

// 定时任务：数据刷新（增量迭代）、日志清理、数据保留策略、命中率巡检。
// 用原生 setInterval 实现，无需额外依赖；可被外部 cron 替代。
const agent = require('../agent');
const logger = require('./logger');
const health = require('./health');

const jobs = [];
let _started = false;

function jobsStarted() {
  return _started;
}
function markStarted() {
  _started = true;
}

function schedule(name, fn, everyMs, opts = {}) {
  const job = {
    name,
    everyMs,
    lastRun: null,
    nextRun: null,
    timer: null,
    running: false,
    error: null,
    startedAt: null,
    runs: 0,
  };
  if (opts.runNow) {
    job.startedAt = new Date().toISOString();
    job.nextRun = Date.now();
    tick();
  }
  function tick() {
    if (job.running) return;
    job.running = true;
    fn().then(
      (res) => {
        job.lastRun = new Date().toISOString();
        job.runs++;
        if (res != null) job.lastResult = res;
      },
      (e) => {
        job.error = e.message;
        logger.error(`job ${name} failed: ${e.message}`);
      }
    ).finally(() => {
      job.running = false;
    });
  }
  job.timer = setInterval(tick, everyMs);
  job.nextRun = Date.now() + everyMs;
  jobs.push(job);
  logger.info(`job scheduled: ${name} every ${Math.round(everyMs / 1000)}s`);
  return job;
}

// 数据刷新：完整/简版增量采集 + 分析 + 预测 + 命中回测 + 自我升级
function dataRefreshJob(versionKey = 'full', tickers) {
  return schedule(
    `data-refresh-${versionKey}`,
    () => agent.runAgent(versionKey, { tickers }, (m) => logger.debug(m)),
    24 * 3600 * 1000 // 默认每天一次
  );
}

// 日志清理
function logPruneJob() {
  return schedule('log-prune', () => { logger.prune(14); return true; }, 6 * 3600 * 1000);
}

// 命中率巡检（仅告警 stale / 异常）
function hitRateAuditJob() {
  return schedule('hit-rate-audit', () => { const r = health.audit({ log: false }); return r; }, 1 * 3600 * 1000, { runNow: true });
}

function jobStatus() {
  return jobs.map((j) => ({
    name: j.name,
    everyMs: j.everyMs,
    lastRun: j.lastRun,
    nextRun: j.nextRun,
    running: j.running,
    runs: j.runs,
    error: j.error,
    lastResult: j.lastResult && j.lastResult.checkedAt ? { tickers: j.lastResult.tickers, stale: j.lastResult.staleTickers } : undefined,
  }));
}

function stopAll() {
  jobs.forEach((j) => j.timer && clearInterval(j.timer));
  jobs.length = 0;
  _started = false;
}

module.exports = { dataRefreshJob, logPruneJob, hitRateAuditJob, jobStatus, stopAll, schedule, jobsStarted, markStarted };
