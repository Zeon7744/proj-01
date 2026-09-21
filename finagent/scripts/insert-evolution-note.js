const fs=require('fs');
const p='public/index.html';
let s=fs.readFileSync(p,'utf8');
if(s.includes('id="evolutionNote"')){console.log('already has evolutionNote');process.exit(0);}
const anchor='<div id="evolutionBody" style="display:flex;flex-direction:column;gap:8px;max-height:600px;overflow:auto"></div>';
const i=s.indexOf(anchor);
if(i<0){console.error('anchor not found');process.exit(1);}
const insert=anchor+'\n        <div class="evolution-note" id="evolutionNote" style="font-size:12px;color:var(--muted);margin-top:6px"></div>';
s=s.slice(0,i)+insert+s.slice(i+anchor.length);
fs.writeFileSync(p,s);
console.log('inserted evolutionNote, new length', s.length);
