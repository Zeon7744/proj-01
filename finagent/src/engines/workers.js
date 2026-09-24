'use strict';

// 数字员工系统（Worker Division of Labor）：
// 把 agent 流水线拆成职责清晰的"数字员工"角色，每个员工单一职责、可审计、可替换。
// 不同会员等级开放不同员工数量与职责（free=3 人 / pro=5 人 / enterprise=7 人）：
//   collector    采集员：多源行情拉取、清洗、对齐
//   analyst      分析师：指标计算、因子生成
//   modeler      建模师：自研 T1..T4 模型选择 + regime 感知
//   forecaster   预测员：多周期目标价 + 置信度
//   backtester   回测员：命中检测、walk-forward、历史 dry-run
//   auditor      审计员：进化日志、自我校准事件归档（pro+）
//   strategist   策略师：regime 分组竞技场 + 对标差距分析（enterprise）
//
// 输出统一"岗位报告"（workerReport），随快照返回三端，便于展示与审计。
// 该模块是纯函数，不写盘，保证可测试、可离线运行。

const ROSTERS = {
  free: ['collector', 'analyst', 'forecaster'],
  pro: ['collector', 'analyst', 'modeler', 'forecaster', 'backtester'],
  enterprise: ['collector', 'analyst', 'modeler', 'forecaster', 'backtester', 'auditor', 'strategist'],
};

// 每个数字员工的职责描述 + 输入输出契约
const ROLES = {
  collector: {
    title: '采集员',
    duty: '多源行情拉取（yfinance / alpha_vantage / 模拟回退），对齐时间轴，写入 raw store',
    input: ['ticker', 'version'],
    output: ['bars', 'source', 'multi'],
  },
  analyst: {
    title: '分析师',
    duty: '计算技术指标（SMA/RSI/ATR/Boll）与多因子（trend/mom/mr/vol），产出分析底稿',
    input: ['bars'],
    output: ['metrics', 'factors'],
  },
  modeler: {
    title: '建模师',
    duty: '按数据量晋级选择自研 T1..T4，结合 regime 感知输出模型信号与不确定性',
    input: ['bars', 'feedback', 'regime'],
    output: ['inHouse', 'regime'],
  },
  forecaster: {
    title: '预测员',
    duty: '多周期（5/20/60d）目标价 + 置信度，产出预测记录并落盘',
    input: ['inHouse', 'metrics'],
    output: ['prediction'],
  },
  backtester: {
    title: '回测员',
    duty: '命中检测、walk-forward 验证、历史 dry-run，生成自适应反馈',
    input: ['prediction', 'bars'],
    output: ['backtest', 'adaptiveFeedback'],
  },
  auditor: {
    title: '审计员',
    duty: '归档进化事件（晋级/校准/竞技场胜出），维护可追溯的自我升级日志',
    input: ['tickerResult'],
    output: ['evolutionEvents'],
  },
  strategist: {
    title: '策略师',
    duty: 'regime 分组竞技场 + 对标基准差距分析，输出市场对比报告（enterprise 专属）',
    input: ['modelArena', 'benchmark'],
    output: ['byRegime', 'benchmarkGap'],
  },
};

// 按会员等级返回"在岗"员工名单（ROLES 全量定义中筛选）
function rosterFor(tier) {
  const list = ROSTERS[tier] || ROSTERS.free;
  return list.map((key) => ({ key, ...ROLES[key], active: true }));
}

// 生成一次 agent 运行后的"岗位报告"：每个在岗员工一行，标注产出与状态
function workerReport(tier, tickerResult, extra = {}) {
  const active = rosterFor(tier);
  const ih = tickerResult.inHouse;
  const bt = tickerResult.backtest;
  const ar = tickerResult.modelArena;
  const rows = active.map((w) => {
    let produced = '-';
    let status = 'idle';
    switch (w.key) {
      case 'collector':
        produced = `${(tickerResult.multi || []).map((m) => m.source + ':' + m.bars).join(' ') || tickerResult.source} · ${(tickerResult.bars || 0)} bars`;
        status = tickerResult.bars ? 'ok' : 'no-data';
        break;
      case 'analyst':
        produced = tickerResult.metrics ? `trend=${tickerResult.metrics.trend} rsi=${(tickerResult.metrics.rsi || 0).toFixed ? tickerResult.metrics.rsi.toFixed(1) : tickerResult.metrics.rsi}` : '-';
        status = tickerResult.metrics ? 'ok' : 'idle';
        break;
      case 'modeler':
        produced = ih ? `${ih.model} (tier ${ih.tier}${ih.upgraded ? ' ↑' : ''})` : '-';
        status = ih ? 'ok' : 'skipped';
        break;
      case 'forecaster':
        produced = tickerResult.prediction && tickerResult.prediction.horizons
          ? tickerResult.prediction.horizons.map((h) => `${h.days}d→${h.target}(${h.expectedReturnPct > 0 ? '+' : ''}${h.expectedReturnPct}%)`).join(' ')
          : '-';
        status = tickerResult.prediction ? 'ok' : 'skipped';
        break;
      case 'backtester':
        produced = bt && bt.historical
          ? `hit ${bt.historical.hits}/${bt.historical.samples}=${bt.historical.accuracyPct}%`
          : bt && bt.hitRate != null
            ? `live hitRate ${bt.hitRate}%`
            : '-';
        status = bt ? 'ok' : 'skipped';
        break;
      case 'auditor':
        produced = extra.evolutionCount != null ? `${extra.evolutionCount} events archived` : 'pending';
        status = extra.evolutionCount != null ? 'ok' : 'idle';
        break;
      case 'strategist':
        produced = ar && ar.byRegime ? `${Object.keys(ar.byRegime).length} regimes scored` : '-';
        status = ar && ar.byRegime ? 'ok' : 'skipped';
        break;
    }
    return { key: w.key, title: w.title, produced, status };
  });
  return {
    tier,
    roster: rows.map((r) => r.key),
    headcount: rows.length,
    rows,
    benchmark: extra.benchmark || null,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { ROLES, ROSTERS, rosterFor, workerReport };
