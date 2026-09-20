'use strict';

// FinAgent REST API 服务层：挂载 RBAC 鉴权，暴露行�?/ 分析 / 预测 / 命中 /
// 模型竞技�?/ Agent 编排 / 密钥管理 / 运维（健康、审计、备份、定时任务）等端点�?const path = require('path');
const express = require('express');

const { auth, requireScope, grantKey, currentIdentity, ACCOUNTS } = require('./src/auth/rbac');
const { runAgent, getSnapshot, listAll } = require('./src/agent');
const db = require('./src/store/db');
const versions = require('./config/versions');
const health = require('./src/ops/health');
const backup = require('./src/ops/backup');
const scheduler = require('./src/ops/scheduler');
const evolution = require('./src/engines/evolution');
const logger = require('./src/ops/logger');
const { rateLimit, auditLog } = require('./src/ops/middleware');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

// 全局鉴权：无 key 时本地开发自动降级为 admin（生产设 FINAGENT_LOCAL_OPEN=0�?app.use(auditLog());
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: parseInt(process.env.FINAGENT_RATE_MAX || '120', 10) }));
app.use(auth);
// �� /api ��̬��Դ��������

// ---------------------------------------------------------------------------
// 基础端点
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, identity: currentIdentity(req), time: new Date().toISOString() });
});

app.get('/api/meta', (req, res) => {
  res.json({
    name: 'FinAgent',
    versions: ['lite', 'full'],
    activeRole: currentIdentity(req).role,
    notes: {
      lite: '简版：数据量少、算法简单、有分析、无预测',
      full: '完整版：10 年大数据量、精准自研算法、预测开放、命中可检测、可自我升级',
    },
  });
});

app.get('/api/versions', (req, res) => {
  res.json({
    lite: { name: versions.lite.name, label: versions.lite.label, tickers: versions.lite.collect.tickers, predict: versions.lite.predict.enabled },
    full: { name: versions.full.name, label: versions.full.label, tickers: versions.full.collect.tickers, predict: versions.full.predict.enabled },
  });
});

// ---------------------------------------------------------------------------
// 行情 / 分析 / 预测（读�?// ---------------------------------------------------------------------------
app.get('/api/tickers', requireScope('read:data'), (req, res) => {
  res.json({ tickers: db.listTickers() });
});

app.get('/api/tickers/:ticker', requireScope('read:data'), (req, res) => {
  const version = req.query.version === 'full' ? 'full' : 'lite';
  const snap = getSnapshot(version, req.params.ticker);
  if (!snap) return res.status(404).json({ error: 'ticker not found, run /api/agent/run first' });
  res.json({ snapshot: snap });
});

app.get('/api/tickers/all', requireScope('read:analysis'), (req, res) => {
  const version = req.query.version === 'full' ? 'full' : 'lite';
  res.json({ records: listAll(version) });
});

app.get('/api/tickers/:ticker/bars', requireScope('read:data'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '250', 10), 5000);
  const data = db.loadRaw(req.params.ticker);
  const bars = data.bars.slice(-limit);
  res.json({ ticker: req.params.ticker, count: bars.length, bars });
});

// 模型竞技场（完整版）
app.get('/api/arena/:ticker', requireScope('read:analysis'), (req, res) => {
  const snap = getSnapshot('full', req.params.ticker);
  if (!snap || !snap.modelArena) return res.status(404).json({ error: 'no arena, run full agent first' });
  res.json({ arena: snap.modelArena, inHouse: snap.inHouse, reasoning: snap.reasoning });
});

// 预测记录列表
app.get('/api/predictions', requireScope('read:predictions'), (req, res) => {
  const preds = db.listPredictions();
  const filtered = req.query.ticker ? preds.filter((p) => p.ticker === req.query.ticker) : preds;
  res.json({ predictions: filtered });
});

// 回测报告
app.get('/api/backtest/:ticker', requireScope('read:predictions'), (req, res) => {
  const report = db.loadBacktestReport(req.params.ticker + '_bt');
  if (!report) return res.status(404).json({ error: 'backtest report not found' });
  res.json({ report });
});

// ---------------------------------------------------------------------------
// Agent 编排（写：触�?采集 + 分析 + 预测 + 命中 + 自我校准�?// ---------------------------------------------------------------------------
app.post('/api/agent/run', requireScope('write:collect'), async (req, res) => {
  const { version, tickers } = req.body || {};
  const versionKey = version === 'full' ? 'full' : 'lite';
  try {
    const result = await runAgent(versionKey, { tickers }, (msg) => logger.info(`[agent] ${msg}`));
    res.json({ result });
  } catch (e) {
    logger.error(`agent/run failed: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// 运维：健�?/ 审计 / 备份 / 清理 / 定时任务（admin�?// ---------------------------------------------------------------------------
app.get('/api/ops/health', requireScope('manage:ops'), (req, res) => {
  res.json(health.dataHealth());
});

app.get('/api/ops/audit', requireScope('manage:ops'), (req, res) => {
  res.json(health.audit({ log: false }));
});

app.post('/api/ops/backup', requireScope('manage:ops'), (req, res) => {
  res.json(backup.backup());
});

app.post('/api/ops/prune', requireScope('manage:ops'), (req, res) => {
  const keep = parseInt(req.body && req.body.keepDays || '30', 10);
  const removed = backup.pruneOld(keep);
  const trimmed = backup.trimRaw(2500);
  res.json({ removed: removed.length, trimmed, keepDays: keep });
});

app.get('/api/ops/jobs', requireScope('manage:ops'), (req, res) => {
  res.json({ jobs: scheduler.jobStatus(), started: scheduler.jobsStarted() });
});

// ---------------------------------------------------------------------------
// 密钥管理（仅 admin�?// ---------------------------------------------------------------------------
app.get('/api/evolution', requireScope('read:analysis'), (req, res) => {
  const n = Math.min(parseInt(req.query.limit || '50', 10), 200);
  res.json({ events: evolution.latest(n) });
});

app.get('/api/keys', requireScope('manage:keys'), (req, res) => {
  res.json({
    accounts: ACCOUNTS.map((a) => ({ user: a.user, role: a.role, apiKey: a.apiKey, scopes: a.scopes })),
  });
});

app.post('/api/keys/:role', requireScope('manage:keys'), (req, res) => {
  const granted = grantKey(req.params.role);
  res.json({ granted });
});

// ---------------------------------------------------------------------------
// 错误处理
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  logger.error(`unhandled: ${err.stack || err.message}`);
  res.status(500).json({ error: err.message });
});

// ---------------------------------------------------------------------------
// 启动：可选开启后台定时任务（FINAGENT_AUTOSTART_JOBS=1�?// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3001;
if (require.main === module) {
  if (process.env.FINAGENT_AUTOSTART_JOBS === '1') {
    const v = process.env.FINAGENT_JOB_VERSION === 'lite' ? 'lite' : 'full';
    scheduler.dataRefreshJob(v);
    scheduler.logPruneJob();
    scheduler.hitRateAuditJob();
    scheduler.markStarted();
    logger.info('autostart jobs enabled');
  }
  app.listen(PORT, () => {
    logger.info(`FinAgent API running at http://localhost:${PORT}`);
    console.log(`FinAgent console: http://localhost:${PORT}/`);
  });
}

module.exports = app;






