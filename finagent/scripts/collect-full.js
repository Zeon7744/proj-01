'use strict';
// 完整版：10 年大数据量 + 自研高精度算法 + 预测 + 历史 dry-run 命中
const agent = require('../src/agent');

agent.runAgent('full', {}, (msg) => console.log(msg))
  .then((r) => {
    console.log(`\n[OK] full collected ${r.tickers.length} tickers:`);
    r.tickers.forEach((t) => {
      const p = t.prediction ? t.prediction.horizons.map((h) => `${h.days}d->${h.target}`).join(' ') : 'n/a';
      const hist = t.backtest && t.backtest.historical ? `histAcc=${t.backtest.historical.accuracyPct}%` : 'no-hist';
      const ih = t.inHouse ? `model=${t.inHouse.model}${t.inHouse.upgraded ? '(upgraded)' : ''}` : '';
      const arena = t.modelArena && t.modelArena.best ? `arenaBest=${t.modelArena.best.label}/${t.modelArena.best.winRate}%` : '';
      console.log(`  ${t.ticker} bars=${t.bars} ${ih} ${arena} ${hist} | ${p}`);
    });
  })
  .catch((e) => console.error(e));
