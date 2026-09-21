'use strict';
const app=require('../server.js');
const http=require('http');
const s=app.listen(0,async()=>{
  const port=s.address().port;
  async function get(path,key){
    return await new Promise((resolve,reject)=>{
      const req=http.get({host:'127.0.0.1',port,path,headers:key?{Authorization:'Bearer '+key}:{}},(res)=>{
        let b='';res.on('data',d=>b+=d);res.on('end',()=>resolve({status:res.status,body:b}));
      });
      req.on('error',reject);
    });
  }
  (async()=>{
    const keys=[['viewer','fa_viewer_1c9d'],['analyst','fa_analyst_7f3a'],['admin','fa_admin']];
    const paths=['/api/tier','/api/tickers/all?version=full','/api/predictions','/api/evolution','/api/arena/AAPL'];
    for(const [label,key] of keys){
      const out=[];
      for(const p of paths){
        const r=await get(p,key);
        out.push((p.replace('/api','')+'='+r.status).padEnd(30));
      }
      console.log(label.padEnd(8)+'  '+out.join('  '));
    }
    s.close();
  })();
});
