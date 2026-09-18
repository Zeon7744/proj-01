'use strict';
// 简版：采集数据少 + 简单分析（无预测）
const agent = require('../src/agent');

agent.runAgent('lite', {}, (msg) => console.log(msg))
  .then((r) => {
    console.log(`\n[OK] lite collected ${r.tickers.length} tickers:`);
    r.tickers.forEach((t) =>
      console.log(
        `  ${t.ticker} bars=${t.bars} trend=${t.metrics.trend} last=${t.metrics.lastPrice} signal=${t.metrics.signal || 'n/a'}`
      )
    );
  })
  .catch((e) => console.error(e));
