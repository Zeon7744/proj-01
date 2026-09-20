# 运维与三端共享指南

## 1. 运维能力

FinAgent 内置一套轻量运维（`src/ops/`），无需额外依赖即可监控与治理数据：

| 能力 | 入口 | 说明 |
| --- | --- | --- |
| 健康检查 | `GET /api/ops/health` · `npm run ops:audit` | 资产数、原始数据体积、stale 资产 |
| 命中率巡检 | `GET /api/ops/audit` · 定时任务 | 每 1h 自动告警 stale 资产 |
| 数据备份 | `POST /api/ops/backup` · `npm run ops:backup` | 全量 JSON 快照到 `data/backups/` |
| 数据清理 | `POST /api/ops/prune` · `npm run ops:prune` | 删旧预测/回测、raw 限 2500 bars |
| 日志 | `logs/finagent-YYYY-MM-DD.log` | 按天滚动，保留 14 天 |
| 定时任务 | `GET /api/ops/jobs` · `npm run ops:jobs` | 数据刷新 / 日志清理 / 命中率巡检 |

### 定时任务（三种方式）

- 随服务自启：`FINAGENT_AUTOSTART_JOBS=1 npm start`
- 独立守护：`npm run ops:jobs -- --version full`（Ctrl+C 停止）
- 外部 cron：`0 6 * * * cd /path/to/finagent && npm run collect:full`

## 2. 三端共享（Web / CLI / 开放 API）

三端共用同一套 **store + 自研引擎 + 数据契约**，保证语义一致：

- 数据契约：`src/shared/contract.js`（`SNAPSHOT_SHAPE` + `validateSnapshot`）。
- 共享客户端：`src/shared/client.js`（`FinAgentClient`），任何脚本 / 第三方应用直接 `require` 即可消费与 Web 控制台、开放 API 完全一致的快照。
- 开放 API：`server.js` 的 `/api/*` 端点，同一套 `getSnapshot/listAll`。
- CLI：`scripts/collect-*.js`、`scripts/ops.js`，同一套 agent。

### 第三方应用接入示例（Node）

```js
const { FinAgentClient } = require('finagent/src/shared/client');
const c = new FinAgentClient({ version: 'full' });
await c.run(['AAPL', 'NVDA']);            // 采集 + 分析 + 预测 + 命中 + 自我升级
const { snapshot, contractErrors } = await c.snapshot('AAPL');
console.log(snapshot.inHouse.model, snapshot.reasoning.thought);
console.log('contract', contractErrors);    // [] 表示满足契约
```

### 一致性校验（CI / 发布前）

```bash
npm test   # 含三端共享契约测试（test/shared.test.js）
```

## 3. 部署形态

- 单体：`npm start`（控制台 + API + 可选定时任务）。
- 多端：Web 控制台托管在 `public/`，API 同源；CLI 与外部应用通过共享客户端或 API 接入。
- 生产加固见 `docs/DEPLOY.md`。
