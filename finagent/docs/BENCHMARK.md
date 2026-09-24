# FinAgent · 市场基准对标与差距分析（Benchmark Gap）

策略师（`strategist`，仅 enterprise）产出的**市场差距报告**，回答"自研算法相比市场基准到底好多少 / 差多少"。

## 基准选择

不依赖外部指数数据（GitHub 离线友好），用**等权组合市场相对强弱**（Market-Relative Strength, MRS）作为代理基准：

- **MRS（单标的）**：该标的相对同组合其他标的的超额收益（5/20/60 日窗口）。
- **组合基准**：等权组合同窗口相对收益的均值，代表"市场/组合平均表现"。
- **差距判定**：
  - 该标的 MRS > 组合均值 + 0.5% → `outperforming`（跑赢）
  - < 组合均值 - 0.5% → `underperforming`（跑输）
  - 否则 → `on-par`（持平）

## 输出结构

```json
{
  "available": true,
  "benchmark": "equal-weight portfolio MRS",
  "modelKey": "T4-advanced",
  "horizonDays": 20,
  "threshold": 0.015,
  "portfolio": { "avgRetPct": 1.86, "best": {...}, "worst": {...} },
  "perTicker": [
    { "ticker": "AAPL", "mrsRetPct": 1.86, "outperformancePct": 0, "modelHitRate": 54.7, "regime": "low-vol-downtrend" }
  ],
  "summary": {
    "verdict": "on-par",
    "avgOutperformancePct": 0,
    "avgModelHitRate": 54.7,
    "winners": 0, "losers": 0, "neutral": 1
  },
  "gapNote": "自研 T4-advanced 与等权组合 MRS 基本持平（平均超额 0%），命中率 54.7%"
}
```

## 与市场基准对比的解读

| 指标 | 含义 | 市场对比参考 |
| --- | --- | --- |
| `avgModelHitRate` | 自研模型 walk-forward 命中率 | 散户择股约 40-50%，专业基金 55-65%；越高越接近/超越机构 |
| `avgOutperformancePct` | 相对等权组合的超额 | 跑赢等权即说明自研 alpha 有效；跑输说明应收缩仓位 |
| `winners / losers` | 跑赢/跑输组合的标的数 | 胜率（winners/total）越高，选股能力越强 |
| `regime` | 该标的当前市场状态 | 高波+扩张时命中率天然下降，需结合 regime 解读 |

> **研究性说明**：MRS 是"跑赢组合"的相对基准，不是"跑赢标普500"的绝对基准。接入真实指数数据后可升级为绝对基准对比。预测与命中率均为研究性模型输出，**非投资建议**。

## 代码位置

| 文件 | 职责 |
| --- | --- |
| `src/engines/benchmark.js` | `marketRelativeStrength` / `portfolioBaseline` / `modelWalkForwardHitRate` / `benchmarkGap` |
| `src/agent.js` | 步骤 10（策略师）生成 `benchmarkGap`，仅 enterprise |
| `src/entitlements/tiers.js` | `applyTier` 对非 enterprise 隐藏 `benchmarkGap` |
| `test/workers-benchmark.test.js` | 4 项基准单测 |

## 升级路径

1. **v1.3.0（当前）**：等权组合 MRS 相对基准，单标的差距报告。
2. **v1.4（规划）**：接入标普500 / 纳斯达克100 指数，做绝对基准对比（alpha vs SPY/QQQ）。
3. **v1.5（规划）**：按 regime 分组的市场差距（高波/低波下分别跑赢多少），与 `arena.byRegime` 对齐。

详见 [ALGORITHM.md](./ALGORITHM.md) 的算法晋级路线。
