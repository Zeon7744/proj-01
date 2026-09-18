# 项目 01 - 任务管理系统

一个简洁的全栈任务管理应用，基于 Node.js + Express + 原生 HTML/CSS/JS。

## 功能

- 任务 CRUD：新建、编辑、删除任务
- 状态管理：待办 / 进行中 / 已完成
- 优先级标记：低 / 中 / 高
- 截止日期与逾期提示
- 搜索与状态筛选
- 数据持久化到本地 JSON 文件（`data/records.json`）

## 快速开始

```bash
npm install
npm start
```

打开浏览器访问 http://localhost:3000

## 项目结构

```
├── server.js          # Express 后端（REST API + 静态文件服务）
├── package.json
├── .gitignore
├── public/
│   ├── index.html     # 单页前端
│   ├── style.css      # 样式
│   └── app.js         # 前端逻辑
└── data/
    └── records.json   # 数据文件（运行时自动生成，已 gitignore）
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/records | 列出所有任务 |
| POST | /api/records | 新建任务 |
| PUT | /api/records/:id | 更新任务 |
| DELETE | /api/records/:id | 删除任务 |
