'use strict';
// 命中回测报告 CLI：优先展示历史 dry-run 命中率，再展示正式预测命中状态。
const agent = require('../src/agent');
const db = require('../src/store/db');

agent.runAgent('full', {}, () => {})
  .then(() => {
    db.listTickers().forEach((t) => {
      const rep = db.loadBacktestReport(`${t}_bt`);
      if (rep && rep.historical && rep.historical.accuracyPct != null) {
        const h = rep.historical;
        const arena = h.modelArena && h.modelArena.best ? ` arena=${h.modelArena.best.label}` : '';
        console.log(
          `${t}: 历史dry-run命中 ${h.hits}/${h.samples} = ${h.accuracyPct}% avgErr=${h.avgAbsErrPct}% model=${h.predictions[h.predictions.length - 1].model}${arena}`
        );
      } else if (rep && rep.accuracyPct != null) {
        console.log(`${t}: 正式命中 ${rep.hitPoints}/${rep.totalForecastPoints} = ${rep.accuracyPct}%`);
      } else {
        console.log(`${t}: 暂无命中数据（预测刚生成，待未来价格到来）`);
      }
    });
  })
  .catch((e) => console.error(e));
