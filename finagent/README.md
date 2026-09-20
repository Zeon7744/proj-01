# FinAgent · 全球金融数据采集与精准投资分�?Agent

[![CI](https://github.com/OWNER/finagent/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/finagent/actions)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node: 18+](https://img.shields.io/badge/node-18%2B-brightgreen.svg)](https://nodejs.org/)

可放�?**GitHub** 分享的全栈金�?agent：多源采集全球金融资产（股票、指数、ETF、加密、外汇、大宗）最�?10 年日线行情，实时增量迭代；分析算法是**自研高精�?in-house 模型**（T1 规则 �?T2 多因�?�?T3 自适应 �?T4 进阶），�?*随数据量晋级、walk-forward 验证、自我校准权重、生成假设与不确定度**（体现自我思考能力）；完整版开放多周期预测并做**命中检�?/ 历史 dry-run 回测**；带 **RBAC 权限隔离**�?*应用开�?API**�?
> 数据源：`alpha_vantage` / `yfinance`（配 `ALPHAVANTAGE_API_KEY` 即用真实数据），多源自动取“bar 数最多”为主源；无网络/�?key 时回退到确定性模拟数据，任何环境都能完整跑通�?
## 双版�?
| 能力 | 简�?`lite` | 完整�?`full` |
| --- | --- | --- |
| 标的 | 8 个主要标�?| 20 个（�?�?�?�?商品�?|
| 数据�?| �?1 �?· 400 bar | **10 �?· 2500 bar** |
| 算法 | 简单指�?| 自研高精度多因子 + 自适应 + 进阶 |
| 分析 | �?| �?更精�?|
| 预测 | �?| �?多周期（5/20/60 天）目标�?+ 置信�?|
| 命中检�?| �?| �?误差 �?% 判命�?+ 历史 dry-run 立即展示 |
| 自我升级 | �?| �?walk-forward 验证晋级 + 自适应权重 |

## 自研高精度算法（in-house�?
- **T1 lite-rule**：趋�?+ 均值回归打分（数据少）�?- **T2 multi-factor**：趋�?/ 动量 / 均值回�?/ 波动率加权�?- **T3 adaptive**：用滚动误差反馈**在线调权�?*（自我校准）�?- **T4 advanced**：动量分解（�?中期�? 波动率状�?+ 风险调整目标�?- **晋级**：按数据量选最低满足门槛的阶段；`walkForwardWins` 验证更高模型相对基线更准才晋级（防过拟合）�?- **自我思�?*：`reason()` 输出方向、预期涨跌、置信度、不确定度、假设列表与自然语言“思考”�?
## 权限隔离 & 应用开�?
| 角色 | API Key（默认） | 权限（scope�?|
| --- | --- | --- |
| `viewer` | `fa_viewer_1c9d` | `read:data` `read:analysis` `read:predictions` |
| `analyst` | `fa_analyst_7f3a` | �?+ `write:collect` `write:analyze` |
| `admin` | `fa_admin` | `*` + `manage:keys` |

请求�?`Authorization: Bearer <key>` �?`X-API-Key`；本地控制台默认 admin（`FINAGENT_LOCAL_OPEN=0` 关闭）。`POST /api/keys/:role` 即时签发新应用密钥�?
## 快速开�?
```bash
cd finagent
npm install
npm start          # http://localhost:3001 控制�?+ API
```

CLI�?
```bash
npm run collect:lite   # 简版：采集 + 分析
npm run collect:full   # 完整版：采集 + 自研算法 + 预测 + 历史 dry-run 命中
npm run backtest       # 打印命中�?/ 竞技场报�?npm test               # 引擎单元测试
```

## 部署与开放应�?
详见 [docs/DEPLOY.md](./docs/DEPLOY.md)：本地运行、接入真实数据、应用密钥签发、生产加固、定时迭代�?
## API 速览

```
GET  /api/health /api/meta /api/versions
GET  /api/tickers /api/tickers/:ticker?version=full
GET  /api/tickers/all?version=full           read:analysis
GET  /api/tickers/:ticker/bars              read:data
GET  /api/arena/:ticker                     read:analysis
GET  /api/predictions /api/backtest/:ticker read:predictions
POST /api/agent/run  {version, tickers}     write:collect
GET  /api/keys ; POST /api/keys/:role       manage:keys（admin�?```

## 目录

```
finagent/
├─ config/versions.js
├─ src/
�? ├─ collectors/{index,yfinance,alpha_vantage,base}.js   # 多源聚合 + 模拟回退
�? ├─ engines/{analyze,inhouse,arena,predict,backtest,dryrun}.js
�? ├─ store/db.js
�? ├─ agent.js                                           # 编排
�? └─ auth/rbac.js                                       # 权限隔离
├─ server.js
├─ public/{index.html,css/app.css,js/app.js}             # 控制�?├─ scripts/{collect-lite,collect-full,backtest}.js
├─ data/{raw,processed,predictions,backtest}
└─ test/engines.test.js
```

## 使用真实数据

```bash
export ALPHAVANTAGE_API_KEY=xxxx   # 可选；否则自动回退模拟
# 可选安�?@node-yfinance 走真�?yfinance
```

## 风险

- 预测为研究性模型，**非投资建�?*；命中回测用于验证模型在历史数据上的表现，不构成对未来收益的保证�?- 金融数据受交易所条款约束，生产商用请遵守数据源许可�?
## 许可�?
MIT.




