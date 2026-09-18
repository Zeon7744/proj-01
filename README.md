# proj-01

集成项目包，包含两个子项目：

## 1. 任务管理系统 (root)

简洁的 CRUD 任务管理应用，基于 Express + JSON 文件存储。

- 任务增删改查
- 状态管理：待办 / 进行中 / 已完成
- 优先级：低 / 中 / 高
- 截止日期与逾期提示
- 数据持久化到 `data/records.json`

快速开始：

```bash
npm install
npm start
```

## 2. FinAgent - 全球金融数据 Agent

全栈金融数据 Agent，支持多源采集、自研算法、精准预测。

### 双版本

- **Lite**: 8 个标的，1 年数据，简单指标分析
- **Full**: 20 个标的（股/指/币/汇/商品），10 年数据，自研 T4 高级算法，多周期预测+回测验证

### 核心能力

- 多源数据采集（yfinance / Alpha Vantage）
- 自研高精度算法（T1 规则 → T2 多因子 → T3 自适应 → T4 进阶）
- 多周期预测（5/20/60 天目标价 + 置信度）
- Walk-forward 回测 + 命中检测
- RBAC 权限隔离（viewer/analyst/admin）

### 快速开始

```bash
cd finagent
npm install
npm start  # http://localhost:3001
```

### API 端点

```
GET  /api/health
GET  /api/tickers              # 读取行情列表
GET  /api/tickers/:ticker/bars # K 线数据
GET  /api/predictions          # 预测记录
GET  /api/backtest/:ticker     # 回测报告
POST /api/agent/run            # 运行 Agent（采集+分析+预测）
```

### 预测样例 (AAPL)

```json
{
  "ticker": "AAPL",
  "base": 335.81,
  "model": "T4-advanced",
  "predictions": [
    { "days": 5,  "target": 335.96 },
    { "days": 20, "target": 336.43 },
    { "days": 60, "target": 337.12 }
  ]
}
```
