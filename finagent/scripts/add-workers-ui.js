'use strict';
const fs=require('fs');
const p='public/js/app.js';
let s=fs.readFileSync(p,'utf8');
if(s.includes('function renderWorkersPage')){console.log('already present');process.exit(0);}

// 1) loadAll：workers page 激活时渲染
s=s.replace(
  "  if (document.getElementById('page-tier').classList.contains('active')) renderTierPage();",
  "  if (document.getElementById('page-tier').classList.contains('active')) renderTierPage();\n  if (document.getElementById('page-workers').classList.contains('active')) renderWorkersPage();"
);

// 2) applyTierUI：strategist / benchmark 仅 enterprise 可见（workers tab 全员可见，但策略师行在非 enterprise 锁定）
// 在 applyTierUI 末尾（evolutionNote 之后）插入 workers 门控
const marker="  const evoNote = document.getElementById('evolutionNote');\n  if (evoNote) evoNote.textContent = evoLimit === Infinity ? '全部事件（流式）' : ('最近 ' + evoLimit + ' 条（升级解锁更多）');";
if(!s.includes(marker)){console.error('evoNote marker not found');process.exit(1);}
s=s.replace(marker, marker + "\n\n  // 数字员工 tab：全员可见，但策略师/基准对标 仅 enterprise 开放（与 regime 同级）\n  const workersTab = document.querySelector('.nav-item[data-page=\"workers\"]');\n  if (workersTab) workersTab.style.display = '';\n  if (!f.regimeAware) {\n    // 非 enterprise：基准对标 panel 默认隐藏（renderWorkersPage 内再判一次）\n    const benchPanel = document.getElementById('benchPanel');\n    if (benchPanel) benchPanel.hidden = true;\n  }");

// 3) 在 renderTierPage 之后插入 renderWorkersPage + renderBenchmark
const tierEnd="function renderDashboard(data) {";
if(!s.includes(tierEnd)){console.error('renderDashboard not found');process.exit(1);}
const workersFn=`
async function renderWorkersPage() {
  // 拉当前版本的全量快照，聚合所有标的的 workerReport
  const data = await api('/tickers/all?version=' + version);
  const recs = (data && data.records) || [];
  const body = document.getElementById('workersBody');
  if (!body) return;

  if (!recs.length) {
    body.innerHTML = '<div class="chip">暂无数字员工岗位报告（先运行采集）</div>';
    return;
  }
  // 取第一个标的的 workerReport 作为“团队花名册”（各标的 roster 相同，仅 produced 不同）
  const rec = recs.find((x) => x.workerReport) || recs[0];
  const wr = rec.workerReport;
  if (!wr) {
    body.innerHTML = '<div class="chip">当前版本未生成岗位报告（需完整版 + 数字员工编排）</div>';
    return;
  }

  const rows = wr.rows.map((r) => {
    const statusCls = r.status === 'ok' ? 'good' : r.status === 'locked' ? 'bad' : r.status === 'idle' ? 'warn' : '';
    return '<div class="worker-row">' +
      '<span class="tag ' + statusCls + '">' + r.title + '</span>' +
      '<strong>' + r.key + '</strong>' +
      '<span class="chip">' + (r.produced || '-') + '</span>' +
      '<span class="chip" style="margin-left:auto">' + r.status + '</span>' +
      '</div>';
  }).join('');

  body.innerHTML =
    '<div class="kv" style="margin-bottom:12px">' +
    '<div><div class="k">会员等级</div><div class="v">' + wr.tier + '</div></div>' +
    '<div><div class="k">在岗人数</div><div class="v">' + wr.headcount + '</div></div>' +
    '<div><div class="k">在岗名单</div><div class="v" style="font-size:12px">' + wr.roster.join(' / ') + '</div></div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:8px">' + rows + '</div>';

  // 基准对标 panel（仅 enterprise）
  const bench = wr.benchmark;
  const benchPanel = document.getElementById('benchPanel');
  const benchBody = document.getElementById('benchBody');
  if (benchPanel && benchBody) {
    if (bench && bench.available) {
      benchPanel.hidden = false;
      const su = bench.summary;
      const verdictCls = su.verdict === 'outperforming' ? 'good' : su.verdict === 'underperforming' ? 'bad' : 'warn';
      benchBody.innerHTML =
        '<div class="kv" style="margin-bottom:12px">' +
        '<div><div class="k">基准</div><div class="v" style="font-size:13px">' + bench.benchmark + '</div></div>' +
        '<div><div class="k">模型</div><div class="v">' + bench.modelKey + '</div></div>' +
        '<div><div class="k">窗口</div><div class="v">' + bench.horizonDays + 'd</div></div>' +
        '<div><div class="k">结论</div><div class="v"><span class="tag ' + verdictCls + '">' + su.verdict + '</span></div></div>' +
        '</div>' +
        '<div class="thought" style="margin-bottom:12px"><strong>策略师结论：</strong><br>' + bench.gapNote + '</div>' +
        '<div class="kv">' +
        '<div><div class="k">平均超额收益</div><div class="v ' + (su.avgOutperformancePct > 0 ? 'good' : su.avgOutperformancePct < 0 ? 'bad' : '') + '">' +
          (su.avgOutperformancePct > 0 ? '+' : '') + su.avgOutperformancePct + '%</div></div>' +
        '<div><div class="k">模型平均命中率</div><div class="v">' + su.avgModelHitRate + '%</div></div>' +
        '<div><div class="k">跑赢组合</div><div class="v good">' + su.winners + '</div></div>' +
        '<div><div class="k">跑输组合</div><div class="v bad">' + su.losers + '</div></div>' +
        '</div>' +
        '<div style="margin-top:14px"><h3 style="font-size:13px;margin-bottom:8px">逐标的对标明细</h3><div style="display:flex;flex-direction:column;gap:6px">' +
        bench.perTicker.map((t) =>
          '<div class="worker-row">' +
          '<strong>' + t.ticker + '</strong>' +
          '<span class="chip">MRS ' + (t.mrsRetPct == null ? '-' : t.mrsRetPct + '%') + '</span>' +
          '<span class="chip">超额 ' + (t.outperformancePct > 0 ? '+' : '') + t.outperformancePct + '%</span>' +
          '<span class="chip">模型命中 ' + t.modelHitRate + '%</span>' +
          '<span class="chip">' + (t.regime || 'n/a') + '</span>' +
          '</div>'
        ).join('') +
        '</div></div>';
    } else {
      benchPanel.hidden = true;
    }
  }
}

`;
s=s.replace('function renderDashboard(data) {', workersFn + 'function renderDashboard(data) {');

fs.writeFileSync(p,s);
console.log('app.js updated with workers UI');
