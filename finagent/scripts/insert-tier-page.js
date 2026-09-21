const fs=require('fs');
const p='public/index.html';
let s=fs.readFileSync(p,'utf8');
const anchor='    <section id="page-ops" class="page">';
const i=s.indexOf(anchor);
if(i<0){console.error('anchor not found');process.exit(1);}
const insert='    <section id="page-tier" class="page">\n      <div class="panel">\n        <h2>会员等级 · 功能开放矩阵</h2>\n        <div id="tierMatrix" class="tier-matrix"></div>\n        <h3 style="margin-top:18px;font-size:14px">当前等级详情</h3>\n        <div id="tierDetail" class="tier-detail"></div>\n      </div>\n    </section>\n\n';
if(s.includes('id="page-tier"')){console.log('already inserted');process.exit(0);}
s=s.slice(0,i)+insert+s.slice(i);
fs.writeFileSync(p,s);
console.log('ok, new length',s.length);
