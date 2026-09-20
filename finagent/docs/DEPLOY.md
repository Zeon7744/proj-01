# 部署与开�?API 指南

## 1. 本地运行

```bash
cd finagent
npm install
npm start
# 控制�?+ API: http://localhost:3001
```

## 2. 接入真实行情数据（可选）

```bash
cp .env.example .env
# 编辑 .env，填�?ALPHAVANTAGE_API_KEY
export ALPHAVANTAGE_API_KEY=xxxx   # 或在 .env 中配�?```

不配 key 时系统自动使用确定性模拟数据，功能（采集→分析→预测→命中→自我升级）仍完整可演示�?
## 3. 应用开放（多应用接入）

每个接入应用持有一�?API Key + 作用域（scope），用于权限隔离�?
```bash
# 为一个“应用”签发密钥（admin�?curl -X POST http://localhost:3001/api/keys/analyst \
  -H "Authorization: Bearer fa_admin" -H "Content-Type: application/json"
```

调用方：

```bash
# 读行�?/ 分析 / 预测
curl "http://localhost:3001/api/tickers/AAPL?version=full" \
  -H "Authorization: Bearer fa_analyst_7f3a"

# 触发采集 + 分析 + 预测 + 命中回测
curl -X POST http://localhost:3001/api/agent/run \
  -H "Authorization: Bearer fa_analyst_7f3a" -H "Content-Type: application/json" \
  -d '{"version":"full"}'
```

### 角色�?scope

| 角色 | 默认 key | 可用 scope |
| --- | --- | --- |
| viewer | fa_viewer_1c9d | read:data, read:analysis, read:predictions |
| analyst | fa_analyst_7f3a | �?+ write:collect, write:analyze |
| admin | fa_admin | * + manage:keys |

## 4. 生产环境加固

- 设置 `FINAGENT_ADMIN_KEY` 为随机值，弃用默认 `fa_admin`�?- 设置 `FINAGENT_LOCAL_OPEN=0`，关闭“无 key 降级 admin”�?- �?`data/` 指向对象存储或数据库；密钥改�?KMS / 环境变量而非代码�?- 鉴权已内置；如需多租户，扩展 `src/auth/rbac.js` �?ACCOUNTS 与中间件即可�?
## 5. 定时迭代（可选）

采集/分析是幂等的增量任务，可�?cron / GitHub Actions schedule 周期运行�?
```bash
# 每日 06:00 跑完整版
0 6 * * * cd /path/to/finagent && npm run collect:full >> /var/log/finagent.log 2>&1
```

每次运行都会：多源采�?�?自研高精度模�?�?命中回测（含历史 dry-run）→ 写回 adaptive 反馈 �?自我升级�?
