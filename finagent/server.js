'use strict';

// FinAgent REST API 服务层：挂载 RBAC + 会员等级鉴权，暴露行情 / 分析 / 预测 /
// 命中 / 模型竞技场 / 进化日志 / Agent 编排 / 密钥管理 / 运维等端点。
const path = require('path');
const express = require('express');

const { auth, requireScope, requireFeature, grantKey, currentIdentity, ACCOUNTS } = require('./src/auth/rbac');
const { runAgent, getSnapshot, listAll } = require('./src/agent');
const db = require('./src/store/db');
const versions = require('./config/versions');
const health = require('./src/ops/health');
const backup = require('./src/ops/backup');
const scheduler = require('./src/ops/scheduler');
const evolution = require('./src/engines/evolution');
const logger = require('./src/ops/logger');
const { rateLimit, auditLog } = require('./src/ops/middleware');
const { TIER, tierOf, applyTier, allowedVersions } = require('./src/entitlements/tiers');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

// 中间件顺序：审计 → 鉴权 → 限流。
// 限流依赖 auth 挂载到 req.ctx 的 tier，必须放在 auth 之后，
// 否则 perIdentity 读不到会员等级，所有请求都会 fallback 到 free 配额。
app.use(auditLog());
app.use(auth);
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.FINAGENT_RATE_MAX || '120', 10),
  perIdentity: (req) => {
    // 按会员等级配额：free 60 / pro 300 / enterprise 1200（每 60s）
    const tier = (req.ctx && req.ctx.tier) || tierOf((req.ctx && req.ctx.role) || 'viewer');
    return TIER[tier] ? TIER[tier].apiRate : 60;
  },
}));

// ---------------------------------------------------------------------------
// 基础端点
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, identity: currentIdentity(req), time: new Date().toISOString() });
});

// 会员等级自省：当前等级、开放功能、配额
app.get('/api/tier', (req, res) => {
  const id = currentIdentity(req);
  res.json({
    tier: id.tier,
    label: TIER[id.tier].label,
    role: id.role,
    features: {
      versions: allowedVersions(id.role),
      predict: TIER[id.tier].predict,
      hitBacktest: TIER[id.tier].hitBacktest,
      regimeAware: TIER[id.tier].regimeAware,
      modelArena: TIER[id.tier].modelArena,
      evolutionLimit: TIER[id.tier].evolutionLimit,
      workerRoster: TIER[id.tier].workerRoster,
      benchmarkGap: TIER[id.tier].benchmarkGap,
    },
    quotas: {
      apiRate: TIER[id.tier].apiRate,
      keyQuota: TIER[id.tier].keyQuota,
      lookbackDays: TIER[id.tier].lookbackDays,
    },
  });
});

app.get('/api/meta', (req, res) => {
  res.json({
    name: 'FinAgent',
    versions: ['lite', 'full'],
    activeRole: currentIdentity(req).role,
    tier: currentIdentity(req).tier,
    release: {
      version: '1.3.0',
      label: 'Digital Workers · Benchmark Gap',
      highlights: ['数字员工 7 岗精准分工', '市场基准对标（MRS 差距分析）', '会员等级 free/pro/enterprise', 'regime 感知 T4', 'walk-forward 自我升级'],
      releasedAt: new Date().toISOString(),
    },
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
// 行情 / 分析 / 预测（读，按会员等级开放）
// ---------------------------------------------------------------------------
app.get('/api/tickers', requireScope('read:data'), (req, res) => {
  res.json({ tickers: db.listTickers() });
});

// 单 ticker 快照：版本受会员等级限制，快照字段按等级收紧
app.get('/api/tickers/:ticker', requireScope('read:data'), (req, res) => {
  let version = req.query.version === 'full' ? 'full' : 'lite';
  const allowed = allowedVersions(req.ctx.role);
  if (version === 'full' && !allowed.includes('full')) {
    return res.status(403).json({ error: 'full version requires pro tier or above', upgradeTo: 'pro' });
  }
  const snap = getSnapshot(version, req.params.ticker);
  if (!snap) return res.status(404).json({ error: 'ticker not found, run /api/agent/run first' });
  res.json({ snapshot: applyTier(snap, req.ctx.role) });
});

// 全量快照：版本 + 字段按会员等级收紧
app.get('/api/tickers/all', requireScope('read:analysis'), (req, res) => {
  let version = req.query.version === 'full' ? 'full' : 'lite';
  const allowed = allowedVersions(req.ctx.role);
  if (version === 'full' && !allowed.includes('full')) {
    return res.status(403).json({ error: 'full version requires pro tier or above', upgradeTo: 'pro' });
  }
  const records = listAll(version).map((s) => applyTier(s, req.ctx.role));
  res.json({ records });
});

app.get('/api/tickers/:ticker/bars', requireScope('read:data'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '250', 10), 5000);
  const data = db.loadRaw(req.params.ticker);
  const bars = data.bars.slice(-limit);
  res.json({ ticker: req.params.ticker, count: bars.length, bars });
});

// 模型竞技场（pro+）
app.get('/api/arena/:ticker', requireScope('read:analysis'), requireFeature('modelArena'), (req, res) => {
  const snap = getSnapshot('full', req.params.ticker);
  if (!snap || !snap.modelArena) return res.status(404).json({ error: 'no arena, run full agent first' });
  const tier = applyTier(snap, req.ctx.role);
  res.json({ arena: tier.modelArena, inHouse: tier.inHouse, reasoning: tier.reasoning });
});

// 进化日志（按会员等级限制条数）
app.get('/api/evolution', requireScope('read:analysis'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), TIER[tierOf(req.ctx.role)].evolutionLimit === Infinity ? 200 : TIER[tierOf(req.ctx.role)].evolutionLimit);
  res.json({ events: evolution.latest(limit), tier: req.ctx.tier });
});

