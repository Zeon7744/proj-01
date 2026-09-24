'use strict';
const fs=require('fs');
const p='src/engines/inhouse.js';
let s=fs.readFileSync(p,'utf8');

// 1) reason(): thesis 加 market 字段
const t1Old="  const regime = (sig.factors && sig.factors.regime) || sig.regime || null;\n  const thesis = {\n    model: sig.model,\n    direction: dir,\n    expectedMovePct: ((target - last) / last) * 100,\n    confidence: conf,\n    volState: sig.factors ? sig.factors.state : sig.volState || null,\n    regime: regime || null,\n  };";
const t1New="  const regime = (sig.factors && sig.factors.regime) || sig.regime || null;\n  const market = sig.market || null;\n  const thesis = {\n    model: sig.model,\n    direction: dir,\n    expectedMovePct: ((target - last) / last) * 100,\n    confidence: conf,\n    volState: sig.factors ? sig.factors.state : sig.volState || null,\n    regime: regime || null,\n    market: market || null,\n  };";
if(!s.includes(t1Old)){console.error('thesis block not found');process.exit(1);}
s=s.replace(t1Old, t1New);

// 2) hypotheses 前插入市场情绪假设
const hOld="  if (conf < 0.55) {";
const hNew="  if (market) {\n    if (market.news && market.news.sentiment > 0.4) {\n      hypotheses.push('Positive news sentiment (hot events) - short-term bid likely to hold, but watch for fade after the move.');\n    }\n    if (market.news && market.news.sentiment < -0.4) {\n      hypotheses.push('Negative news sentiment - downside pressure may extend; avoid catching the falling knife.');\n    }\n    if (market.macro && market.macro.stance === 'hawkish') {\n      hypotheses.push('Macro stance hawkish (rate/inflation proxy) - discount later cash flows, prefer relative strength over beta.');\n    }\n    if (market.macro && market.macro.stance === 'dovish') {\n      hypotheses.push('Macro stance dovish - liquidity tailwind favors extended rallies; wider stops acceptable.');\n    }\n  }\n  if (conf < 0.55) {";
if(!s.includes(hOld)){console.error('conf<0.55 anchor not found');process.exit(1);}
s=s.replace(hOld, hNew);

// 3) thought 加 market 标签
const thOld="  const regimeTag = regime ? ` Regime: ${regime.marketState} (vol ${regime.volRegime}/${regime.volTrend}, streak ${regime.trendStreak}).` : '';\n  thesis.thought =\n    `I'm using ${sig.model} on ${bars.length} bars. Direction ${dir} with ~${Math.abs(thesis.expectedMovePct).toFixed(1)}% ` +\n    `expected move, confidence ${Math.round(conf * 100)}%.${regimeTag} ${hypotheses[0]}`;";
const thNew="  const regimeTag = regime ? ` Regime: ${regime.marketState} (vol ${regime.volRegime}/${regime.volTrend}, streak ${regime.trendStreak}).` : '';\n  const marketTag = market ? ` Market: ${market.note}.` : '';\n  thesis.thought =\n    `I'm using ${sig.model} on ${bars.length} bars. Direction ${dir} with ~${Math.abs(thesis.expectedMovePct).toFixed(1)}% ` +\n    `expected move, confidence ${Math.round(conf * 100)}%.${regimeTag}${marketTag} ${hypotheses[0]}`;";
if(!s.includes(thOld)){console.error('thought block not found');process.exit(1);}
s=s.replace(thOld, thNew);

fs.writeFileSync(p,s);
console.log('inhouse.reason() updated with market signal');
