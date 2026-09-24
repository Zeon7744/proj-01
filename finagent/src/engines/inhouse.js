'use strict';

const regimeModule = require('./regime');
const market = require('./market');

// 自研分析算法（in-house），分四个阶段，随“分析数据量”自动晋级：
//   T1 lite   : 规则 + 简单指标（数据少 -> 简单）
//   T2 robust  : 多因子加权（数据中等）
//   T3 adaptive: 自适应权重（滚动误差反馈，按命中率自适应学习率 + regime 因子）
//   T4 advanced: 自适应 + 动量分解 + regime 感知（波动率状态持续性 + 趋势持续天数 + 风险调整）
// 模型“晋级”不是看绝对精度，而是看 walk-forward 回测中相对基线的提升（避免过拟合）。
// 本模块同时输出“思维”（reasoning / hypothesis / 不确定度 / regime），体现 agent 的自我思考能力。

// 基线：朴素动量预测（“不动脑”的对照组）
function baselineForecast(bars, h) {
  const closes = bars.map((b) => b.close);
  const base = closes[closes.length - 1];
  const look = Math.min(20, closes.length - 1);
  const mom = Math.log(base / closes[closes.length - 1 - look]) / look;
  return base * (1 + mom * h);
}

// T1 简单规则：趋势 + 均值回归打分
function t1Signal(bars) {
  const closes = bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const s20 = sma(closes, 20);
  const s60 = sma(closes, 60);
  const r = rsi(closes, 14);
  let score = 0;
  if (last > s20) score += 1;
  if (s20 > s60) score += 1;
  if (r < 30) score += 1;
  if (r > 70) score -= 1;
  const base = last;
  const target = base * (1 + score * 0.01);
  return { model: 'T1-lite-rule', target, confidence: clamp(0.5 + Math.abs(score) * 0.1), score, reason: `T1 rule score=${score} rsi=${r == null ? 'na' : r.toFixed(1)}` };
}

// T2 多因子：趋势 / 动量 / 均值回归 / 波动 加权
function t2Factors(bars) {
  const closes = bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const s20 = sma(closes, 20);
  const s60 = sma(closes, 60);
  const trend = s20 != null && s60 != null ? (s20 - s60) / last : 0;
  const look = Math.min(20, closes.length - 1);
  const mom = Math.log(last / closes[closes.length - 1 - look]) / look;
  const mr = s20 ? (s20 - last) / last : 0;
  const vol = annVol(closes, 20) / 100;
  const w = { trend: 0.4, mom: 0.4, mr: 0.2 };
  const combined = w.trend * trend + w.mom * mom + w.mr * mr;
  const damp = Math.max(0.3, 1 - vol * 3);
  const ret5 = combined * damp * 5;
  return {
    model: 'T2-multifactor',
    target: last * (1 + ret5),
    confidence: clamp(0.55 + combined * 20, 0.4, 0.9),
    factors: { trend, mom, mr, vol, damp },
    reason: `T2 factors trend=${trend.toFixed(3)} mom=${mom.toFixed(3)} mr=${mr.toFixed(3)} vol=${vol.toFixed(2)}`,
  };
}

// T3 自适应（v2）：按命中率的自适应学习率 + regime 因子
function t3Adaptive(bars, feedback) {
  const f = t2Factors(bars);
  const w = { trend: f.factors.trend, mom: f.factors.mom, mr: f.factors.mr };
  const fb = Array.isArray(feedback) && feedback.length ? feedback : null;
  if (fb) {
    const n = Math.min(24, fb.length);
    for (const k of ['trend', 'mom', 'mr']) {
      let corr = 0;
      for (let i = 0; i < n; i++) {
        const e = fb[i].predErr || 0;
        const fv = (fb[i].factorsAt && fb[i].factorsAt[k]) || 0;
        corr += -e * fv;
      }
      const hitRate = fb.filter((x) => x.hit).length / fb.length;
      const lr = 0.2 + hitRate * 0.4;
      const adj = (corr / n) * lr;
      w[k] = clamp(w[k] + adj, 0.05, 0.8);
    }
    const sum = w.trend + w.mom + w.mr || 1;
    w.trend /= sum;
    w.mom /= sum;
    w.mr /= sum;
  }
  const last = bars.map((b) => b.close);
  const cLast = last[last.length - 1];
  const combined = w.trend * f.factors.trend + w.mom * f.factors.mom + w.mr * f.factors.mr;
  const ret5 = combined * f.factors.damp * 5;
  const t3regime = regimeModule.regimeFeatures(bars);
  return {
    model: 'T3-adaptive',
    target: cLast * (1 + ret5),
    confidence: clamp(0.6 + Math.abs(combined) * 15, 0.45, 0.92),
    weights: { ...w },
    factors: { ...f.factors, state: volState(f.factors.vol), regime: t3regime.available ? t3regime : null },
    regime: t3regime.available ? t3regime : null,
    reason: `T3 adaptive weights ${JSON.stringify({ ...w })} (feedback n=${fb ? fb.length : 0})`,
  };
}

