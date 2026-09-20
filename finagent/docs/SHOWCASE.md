# 三端平台展示

FinAgent 的同一套数据与自研算法，同时在 **Web 控制台 / CLI / 开放 API** 三端展示，语义由 `src/shared/contract.js` 的统一契约保证一致。

## 1. Web 控制台（`npm start` → http://localhost:3001）

| 标签 | 展示 |
| --- | --- |
| 概览 | 资产数 / 涨跌 / 均价 / 自研模型 + 竞技场胜率；资产总览（点行进入详情） |
| 行情数据 | 多源聚合：主源、多源 bar 数、布林上下轨 |
| 分析 | 技术指标 + 自研模型标签 + RSI 仪表 + “自我思考”假设 + 不确定度 |
| 预测 & 命中 | 多周期目标价/置信度 + 历史 dry-run 命中率 + 自适应反馈样本数 |
| 模型竞技场 | 每个标的 T1..T4 + Baseline 的胜率条与误差，标注竞技场最佳与命中阈值 |
| 运维 | 资产数 / 原始数据体积 / stale 资产（`/api/ops/health`） |
| 开放 API | 端点 + scope 速查 |

详情面板：最近 120 bar 价格曲线（sparkline）+ 关键指标 + 自我思考 + 竞技场 + 命中摘要。

## 2. CLI

```bash
npm run collect:full   # 采集 + 自研算法 + 预测 + 历史命中
npm run backtest       # 打印命中率 / 竞技场
npm run ops:audit      # 运维巡检
```

## 3. 开放 API / 第三方应用

```js
const { FinAgentClient } = require('finagent/src/shared/client');
const c = new FinAgentClient({ version: 'full' });
await c.run(['AAPL', 'NVDA']);
const { snapshot, contractErrors } = await c.snapshot('AAPL');
// snapshot.inHouse / reasoning / modelArena / prediction / backtest
// contractErrors === [] 表示满足三端契约
```

## 三端一致性

- 数据契约：`src/shared/contract.js`（`SNAPSHOT_SHAPE` + `validateSnapshot`）。
- 校验测试：`test/shared.test.js`（lite/full 快照均契约干净；坏快照能被标记）。
- 发布前跑 `npm test` 即保证三端语义一致。

## 算法迭代说明（本轮 v2）

- T3 自适应：学习率按命中率调节（命中越多校准越稳）。
- 晋级门槛提高（数据量门槛 300/800/1600），walk-forward 样本更严格防过拟合。
- 命中阈值收紧到 **1.5%**（竞技场 + dry-run + 回测），命中率更真实。
