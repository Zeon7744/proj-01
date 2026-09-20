# 生产安全加固清单

FinAgent 默认“开箱即用”（本地无 key 降级 admin）方便演示；对外发布前按下面清单加固。

## 1. 密钥强约束（必做）

```bash
# 生成随机 admin 密钥
export FINAGENT_ADMIN_KEY="$(openssl rand -hex 16)"
# 关闭“无 key 降级 admin”
export FINAGENT_LOCAL_OPEN=0
# 开启严格模式：必须提供 key
export FINAGENT_STRICT_KEYS=1
```

效果：无 key 请求直接 `401 API key required (strict mode)`。为不同“应用”签发独立 key：`POST /api/keys/analyst` 等。

## 2. 限流（已内置）

`/api` 默认 60s/120 请求（按 key/IP 固定窗口），超限返回 `429` + `Retry-After`。
调整：`export FINAGENT_RATE_MAX=300`。

## 3. 审计日志（已内置）

所有 `/api` 请求写入 `logs/finagent-YYYY-MM-DD.log`（谁/角色/方法/路径/状态码），按天保留 14 天。

## 4. 数据与密钥落地

- 把 `data/` 指向对象存储 / 数据库；`FINAGENT_DATA_DIR`。
- 密钥放 KMS / 环境变量，勿写入代码库；`.env` 已被 `.gitignore` 忽略。
- 多租户：扩展 `src/auth/rbac.js` 的 `ACCOUNTS` 与中间件。

## 5. 部署与守护

- `npm run serve:daemon` 后台运行（PID 文件 `.finagent.pid`），`npm run serve:stop` 停止。
- `FINAGENT_AUTOSTART_JOBS=1 npm start` 随服务自启定时任务（数据刷新 / 日志清理 / 命中巡检）。
- 反向代理（nginx/caddy）加 TLS；生产暴露 443。

## 6. 合规

- 金融数据受交易所条款约束，商用遵守数据源许可。
- 预测/命中为研究性输出，**非投资建议**，UI 与文档保留该声明。