// T4 进阶 v3：动量分解 + regime 感知（波动率状态持续性 + 趋势持续天数 + 风险调整）
function t4Advanced(bars, feedback) {
  const closes = bars.map((b) => b.close);
  const last = closes[closes.length - 1];
  const momS = shortMom(closes, 5);
  const momM = shortMom(closes, 30);
  const vol = annVol(closes, 20) / 100;
  const state = volState(vol);
  const regime = regimeModule.regimeFeatures(bars);
  const riskAdj = regime.available ? regime.riskAdjust : state === 'high' ? 0.6 : state === 'mid' ? 0.8 : 1.0;
  // 市场情绪 + 宏观 资金面（数字员工 market，随数据量/配置开放）
  const mkt = market.marketSignal(bars, {});
  const sentimentAdj = mkt.available ? 0.9 + mkt.composite * 0.2 : 1.0; // 0.9~1.1
  const a = t3Adaptive(bars, feedback);
  const combined = a.weights.trend * momM + a.weights.mom * momS * 0.5 + a.weights.mr * 0;
  const ret5 = combined * riskAdj * 5;
  const ret5Final = ret5 * sentimentAdj;
  return {
    model: 'T4-advanced',
    target: last * (1 + ret5),
    confidence: clamp(0.65 + (1 - vol) * 0.2, 0.5, 0.95),
    volState: state,
    momShort: momS,
    momMedium: momM,
    riskAdjust: riskAdj,
    regime: regime.available ? regime : null,
    weights: a.weights,
    factors: { ...a.factors, state, regime: regime.available ? regime : null },
    reason: `T4 advanced vol=${state} momS=${momS.toFixed(3)} momM=${momM.toFixed(3)} riskAdj=${riskAdj} regime=${regime.available ? regime.marketState : 'na'}`,
  };
}

// ---------------- 模型选择 + 自我升级 ----------------
function pickModel(bars, feedback) {
  const n = bars.length;
  let tier;
  if (n < 300) tier = 'T1';
  else if (n < 800) tier = 'T2';
  else if (n < 1600) tier = 'T3';
  else tier = 'T4';

  const run = {
    T1: () => t1Signal(bars),
    T2: () => t2Factors(bars),
    T3: () => t3Adaptive(bars, feedback),
    T4: () => t4Advanced(bars, feedback),
  }[tier];

  const sig = run();
  const candidateTier = n >= 1600 ? 'T4' : n >= 800 ? 'T3' : n >= 300 ? 'T2' : 'T1';
  let upgraded = false;
  let best = sig;
  if (candidateTier === 'T4' && tier !== 'T4') {
    const cand = t4Advanced(bars, feedback);
    if (walkForwardWins(bars, cand, sig)) {
      best = cand;
      upgraded = true;
    }
  }
  return {
    ...best,
    tier,
    candidateTier,
    upgraded,
    upgradedNote: upgraded ? `walk-forward verified, promoted ${tier} -> ${best.model}` : null,
  };
}

// walk-forward：更严格样本量（start=300, 0.55 比例）防过拟合
function walkForwardWins(bars, cand, base) {
  const closes = bars.map((b) => b.close);
  const start = Math.max(300, Math.floor(closes.length * 0.55));
  let candErr = 0,
    baseErr = 0,
    cnt = 0;
  for (let i = start; i < closes.length; i += 5) {
    const win = bars.slice(Math.max(0, i - 252), i + 1);
    const pred = winForecast(cand.model, win);
    const actual = closes[i];
    candErr += Math.abs(pred - actual) / actual;
    baseErr += Math.abs(baselineForecast(win, 1) - actual) / actual;
    cnt++;
  }
  if (!cnt) return false;
  return candErr / cnt < baseErr / cnt;
}

function winForecast(model, win) {
  switch (model) {
    case 'T2-multifactor':
      return t2Factors(win).target;
    case 'T3-adaptive':
      return t3Adaptive(win, null).target;
    case 'T4-advanced':
      return t4Advanced(win, null).target;
    default:
      return baselineForecast(win, 1);
  }
}

