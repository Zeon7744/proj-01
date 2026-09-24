# FinAgent · 全球金融数据采集与精准投资分析 Agent

[![CI](https://github.com/OWNER/finagent/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/finagent/actions)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node: 18+](https://img.shields.io/badge/node-18%2B-brightgreen.svg)](https://nodejs.org/)

可放在 **GitHub** 分享的全栈金融 agent：多源采集全球金融资产（股票、指数、ETF、加密、外汇、大宗）最长 10 年日线行情，实时增量迭代；分析算法是**自研高精度 in-house 模型**（T1 规则 → T2 多因子 → T3 自适应 → T4 进阶 + **regime 感知**），能**随数据量晋级、walk-forward 验证、自我校准权重、感知市场状态、生成假设与不确定度**（自我思考能力）；完整版开放多周期预测并做**命中检测 / 历史 dry-run 回测**；带 **RBAC 权限隔离**、**应用开放 API**、**三端共享契约**与**运维能力**（健康 / 备份 / 定时任务 / 限流 / 审计）。

> 数据源：`alpha_vantage` / `yfinance`（配 `ALPHAVANTAGE_API_KEY` 即用真实数据），多源自动取“bar 数最多”为主源；无网络/无 key 时回退到确定性模拟数据，任何环境都能完整跑通。

## 双版本

| 能力 | 简版 `lite` | 完整版 `full` |
| --- | --- | --- |
| 标的 | 8 个主要标的 | 20 个（股/指/币/汇/商品） |
| 数据量 | 约 1 年 · 400 bar | **10 年 · 2500 bar** |
| 算法 | 简单指标 | 自研高精度 + regime 感知 + 自适应 |
| 分析 | ✅ | ✅ 更精准 |
| 预测 | ❌ | ✅ 多周期（5/20/60 天）目标价 + 置信度 |
| 命中检测 | ❌ | ✅ 1.5% 误差判命中 + 历史 dry-run |
| 自我升级 | ❌ | ✅ walk-forward 晋级 + 自适应权重 + 进化日志 |

## 自研高精度算法

- **T1 lite-rule** → **T2 multi-factor** → **T3 adaptive**（按命中率自适应学习率）→ **T4 advanced**（regime 感知）。
- **Regime 因子**（`src/engines/regime.js`）：波动率状态持续性 + 趋势持续天数 + 风险调整系数，T4 据此调整目标价与置信度。
- **晋级**：按数据量门槛（300/800/1600）+ walk-forward 相对基线验证才升级（防过拟合）。
- **自我思考**：`reason()` 输出方向、预期涨跌、置信度、不确定度、假设列表、regime 与自然语言“思考”。
- 详见 [docs/ALGORITHM.md](./docs/ALGORITHM.md)。

## 会员等级（free / pro / enterprise）

在 RBAC 角色（操作权限）之上叠加**会员等级（功能开放 + 配额）**两个维度，二者正交：角色决定能否做某类操作，会员等级决定开放哪些功能与多少配额。

| 功能 | free | pro | enterprise |
| --- | --- | --- | --- |
| 支持版本 | lite | lite + full | lite + full |
| 预测 | ❌ | ✅ | ✅ |
| 命中回测 | ❌ | ✅（基础） | ✅（含 regime） |
| 模型竞技场 | ❌ | ✅ | ✅（含 byRegime） |
| Regime 感知 | ❌ | ❌ | ✅ |
| 进化日志 | 最近 20 | 最近 200 | 全部（流式） |
| API 配额 | 60/min | 300/min | 1200/min |
| 密钥配额 | 1 | 5 | 不限 |
| 数据回溯 | 365 天 | 3650 天 | 3650 天+ |

内置演示账号映射：`viewer → free`、`analyst → pro`、`admin → enterprise`。`GET /api/tier` 自省当前等级的开放功能与配额。详见 [docs/ENTITLEMENTS.md](./docs/ENTITLEMENTS.md)。

## 权限隔离 & 应用开放

| 角色 | API Key（默认） | 权限（scope） |
| --- | --- | --- |
| `viewer` | `fa_viewer_1c9d` | `read:data` `read:analysis` `read:predictions` |
| `analyst` | `fa_analyst_7f3a` | 上 + `write:collect` `write:analyze` |
| `admin` | `fa_admin` | `*` + `manage:keys` + `manage:ops` |

`Authorization: Bearer <key>` / `X-API-Key`；`FINAGENT_STRICT_KEYS=1` 开启严格模式（无 key 即 401）。`POST /api/keys/:role` 即时签发应用密钥。

## 三端共享（Web / CLI / 开放 API）

同一套 store + 引擎 + **数据契约**（`src/shared/contract.js`），`FinAgentClient`（`src/shared/client.js`）供脚本/第三方应用直接消费；详见 [docs/SHOWCASE.md](./docs/SHOWCASE.md)。

## 快速开始

```bash
cd finagent
npm install
npm start          # http://localhost:3001 控制台 + API
```

CLI：

```bash
npm run collect:lite   # 简版：采集 + 分析
npm run collect:full   # 完整版：采集 + 自研算法 + 预测 + 历史命中 + regime + 进化日志
npm run backtest       # 打印命中率 / 竞技场
npm run evolve         # 自我升级日志
npm run ops:audit      # 运维：健康检查 / 命中率巡检
npm run ops:backup     # 运维：全量数据备份
npm run ops:jobs       # 运维：启动定时任务（守护）
npm run serve:daemon   # 后台守护进程
npm test               # 17 项单元测试（引擎 + 三端契约 + 限流 + regime）
```

## 三端平台展示

详见 [docs/SHOWCASE.md](./docs/SHOWCASE.md)：Web 控制台（概览 / 行情 / 分析 / 预测&命中 / 模型竞技场 / 自我升级日志 / 运维 / 开放 API）+ CLI + 开放 API。

## 运维与三端共享

详见 [docs/OPS.md](./docs/OPS.md)：健康检查 / 命中率巡检 / 备份清理 / 定时任务 / 日志；三端共享契约与 `FinAgentClient`。

## 生产安全加固

详见 [docs/SECURITY.md](./docs/SECURITY.md)：密钥强约束、限流、审计、数据落地、守护进程。

## API 速览

```
GET  /api/health /api/meta /api/versions
GET  /api/tickers /api/tickers/:ticker?version=full
GET  /api/tickers/all?version=full           read:analysis
GET  /api/tickers/:ticker/bars              read:data
GET  /api/arena/:ticker                     read:analysis
GET  /api/evolution?limit=N                  read:analysis
GET  /api/predictions /api/backtest/:ticker  read:predictions
POST /api/agent/run  {version, tickers}     write:collect
GET  /api/ops/health|audit|backup|prune|jobs  manage:ops
GET  /api/keys ; POST /api/keys/:role       manage:keys（admin）
```

## 目录

```
finagent/
├─ config/versions.js
├─ src/
│  ├─ collectors/{index,yfinance,alpha_vantage,base}.js   # 多源聚合 + 模拟回退
│  ├─ engines/{analyze,inhouse,regime,arena,predict,backtest,dryrun,evolution}.js
│  ├─ store/db.js
│  ├─ shared/{contract,client}.js                         # 三端共享契约 + 客户端
│  ├─ ops/{logger,health,backup,scheduler,middleware}.js  # 运维
│  ├─ agent.js                                             # 编排
│  └─ auth/rbac.js                                         # 权限隔离
│  └─ entitlements/tiers.js                                # 会员等级矩阵 + applyTier
├─ server.js
├─ public/{index.html,css/app.css,js/app.js}               # 控制台
├─ scripts/{collect-lite,collect-full,backtest,evolve,ops,serve}.js
├─ data/{raw,processed,predictions,backtest,backups}
└─ test/{engines,shared,regime,middleware}.test.js
```

## 使用真实数据

```bash
export ALPHAVANTAGE_API_KEY=xxxx   # 可选；否则自动回退模拟
# 可选安装 @node-yfinance 走真实 yfinance
```

## 风险

- 预测为研究性模型，**非投资建议**；命中回测用于验证模型在历史数据上的表现，不构成对未来收益的保证。
- 金融数据受交易所条款约束，生产商用请遵守数据源许可。

## 许可证

MIT.
