'use strict';

// Agent 编排器：采集 -> 分析 -> (完整版) 预测 -> 命中回测 -> 自我校准。
// 版本：lite / full，由 config/versions.js 驱动。
// 高级版额外运行：in-house 模型 + arena + walk-forward + 自我校准。
const versions = require('../config/versions');
const collector = require('./collectors');
const analyze = require('./engines/analyze');
const inhouse = require('./engines/inhouse');
const arena = require('./engines/arena');
const backtestEngine = require('./engines/backtest');
const dryrun = require('./engines/dryrun');
const db = require('./store/db');

async function runAgent(versionKey, opts = {}, log = () => {}) {
  const cfg = versions[versionKey] || versions.lite;
  const logFn = log;
  const tickers = opts.tickers || cfg.collect.tickers;
  const out = { version: cfg.name, tickers: [], startedAt: new Date().toISOString() };

  for (const ticker of tickers) {
    logFn(`[collect] ${ticker} (${cfg.name})`);
    const collected = await collector.collectPriceData(ticker, cfg.collect, logFn);
    db.saveRaw(ticker, collected.bars, cfg.collect.maxBars);

    const bars = db.loadRaw(ticker).bars;
    const metrics = cfg.name === 'full' ? analyze.fullMetrics(bars, cfg) : analyze.simpleMetrics(bars, cfg);

    let prediction = null;
    let backtest = null;
    let modelArena = null;
    let inHouse = null;
    let reasoning = null;
    if (cfg.predict.enabled) {
      // 1) 收集 adaptive 反馈：读上一次回测结果中的 adaptiveFeedback
      const lastBack = db.loadBacktestReport(`${ticker}_bt`);
      const lastFeedback = lastBack && Array.isArray(lastBack.adaptiveFeedback) && lastBack.adaptiveFeedback.length ? lastBack.adaptiveFeedback : null;
      const histFeedback = lastBack && lastBack.historical && Array.isArray(lastBack.historical.adaptiveFeedback) ? lastBack.historical.adaptiveFeedback : null;
      const feedback = lastFeedback || histFeedback || null;

      // 2) 自研模型选择（按数据量晋级 + walk-forward 验证升级）
      inHouse = inhouse.pickModel(bars, feedback);
      const thesis = inhouse.reason(inHouse, bars, metrics);

      // 3) 模型竞技场（T1..T4 + baseline 的 walk-forward 命中评估）
      modelArena = arena.arena(bars, feedback);

      // 4) 生成多周期预测（以自研 T 系列模型为准）
      prediction = buildPrediction(ticker, bars, inHouse, thesis, modelArena, cfg.predict);

      // 5) 保存预测记录 + factorsAt（用于下次自适应校准）
      db.savePrediction(Object.assign({}, prediction._record, {
        factorsAt: inHouse.factors || inHouse.weights || null,
        model: inHouse.model,
      }));

      // 6) 历史 dry-run（立即展示命中率）+ 正式命中回测
      if (cfg.predict.backtest && cfg.predict.backtest.historicalDryRun) {
        backtest = dryrun.historicalDryRun(bars, {
          horizon: 5,
          threshold: (cfg.predict.backtest.threshold) || 0.02,
        });
      }
      const preds = db.listPredictions().filter((p) => p.ticker === ticker);
      if (preds.length) {
        const live = backtestEngine.backtest(ticker, bars, preds, cfg.predict.backtest);
        backtest = backtest ? Object.assign({}, live, { historical: backtest }) : live;
      }
      if (backtest) db.saveBacktestReport(backtest);

      // 7) 自我思考：假设 + 不确定度
      reasoning = thesis;

      delete prediction._record;
    }

    const record = {
      ticker,
      version: cfg.name,
      source: collected.source,
      multi: collected.multi,
      asOf: metrics.asOf,
      metrics,
      inHouse,
      reasoning,
      modelArena,
      prediction,
      backtest,
      updatedAt: new Date().toISOString(),
    };
    db.saveProcessed(ticker, record);
    out.tickers.push({
      ticker,
      source: collected.source,
      multi: collected.multi,
      bars: bars.length,
      metrics,
      inHouse,
      reasoning,
      modelArena,
      prediction,
      backtest,
    });
  }

  out.finishedAt = new Date().toISOString();
  return out;
}

function buildPrediction(ticker, bars, inHouse, thesis, modelArena, cfg) {
  const last = bars[bars.length - 1].close;
  const asOf = bars[bars.length - 1].date;
  const horizons = (cfg.horizons || [5, 20, 60]).map((h) => {
    // 用自研模型按周期外推（短期目标价 = 当前价 * (1 + 预期收益)）
    const dailyRet = (inHouse.target - last) / last / 5; // 自研目标默认 5 天
    const target = last * Math.pow(1 + dailyRet, h / 5);
    const conf = clamp01(inHouse.confidence * Math.pow(0.97, h / 5));
    return {
      days: h,
      target: Math.round(target * 100) / 100,
      expectedReturnPct: Math.round(((target - last) / last) * 10000) / 100,
      confidence: Math.round(conf * 100) / 100,
    };
  });

  const rec = {
    id: `${ticker}_${asOf}`,
    ticker,
    asOf,
    base: last,
    model: inHouse.model,
    modelTier: inHouse.tier,
    upgraded: inHouse.upgraded,
    predictions: horizons.map((x) => ({ days: x.days, target: x.target })),
    factorsAt: inHouse.factors || inHouse.weights || null,
    resolved: [],
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  return {
    ticker,
    asOf,
    base: last,
    horizons,
    model: inHouse.model,
    modelTier: inHouse.tier,
    upgraded: inHouse.upgraded,
    confidence: inHouse.confidence,
    arenaBest: modelArena.best,
    reasoning: thesis,
    _record: rec,
  };
}

function getSnapshot(versionKey, ticker) {
  const cfg = versions[versionKey] || versions.lite;
  const rec = db.loadProcessed(ticker);
  if (!rec) return null;
  const slim = {
    ticker: rec.ticker,
    version: rec.version,
    source: rec.source,
    multi: rec.multi,
    asOf: rec.asOf,
    metrics: rec.metrics,
    inHouse: rec.inHouse,
    reasoning: rec.reasoning,
    modelArena: rec.modelArena,
    updatedAt: rec.updatedAt,
  };
  if (cfg.predict.enabled && rec.prediction) {
    slim.prediction = rec.prediction;
    slim.backtest = rec.backtest;
  }
  return slim;
}

function listAll(versionKey) {
  const cfg = versions[versionKey] || versions.lite;
  return db.listTickers().map((t) => getSnapshot(versionKey, t)).filter(Boolean);
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

module.exports = { runAgent, getSnapshot, listAll };
