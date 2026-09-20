'use strict';

// 三端共享的 Node 客户端：外部应用 / 脚本 / CLI 都通过它消费 FinAgent 数据，
// 与 Web 控制台、开放 API 使用同一套 store + engines + 契约，保证语义一致。
const agent = require('../agent');
const db = require('../store/db');
const contract = require('../shared/contract');

class FinAgentClient {
  constructor({ version = 'full' } = {}) {
    this.version = version === 'lite' ? 'lite' : 'full';
  }
  // 触发 采集 + 分析 + 预测 + 命中 + 自我升级
  async run(tickers) {
    return agent.runAgent(this.version, { tickers }, () => {});
  }
  // 单个 ticker 的契约快照
  async snapshot(ticker) {
    const s = agent.getSnapshot(this.version, ticker);
    return { snapshot: s, contractErrors: contract.validateSnapshot(s) };
  }
  // 全部 ticker
  async all() {
    return contract.sharedAll(this.version);
  }
  // 模型竞技场 + 推理
  async arena(ticker) {
    const s = agent.getSnapshot('full', ticker);
    return s ? { arena: s.modelArena, inHouse: s.inHouse, reasoning: s.reasoning } : null;
  }
  // 命中回测（含历史 dry-run）
  async backtest(ticker) {
    return db.loadBacktestReport(ticker + '_bt');
  }
}

module.exports = { FinAgentClient, contract };