// ---------------- 自我思考 / 假设生成 ----------------
function reason(sig, bars, metrics) {
  const last = bars[bars.length - 1].close;
  const target = sig.target;
  const dir = target > last ? 'up' : target < last ? 'down' : 'flat';
  const conf = sig.confidence;
  const regime = (sig.factors && sig.factors.regime) || sig.regime || null;
  const market = sig.market || null;
  const thesis = {
    model: sig.model,
    direction: dir,
    expectedMovePct: ((target - last) / last) * 100,
    confidence: conf,
    volState: sig.factors ? sig.factors.state : sig.volState || null,
    regime: regime || null,
    market: market || null,
  };
  const hypotheses = [];
  if (sig.factors && sig.factors.trend > 0 && sig.factors.mom > 0) {
    hypotheses.push('Trend and momentum are aligned upward; a pullback to SMA20 would be a stronger entry.');
  }
  if (sig.factors && sig.factors.mr > 0) {
    hypotheses.push('Price is below SMA20 — mean-reversion component favors a rebound if support holds.');
  }
  if (regime) {
    if (regime.volTrend === 'expanding' && regime.volRegime === 'high') {
      hypotheses.push('Volatility regime is expanding in high-vol state: shrink position size, tighten stops.');
    }
    if (regime.volTrend === 'contracting' && regime.volRegime !== 'high') {
      hypotheses.push('Volatility is contracting — mean-reversion signals gain reliability; wider targets acceptable.');
    }
    if (regime.trendStreak >= 20) {
      hypotheses.push(`Trend persistence ${regime.trendStreak}d (${regime.marketState}) — ride the regime but watch for vol expansion.`);
    }
    if (regime.trendStreak <= -20) {
      hypotheses.push(`Downtrend persistence ${Math.abs(regime.trendStreak)}d (${regime.marketState}) — avoid long entries until regime shifts.`);
    }
  }
  if (market) {
    if (market.news && market.news.sentiment > 0.4) {
      hypotheses.push('Positive news sentiment (hot events) - short-term bid likely to hold, but watch for fade after the move.');
    }
    if (market.news && market.news.sentiment < -0.4) {
      hypotheses.push('Negative news sentiment - downside pressure may extend; avoid catching the falling knife.');
    }
    if (market.macro && market.macro.stance === 'hawkish') {
      hypotheses.push('Macro stance hawkish (rate/inflation proxy) - discount later cash flows, prefer relative strength over beta.');
    }
    if (market.macro && market.macro.stance === 'dovish') {
      hypotheses.push('Macro stance dovish - liquidity tailwind favors extended rallies; wider stops acceptable.');
    }
  }
  if (conf < 0.55) {
    hypotheses.push('Low model confidence: prefer to stay neutral / reduce exposure rather than force a trade.');
  }
  if (!hypotheses.length) {
    hypotheses.push('No dominant edge detected; maintain current stance and watch for regime change.');
  }
  thesis.uncertainty = Math.round((1 - conf) * 10000) / 100;
  thesis.hypotheses = hypotheses;
  const regimeTag = regime ? ` Regime: ${regime.marketState} (vol ${regime.volRegime}/${regime.volTrend}, streak ${regime.trendStreak}).` : '';
  const marketTag = market ? ` Market: ${market.note}.` : '';
  thesis.thought =
    `I'm using ${sig.model} on ${bars.length} bars. Direction ${dir} with ~${Math.abs(thesis.expectedMovePct).toFixed(1)}% ` +
    `expected move, confidence ${Math.round(conf * 100)}%.${regimeTag}${marketTag} ${hypotheses[0]}`;
  return thesis;
}

// ---------------- helpers ----------------
function sma(arr, n) {
  if (arr.length < n) return null;
  return arr.slice(-n).reduce((a, b) => a + b, 0) / n;
}
function rsi(arr, n = 14) {
  if (arr.length < n + 1) return null;
  let g = 0,
    l = 0;
  const start = arr.length - n - 1;
  for (let i = start + 1; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1];
    if (d >= 0) g += d;
    else l -= d;
  }
  if (!l) return 100;
  return 100 - 100 / (1 + g / l);
}
function annVol(arr, n = 20) {
  if (arr.length < n + 1) return 0;
  const rets = [];
  for (let i = arr.length - n; i < arr.length; i++) rets.push(Math.log(arr[i] / arr[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(v) * Math.sqrt(252) * 100;
}
function shortMom(arr, n) {
  if (arr.length < n + 1) return 0;
  return Math.log(arr[arr.length - 1] / arr[arr.length - 1 - n]) / n;
}
function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
function volState(vol) {
  return vol > 0.35 ? 'high' : vol > 0.18 ? 'mid' : 'low';
}

module.exports = {
  pickModel,
  reason,
  baselineForecast,
  t1Signal,
  t2Factors,
  t3Adaptive,
  t4Advanced,
  walkForwardWins,
  annVol,
  sma,
  rsi,
};
