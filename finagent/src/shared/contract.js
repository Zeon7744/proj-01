'use strict';

// 三端共享数据契约（Web 控制台 / CLI / 开放 API / 外部应用 共用）。
// 任何端读到的 ticker 快照、预测、命中、模型竞技场，都遵循这里定义的 shape，
// 保证 Web、CLI、API、第三方应用拿到一致的数据与语义。

// 统一快照 shape（getSnapshot 输出）
const SNAPSHOT_SHAPE = {
  ticker: 'string',
  version: "'lite'|'full'",
  source: 'string (主数据源)',
  multi: 'array of {source, bars}（多源聚合明细）',
  asOf: 'ISO date (YYYY-MM-DD)',
  metrics: {
    lastPrice: 'number',
    trend: "'bullish'|'bearish'|'neutral'",
    // 完整版额外：
    score: 'integer (composite)',
    signal: "'strong-buy'|'buy'|'hold'|'sell'|'strong-sell'",
    sma20: 'number', sma50: 'number', sma200: 'number',
    rsi: 'number', atr: 'number', vol: 'number (annualized %)',
  },
  inHouse: {
    model: "'T1-lite-rule'|'T2-multifactor'|'T3-adaptive'|'T4-advanced'",
    tier: "'T1'|'T2'|'T3'|'T4'",
    upgraded: 'boolean (walk-forward 验证后是否晋级)',
    target: 'number (5 天目标价)',
    confidence: 'number (0-1)',
    factors: 'object (趋势/动量/均值回归/波动率/regime)',
    regime: 'object|null {volRegime, volTrend, marketState, trendStreak, riskAdjust}',
  },
  reasoning: {
    direction: "'up'|'down'|'flat'",
    expectedMovePct: 'number',
    confidence: 'number',
    uncertainty: 'number (0-100)',
    hypotheses: 'array of string',
    thought: 'string (自然语言“思考”)',
    regime: 'object|null (市场状态，供假设与展示)',
  },
  modelArena: {
    best: { key: 'string', label: 'string', winRate: 'number (%)', avgAbsErr: 'number' },
    threshold: 'number (命中阈值，默认 0.015)',
    scored: 'array of {key,label,winRate,avgAbsErr,target,confidence}',
  },
  prediction: {
    horizons: 'array of {days, target, expectedReturnPct, confidence}',
    model: 'string', modelTier: 'string', upgraded: 'boolean',
    confidence: 'number',
  },
  backtest: {
    historical: { samples: 'number', hits: 'number', accuracyPct: 'number (%)', avgAbsErrPct: 'number', modelArena: 'object' },
    // 正式命中（未来价格到来后）：
    accuracyPct: 'number', hitPoints: 'number', totalForecastPoints: 'number',
    adaptiveFeedback: 'array of {days, predErr, absErr, hit}（回灌 T3/T4 自我校准）',
  },
  // 数字员工岗位报告（按会员等级分工：free 3 人 / pro 5 人 / enterprise 7 人）
  workerReport: {
    tier: 'string (free|pro|enterprise)',
    roster: 'array of worker keys (该等级在岗名单)',
    headcount: 'number',
    rows: 'array of {key, title, produced, status}', // 每个数字员工一行岗位报告
    benchmark: 'object|null (策略师产出的基准对标报告，仅 enterprise)',
  },
  // 基准对标（market-relative strength gap，仅 enterprise）
  benchmarkGap: {
    available: 'boolean',
    benchmark: 'string (基准名称)',
    summary: { verdict: "'outperforming'|'underperforming'|'on-par'", avgOutperformancePct: 'number', avgModelHitRate: 'number', winners: 'number', losers: 'number' },
    perTicker: 'array of {ticker, mrsRetPct, outperformancePct, modelHitRate, regime}',
    gapNote: 'string (自然语言差距结论)',
  },
};

// 校验一个快照是否满足契约（用于三端一致性检查 / CI）
function validateSnapshot(snap) {
  const errs = [];
  if (!snap || typeof snap !== 'object') return ['snapshot is not an object'];
  if (typeof snap.ticker !== 'string') errs.push('ticker missing');
  if (snap.version !== 'lite' && snap.version !== 'full') errs.push('version must be lite|full');
  if (!snap.metrics || typeof snap.metrics.lastPrice !== 'number') errs.push('metrics.lastPrice missing');
  if (snap.version === 'full') {
    if (!snap.inHouse || !snap.inHouse.model) errs.push('inHouse.model missing (full)');
    if (!snap.modelArena || !snap.modelArena.best) errs.push('modelArena.best missing (full)');
    if (!snap.reasoning || !Array.isArray(snap.reasoning.hypotheses)) errs.push('reasoning.hypotheses missing (full)');
    // regime 为可选增强字段：存在时必须含 marketState
    if (snap.inHouse && snap.inHouse.regime && !snap.inHouse.regime.marketState) {
      errs.push('inHouse.regime.marketState missing');
    }
    if (snap.reasoning && snap.reasoning.regime && !snap.reasoning.regime.marketState) {
      errs.push('reasoning.regime.marketState missing');
    }
  }
  return errs;
}

// 三端共享：从 store 直接读“契约快照”（不依赖 server）
const db = require('../store/db');
function sharedSnapshot(version, ticker) {
  const agent = require('../agent');
  return agent.getSnapshot(version, ticker);
}

function sharedAll(version) {
  const agent = require('../agent');
  return agent.listAll(version).map((s) => ({ snapshot: s, contractErrors: validateSnapshot(s) }));
}

module.exports = { SNAPSHOT_SHAPE, validateSnapshot, sharedSnapshot, sharedAll };
