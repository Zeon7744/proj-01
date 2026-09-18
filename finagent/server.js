'use strict';

// FinAgent REST API 服务层：挂载 RBAC 鉴权，暴露行情 / 分析 / 预测 / 命中 /
// 模型竞技场 / Agent 编排 / 密钥管理等端点。
const path = require('path');
const express = require('express');

const { auth, requireScope, grantKey, currentIdentity, ACCOUNTS } = require('./src/auth/rbac');
const { runAgent, getSnapshot, listAll } = require('./src/agent');
const db = require('./src/store/db');
const versions = require('./config/versions');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '2mb' }));

// 全局鉴权：无 key 时本地开发自动降级为 admin（生产设 FINAGENT_LOCAL_OPEN=0）
app.use(auth);

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
// 行情 / 分析 / 预测（读）
// ---------------------------------------------------------------------------
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
// Agent 编排（写：触发 采集 + 分析 + 预测 + 命中 + 自我校准）
// ---------------------------------------------------------------------------
app.post('/api/agent/run', requireScope('write:collect'), async (req, res) => {
  const { version, tickers } = req.body || {};
  const versionKey = version === 'full' ? 'full' : 'lite';
  try {
    const result = await runAgent(versionKey, { tickers }, (msg) => console.log(`[agent] ${msg}`));
    res.json({ result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// 密钥管理（仅 admin）
// ---------------------------------------------------------------------------
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
  console.error(err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`FinAgent API running at http://localhost:${PORT}`);
    console.log('Console: http://localhost:' + PORT + '/');
  });
}

module.exports = app;
