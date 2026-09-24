# FinAgent · 会员等级（Entitlements）

在 RBAC 角色（操作权限）之上叠加**会员等级（功能开放 + 配额）**两个维度，二者正交：

- **角色**（viewer / analyst / admin）：决定能否做某类操作（`read:*` / `write:*` / `manage:*`）。
- **会员等级**（free / pro / enterprise）：决定开放哪些功能、多少 API 配额、多少密钥、多大回溯。

## 等级矩阵

| 功能 | free | pro | enterprise |
| --- | --- | --- | --- |
| 支持版本 | `lite` | `lite` + `full` | `lite` + `full` |
| 预测（多周期目标价 + 置信度） | ❌ | ✅ | ✅ |
| 命中回测（walk-forward + 历史 dry-run） | ❌ | ✅（基础） | ✅（含 regime 分组） |
| 模型竞技场（T1..T4 + baseline） | ❌ | ✅ | ✅（含 `byRegime`） |
| Regime 感知（T4 + 风险调整） | ❌ | ❌ | ✅ |
| 进化日志条数 | 最近 20 | 最近 200 | 全部（流式，上限 200/次） |
| API 限流（60s 窗口） | 60 | 300 | 1200 |
| 应用密钥配额 | 1 | 5 | 不限 |
| 数据回溯 | 365 天 | 3650 天 | 3650 天+ |
| 多源采集（yfinance / alpha_vantage） | ✅ | ✅ | ✅ |
| 自我升级（晋级 / 校准 / 竞技场胜出） | 仅 lite 部分 | ✅ | ✅（含 regime） |

## 内置演示账号映射

| 角色 | 默认 API Key | 会员等级 |
| --- | --- | --- |
| `viewer` | `fa_viewer_1c9d` | `free` |
| `analyst` | `fa_analyst_7f3a` | `pro` |
| `admin` | `fa_admin` | `enterprise` |

生产环境请用 `FINAGENT_ADMIN_KEY` / `FINAGENT_ANALYST_KEY` / `FINAGENT_VIEWER_KEY` 覆盖默认 key，并设 `FINAGENT_STRICT_KEYS=1` 关闭"无 key 降级 admin"。

## 升级路径

```
free ──────▶ pro ──────▶ enterprise
 │           │           │
 │           │           ├─ 解锁 regime 感知（T4 + 风险调整）
 │           │           ├─ 解锁 byRegime 竞技场分组
 │           │           ├─ 解锁全量进化日志（流式）
 │           │           ├─ API 配额 1200/min
 │           │           └─ 密钥配额不限
 │           │
 │           ├─ 解锁 完整版（10 年 · 2500 bar）
 │           ├─ 解锁 预测 + 命中回测
 │           ├─ 解锁 模型竞技场（T1..T4 + baseline）
 │           ├─ API 配额 300/min
 │           └─ 密钥配额 5
 │
 ├─ 仅简版（1 年 · 400 bar）
 ├─ 无预测 / 无命中 / 无竞技场
 ├─ API 配额 60/min
 └─ 密钥配额 1
```

## API 示例

### 1. 等级自省

```bash
curl -H "Authorization: Bearer fa_viewer_1c9d" http://localhost:3001/api/tier
```

响应（free）：

```json
{
  "tier": "free",
  "label": "免费",
  "role": "viewer",
  "features": {
    "versions": ["lite"],
    "predict": false,
    "hitBacktest": false,
    "regimeAware": false,
    "modelArena": false,
    "evolutionLimit": 20
  },
  "quotas": {
    "apiRate": 60,
    "keyQuota": 1,
    "lookbackDays": 365
  }
}
```

### 2. 功能门控（403 响应）

```bash
# free 用户访问 预测 端点 → 403 + upgradeTo 提示
curl -H "Authorization: Bearer fa_viewer_1c9d" http://localhost:3001/api/predictions
# {"error":"feature 'predict' not available for tier 'free'","upgradeTo":"pro"}

# free 用户访问 完整版快照 → 403 + upgradeTo 提示
curl -H "Authorization: Bearer fa_viewer_1c9d" "http://localhost:3001/api/tickers/all?version=full"
# {"error":"full version requires pro tier or above","upgradeTo":"pro"}

# pro 用户访问 regime 字段（applyTier 会隐藏，不报 403）
curl -H "Authorization: Bearer fa_analyst_7f3a" "http://localhost:3001/api/tickers/AAPL?version=full"
# 快照中 inHouse.regime / reasoning.regime / modelArena.byRegime 被置为 undefined
```

### 3. 限流按等级

```
X-RateLimit-Limit: 60        # free（viewer）
X-RateLimit-Limit: 300       # pro（analyst）
X-RateLimit-Limit: 1200      # enterprise（admin）
```

超限返回 `429` + `Retry-After` + `tierLimit`。

### 4. 快照字段收紧（applyTier）

| 字段 | free | pro | enterprise |
| --- | --- | --- | --- |
| `prediction` | 删除 | 保留 | 保留 |
| `backtest` | 删除 | 保留 | 保留 |
| `modelArena` | 删除 | 保留 | 保留 |
| `modelArena.byRegime` | 删除 | 删除 | 保留 |
| `inHouse.regime` | 删除 | 删除 | 保留 |
| `inHouse.factors.regime` | 删除 | 删除 | 保留 |
| `reasoning.regime` | 删除 | 删除 | 保留 |
| 其他（metrics / bars / source / 等） | 保留 | 保留 | 保留 |

## 代码位置

| 文件 | 职责 |
| --- | --- |
| `src/entitlements/tiers.js` | 等级矩阵（`TIER`）+ `tierOf` / `can` / `allowedVersions` / `applyTier` |
| `src/auth/rbac.js` | 鉴权（挂 `req.ctx.tier`）+ `requireFeature` 门控 |
| `src/ops/middleware.js` | `rateLimit(perIdentity)` 按等级动态配额 + `auditLog` |
| `server.js` | 中间件顺序：`auditLog → auth → rateLimit`；各端点按等级收紧 |
| `test/tiers.test.js` | 等级单元测试（8 项） |
| `scripts/tier-smoke.js` | 端到端等级冒烟（viewer/pro/admin 三组） |
| `public/js/app.js` | 前端等级门控 UI + 晋级时间线 |
| `public/css/tier.css` | 等级矩阵 / 时间线样式 |

## 安全注意

- 默认演示 key 仅供本地开箱即用；**生产务必**通过环境变量覆盖并开启严格模式。
- `applyTier` 在每次 API 响应前对快照做字段收紧，确保非 enterprise 用户永远看不到 regime / byRegime。
- `rateLimit` 的 `perIdentity` 必须在 `auth` 之后挂载（见 `server.js` 注释），否则读不到 `req.ctx.tier`，会全部 fallback 到 free 配额。
