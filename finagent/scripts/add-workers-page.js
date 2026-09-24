'use strict';
const fs=require('fs');
const p='public/index.html';
let s=fs.readFileSync(p,'utf8');
if(s.includes('id="page-workers"')){console.log('already present');process.exit(0);}

// 1) 在 page-ops 之前插入 page-workers
const anchor='<section id="page-ops" class="page">';
const i=s.indexOf(anchor);
if(i<0){console.error('ops anchor not found');process.exit(1);}
const insert=[
'<section id="page-workers" class="page">',
'      <div class="panel">',
'        <h2>数字员工 · 精准分工</h2>',
'        <div id="workersBody" style="display:flex;flex-direction:column;gap:10px"></div>',
'      </div>',
'      <div class="panel" id="benchPanel" hidden>',
'        <h2>市场基准对标（策略师）</h2>',
'        <div id="benchBody"></div>',
'      </div>',
'    </section>',
'',
].join('\n');
s=s.slice(0,i)+insert+s.slice(i);

// 2) nav：在 会员等级 按钮后加 数字员工
const navAnchor='<button class="nav-item" data-page="tier">会员等级</button>';
const j=s.indexOf(navAnchor);
if(j>=0){
  s=s.slice(0,j+navAnchor.length)+navAnchor+'\n      <button class="nav-item" data-page="workers">数字员工</button>'+s.slice(j+navAnchor.length);
}else{
  console.log('warn: nav tier button not found, workers nav not added');
}

fs.writeFileSync(p,s);
console.log('index.html updated with workers page');
