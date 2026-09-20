'use strict';
// 自我升级日志：打印模型晋级 / 竞技场胜出 / 权重校准轨迹。
const evolution = require('../src/engines/evolution');

const events = evolution.latest(parseInt(process.argv[3] || '40', 10));
if (!events.length) {
  console.log('暂无进化事件（先运行完整版采集：npm run collect:full）');
  process.exit(0);
}
console.log(`FinAgent 自我升级日志（最近 ${events.length} 条，按时间倒序）`);
const byKind = { promotion: 0, 'arena-win': 0, calibration: 0 };
events.forEach((e) => {
  const icon = e.kind === 'promotion' ? '▲' : e.kind === 'calibration' ? '◈' : '★';
  const time = e.ts ? e.ts.slice(0, 19).replace('T', ' ') : '';
  console.log(`  ${icon} [${e.kind}] ${e.ticker}  ${time}  ${e.detail}`);
  if (byKind[e.kind] != null) byKind[e.kind]++;
});
console.log(`\n汇总：晋级 ${byKind.promotion} · 竞技场胜出 ${byKind['arena-win']} · 权重校准 ${byKind.calibration}`);
