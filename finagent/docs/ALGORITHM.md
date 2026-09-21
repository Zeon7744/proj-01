# 算法迭代与 Regime 感知（v3）

本轮在 v2（命中阈值收紧到 1.5%、晋级门槛提高）基础上，加入 **regime 感知**，让自研 T4 模型对市场状态更敏感。

## Regime 因子（`src/engines/regime.js`）

输入 10 年日线，输出市场状态特征：

| 字段 | 含义 |
| --- | --- |
| `volRegime` | 当前年化波动率档位：high / mid / low |
| `volTrend` | 波动率变化：expanding（20d>60d×1.2）/ contracting（<0.8）/ stable |
| `volDrift` | 20d 波动率 / 60d 波动率 |
| `trendStreak` | 价格连续高于/低于 SMA20 的交易日数（正=上行，负=下行） |
| `marketState` | 综合状态：`low-vol-uptrend` / `mid-vol-bull` / `high-vol-trend-down` 等 6 种 |
| `riskAdjust` | 风险调整系数（0.5–1.4），高波+扩张降权、低波+收缩+长趋势增权 |

## 接入点

- **T4 进阶模型**（`inhouse.t4Advanced`）：用 `regime.riskAdjust` 替代旧的固定波动率风险调整，输出 `factors.regime` + `regime`。
- **T3 自适应**（`inhouse.t3Adaptive`）：`factors` 携带 `regime`，随 adaptive 反馈一起回灌。
- **自我思考**（`inhouse.reason`）：假设列表加入 regime 规则（如“高波扩张缩仓”“低波收缩放宽目标”“长趋势顺势”），`thought` 自然语言引用 regime。
- **推理/详情面板**：Web 控制台“分析”与“标的详情”展示 regime 标签（marketState / volRegime / volTrend / trendStreak / riskAdjust）。

## 自我升级日志（`src/engines/evolution.js`）

agent 每次运行自动记录三类“进化事件”到 `data/evolution.json`（保留最近 200 条）：

- `promotion`：walk-forward 验证后晋级（tier → 模型）。
- `arena-win`：模型竞技场胜出（key + 胜率 + 阈值）。
- `calibration`：历史 dry-run 命中 + 自适应反馈样本数。

三端共享：

- API：`GET /api/evolution?limit=N`（`read:analysis`）。
- CLI：`npm run evolve`。
- Web：控制台“自我升级日志”页。

## 验证

- `test/regime.test.js`：regime 特征、T4/T3 factors.regime、thesis.regime、进化日志。
- 全量测试 17/17 通过。
- 端到端：`collect-full` → 每个标的 T4 携带 regime（如 AAPL `low-vol-downtrend streak=-49`），进化日志自动写入校准/竞技场事件。
