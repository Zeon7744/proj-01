# FinAgent · 数字员工系统（Digital Workers Division of Labor）

把 agent 流水线拆成 **7 个职责清晰的数字员工岗位**，每个员工单一职责、可审计、可替换。
不同会员等级开放不同数量的在岗员工，形成"精准分工"。

## 岗位总览

| 岗位（key） | 中文名 | 职责 | 开放等级 |
| --- | --- | --- | --- |
| `collector` | 采集员 | 多源行情拉取（yfinance / alpha_vantage / 模拟回退）、清洗、时间轴对齐 | 全员 |
| `analyst` | 分析师 | 指标计算（SMA/RSI/ATR/Boll）+ 多因子生成（trend/mom/mr/vol） | 全员 |
| `modeler` | 建模师 | 自研 T1..T4 模型选择 + regime 感知，输出模型信号与不确定性 | pro+ |
| `forecaster` | 预测员 | 多周期（5/20/60d）目标价 + 置信度，落盘预测记录 | 全员 |
| `backtester` | 回测员 | 命中检测、walk-forward、历史 dry-run，生成自适应反馈 | pro+ |
| `auditor` | 审计员 | 归档进化事件（晋级/校准/竞技场胜出），维护可追溯自我升级日志 | pro+ |
| `strategist` | 策略师 | regime 分组竞技场 + 市场基准对标差距分析 | enterprise |

## 在岗花名册（按会员等级）

| 等级 | 在岗人数 | 岗位 |
| --- | --- | --- |
| `free` (lite3) | 3 | 采集员 · 分析师 · 预测员 |
| `pro` (pro5) | 5 | + 建模师 · 回测员 |
| `enterprise` (enterprise7) | 7 | + 审计员 · 策略师 |

> 岗位名单由 `src/engines/workers.js` 的 `ROSTERS` 定义，与 `TIER.workerRoster` 键对齐。

## 岗位报告（workerReport）

每次 agent 运行后，编排器为当前会员等级生成一份 `workerReport`，随快照返回三端：

```json
{
  "tier": "enterprise",
  "roster": ["collector","analyst","modeler","forecaster","backtester","auditor","strategist"],
  "headcount": 7,
  "rows": [
    { "key": "collector",  "title": "采集员", "produced": "yfinance:1786 · alpha_vantage:1786", "status": "ok" },
    { "key": "analyst",    "title": "分析师", "produced": "trend=bullish rsi=74.2", "status": "ok" },
    { "key": "modeler",    "title": "建模师", "produced": "T4-advanced (tier T4)", "status": "ok" },
    { "key": "forecaster", "title": "预测员", "produced": "5d→335.97(+0.05%) 20d→336.46(+0.19%)", "status": "ok" },
    { "key": "backtester", "title": "回测员", "produced": "hit 73/80=91.25%", "status": "ok" },
    { "key": "auditor",    "title": "审计员", "produced": "3 events archived", "status": "ok" },
    { "key": "strategist", "title": "策略师", "produced": "MRS 基准 outperforming · 平均超额 +1.2%", "status": "ok" }
  ],
  "benchmark": { "available": true, "summary": { "verdict": "outperforming" } }
}
```

- `status` 取值：`ok`（已产出）/ `idle`（未触发）/ `skipped`（该等级不开放）/ `locked`（非 enterprise 锁定的策略师）。
- 非 enterprise 用户：`benchmark` 字段被 `applyTier` 置 `undefined`，策略师行 `status=locked`。

## 代码位置

| 文件 | 职责 |
| --- | --- |
| `src/engines/workers.js` | `ROLES` / `ROSTERS` / `rosterFor` / `workerReport`（纯函数，可离线） |
| `src/agent.js` | 编排器在步骤 9/10 生成 `workerReport` + `benchmarkGap` |
| `src/entitlements/tiers.js` | `TIER.workerRoster` / `TIER.benchmarkGap` + `applyTier` 收紧 |
| `src/shared/contract.js` | 契约新增 `workerReport` / `benchmarkGap` shape |
| `public/js/app.js` | "数字员工" tab + "市场基准对标" panel |
| `test/workers-benchmark.test.js` | 7 项单测 |

## 与会员等级的关系

- 数字员工是**功能开放维度**，不是新的 RBAC 角色。
- 升级会员等级 = 解锁更多在岗数字员工 + 开放策略师的基准对标。
- 详见 [ENTITLEMENTS.md](./ENTITLEMENTS.md)。