// 预测记录（pro+）
app.get('/api/predictions', requireScope('read:predictions'), requireFeature('predict'), (req, res) => {
  const preds = db.listPredictions();
  const filtered = req.query.ticker ? preds.filter((p) => p.ticker === req.query.ticker) : preds;
  res.json({ predictions: filtered });
});

// 回测报告（pro+）
app.get('/api/backtest/:ticker', requireScope('read:predictions'), requireFeature('hitBacktest'), (req, res) => {
  const report = db.loadBacktestReport(req.params.ticker + '_bt');
  if (!report) return res.status(404).json({ error: 'backtest report not found' });
  res.json({ report });
});

// ---------------------------------------------------------------------------
// Agent 编排（写：触发 采集 + 分析 + 预测 + 命中 + 自我校准；版本受会员等级限制）
// ---------------------------------------------------------------------------
app.post('/api/agent/run', requireScope('write:collect'), (req, res, next) => {
  const { version } = req.body || {};
  const versionKey = version === 'full' ? 'full' : 'lite';
  const allowed = allowedVersions(req.ctx.role);
  if (versionKey === 'full' && !allowed.includes('full')) {
    return res.status(403).json({ error: 'full collection requires pro tier or above', upgradeTo: 'pro' });
  }
  next();
}, async (req, res) => {
  const { version, tickers } = req.body || {};
  const versionKey = version === 'full' ? 'full' : 'lite';
  try {
    const result = await runAgent(versionKey, { tickers }, (msg) => logger.info(`[agent] ${msg}`));
    res.json({ result, tier: req.ctx.tier });
  } catch (e) {
    logger.error(`agent/run failed: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// 运维：健康 / 审计 / 备份 / 清理 / 定时任务（admin）
// ---------------------------------------------------------------------------
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
// 密钥管理（仅 admin；签发数量受会员等级 keyQuota 限制）
// ---------------------------------------------------------------------------
app.get('/api/keys', requireScope('manage:keys'), (req, res) => {
  res.json({
    accounts: ACCOUNTS.map((a) => ({ user: a.user, role: a.role, apiKey: a.apiKey, scopes: a.scopes, tier: tierOf(a.role) })),
  });
});

app.post('/api/keys/:role', requireScope('manage:keys'), (req, res) => {
  const granted = grantKey(req.params.role);
  res.json({ granted, tier: tierOf(granted.role) });
});

// ---------------------------------------------------------------------------
// 错误处理
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  logger.error(`unhandled: ${err.stack || err.message}`);
  res.status(500).json({ error: err.message });
});

// ---------------------------------------------------------------------------
// 启动：可选开启后台定时任务（FINAGENT_AUTOSTART_JOBS=1）
// ---------------------------------------------------------------------------
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
