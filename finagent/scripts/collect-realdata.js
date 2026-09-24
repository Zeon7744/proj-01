'use strict';

// 真实数据子集采集脚本（供 test/realdata.test.js 调用）：
// 用法：node scripts/collect-realdata.js AAPL,MSFT,NVDA
// 输出：JSON { tickers: [{ ticker, bars, source, asOf }] }
const { collectPriceData } = require('../src/collectors');
const versions = require('../config/versions');

async function main() {
  const raw = (process.argv[2] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const tickers = raw.length ? raw : versions.full.collect.tickers.slice(0, 3);
  const cfg = {
    ...versions.full.collect,
    tickers,
  };
  const out = [];
  for (const t of tickers) {
    const r = await collectPriceData(t, cfg, (msg) => console.error(msg));
    out.push({ ticker: t, bars: r.bars.length, source: r.source, asOf: r.bars[r.bars.length - 1].date, multi: r.multi });
  }
  console.log(JSON.stringify({ tickers: out }, null, 2));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
