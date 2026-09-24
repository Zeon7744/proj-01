'use strict';

// 数字员工 · 市场情报员（newswatcher）：
// 按 cfg.includeNews / includeMacro 开关消费“新闻 + 宏观”信号。
// 离线 / GitHub 友好：
//   - 若 cfg.newsFeed 提供事件流（[{ts, ticker?, sentiment, headline}]），做确定性聚合；
//   - 否则回退到“确定性合成新闻流”（按 ticker 种子生成情绪波动），保证无网可演示。
// 输出：newsSignals（情绪/事件密度）+ macroSignals（利率/通胀代理），喂给 T4 与推理。
// 纯函数，不写盘、不依赖网络。

const { simulateSeries, seededRandom } = require('../collectors');

// 新闻情绪：-1（极度负面）~ +1（极度正面）
function newsSentiment(bars, cfg, log) {
  const feed = Array.isArray(cfg.newsFeed) ? cfg.newsFeed : null;
  if (feed && feed.length) {
    // 真实事件流：近 60 天内事件按情绪加权（近因加权 0.9^age）
    const asOf = bars[bars.length - 1].date;
    let w = 0;
    let n = 0;
    let hot = 0;
    for (const ev of feed) {
      if (ev.ticker && bars[0].ticker && ev.ticker !== bars[0].ticker) continue;
      const s = clampSent(ev.sentiment);
      const age = ageDays(ev.ts, asOf);
      if (age == null || age > 60) continue;
      const wgt = Math.pow(0.9, age);
      w += s * wgt;
      n += wgt;
      if (Math.abs(s) > 0.6) hot++;
    }
    const sentiment = n ? w / n : 0;
    return {
      available: true,
      source: 'news-feed',
      events: feed.length,
      hotEvents: hot,
      sentiment: Math.round(sentiment * 1000) / 1000,
      density: Math.min(1, hot / Math.max(1, feed.length)),
    };
  }
  // 离线：确定性合成新闻流（按 ticker 种子，保证同输入同输出）
  const ticker = bars[0] && bars[0].ticker;
  const rand = seededRandom('news:' + ticker);
  const closes = bars.map((b) => b.close);
  // 近 20 日动量决定“市场在炒什么”：动量强 -> 正面新闻密度高
  const mom = closes.length > 21 ? (closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21] : 0;
  const sentiment = clampSent(mom * 2 + (rand() - 0.5) * 0.6);
  const hotEvents = Math.round(clamp01(Math.abs(mom) * 6 + rand() * 2) * 40);
  return {
    available: true,
    source: 'simulated-news',
    events: 120 + Math.floor(rand() * 80),
    hotEvents: hotEvents,
    sentiment: Math.round(sentiment * 1000) / 1000,
    density: clamp01(hotEvents / 100),
  };
}

// 宏观信号：利率 / 通胀 / 增长 的代理（离线确定性；可接真实宏观 API）
function macroSignals(bars, cfg, log) {
  if (!cfg.includeMacro) return { available: false };
  const ticker = bars[0] && bars[0].ticker;
  const rand = seededRandom('macro:' + (ticker || 'global'));
  // 用 250 日波动 + 趋势做“宏观状态”代理（高波+下跌 -> 收紧）
  const closes = bars.map((b) => b.close);
  const rets = [];
  for (let i = Math.max(1, closes.length - 250); i < closes.length; i++) rets.push(closes[i] / closes[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
  const tightening = vol > 0.025 && mean < 0;
  const stance = tightening ? 'hawkish' : vol < 0.012 ? 'dovish' : 'neutral';
  return {
    available: true,
    source: 'simulated-macro',
    stance,
    rateProxy: Math.round((1 + vol * 12) * 1000) / 1000,
    inflationProxy: Math.round(Math.max(0, -mean * 252) * 1000) / 1000,
    riskOff: tightening,
  };
}

// 新闻 + 宏观 融合成“市场情绪与资金面”因子（喂 T4 / reason）
function marketSignal(bars, cfg, log) {
  const news = newsSentiment(bars, cfg, log);
  const macro = macroSignals(bars, cfg, log);
  // 综合资金面情绪：新闻情绪 60% + 宏观姿态 40%
  const macroScore = macro.available ? (macro.stance === 'hawkish' ? -0.4 : macro.stance === 'dovish' ? 0.4 : 0) : 0;
  const composite = clamp01(0.5 + (news.sentiment * 0.5) * 0.6 + macroScore * 0.4);
  return {
    available: true,
    news,
    macro,
    composite,
    note: `新闻情绪 ${news.sentiment > 0 ? '+' : ''}${news.sentiment} · ${news.hotEvents} 热点事件 · 宏观 ${macro.available ? macro.stance : 'n/a'}`,
  };
}

function clampSent(x) {
  const n = Number(x);
  if (!isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function ageDays(ts, asOf) {
  if (!ts || !asOf) return null;
  const a = new Date(ts).getTime();
  const b = new Date(asOf).getTime();
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

module.exports = { newsSentiment, macroSignals, marketSignal };
