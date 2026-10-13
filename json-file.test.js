const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../server');
async function start(dataDir) {
  const app=createApp({dataDir});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  return {...app,async req(route,body,headers={}){
    const res=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:res.status,data:await res.json()};
  },close:()=>new Promise(resolve=>app.server.close(resolve))};
}
test('records and generated password persist through a real server restart; API index aliases resolve',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'surrender-json-restart-'));
  let app=await start(dir);
  const password=fs.readFileSync(app.secretFile,'utf8');
  const device={'X-Device-Key':'d'.repeat(64)};
  try {
    for(const route of ['/api','/api/','/api/index','/api/index.js','/api/health']) {
      const health=await app.req(route);assert.equal(health.status,200);assert.equal(health.data.storage,'json-file');
      assert.ok(health.data.studentUrls.every(url=>!url.includes('127.0.0.1')&&!url.includes('localhost')));
    }
    const record={id:'restart-record-001',name:'Restart Student',section:'Cirrus',active:true,surrenderedAt:new Date().toISOString()};
    assert.equal((await app.req('/api/records',record,device)).status,200);
    assert.equal(JSON.parse(fs.readFileSync(app.dataFile,'utf8'))[0].id,record.id);
    await app.close();app=await start(dir);
    assert.equal(fs.readFileSync(app.secretFile,'utf8'),password);
    const login=await app.req('/api/login',{password});assert.equal(login.status,200);
    const records=await app.req('/api/records',undefined,{Authorization:'Bearer '+login.data.token});
    assert.equal(records.data.length,1);assert.equal(records.data[0].name,'Restart Student');
    assert.equal((await app.req('/data/records.json')).status,404);
    assert.equal((await app.req('/data/teacher-access.txt')).status,404);
    assert.equal((await app.req('/api/my-records',undefined,device)).data[0].id,record.id);
  } finally {await app.close();}
});
test('simultaneous check-ins from 20 phones do not overwrite each other in the JSON file',async()=>{
  const app=await start(fs.mkdtempSync(path.join(os.tmpdir(),'surrender-json-concurrent-')));
  try {
    const replies=await Promise.all(Array.from({length:20},(_,i)=>app.req('/api/records',{
      id:'simultaneous-record-'+i,name:'Test Student '+i,section:i%2?'Alto':'Cirrus',active:true,surrenderedAt:new Date().toISOString()
    },{'X-Device-Key':i.toString(16).padStart(64,'0')})));
    assert.ok(replies.every(reply=>reply.status===200));
    const disk=JSON.parse(fs.readFileSync(app.dataFile,'utf8'));
    assert.equal(disk.length,20);assert.equal(new Set(disk.map(r=>r.id)).size,20);
  } finally {await app.close();}
});
test('invalid JSON shapes and return timestamps cannot change an existing record',async()=>{
  const app=await start(fs.mkdtempSync(path.join(os.tmpdir(),'surrender-json-invalid-')));
  try {
    const device={'X-Device-Key':'c'.repeat(64)};
    for(const body of [null,[],false,'text']) assert.equal((await app.req('/api/records',body,device)).status,400);
    const record={id:'unchanged-record-001',name:'Student',section:'Cirrus',active:true,surrenderedAt:new Date().toISOString()};
    await app.req('/api/records',record,device);
    const earlier=new Date(Date.now()-60000).toISOString();
    const result=await app.req('/api/records',{...record,surrenderedAt:earlier,active:false,returnedAt:earlier},device);
    assert.equal(result.status,400);
    assert.equal((await app.req('/api/my-records',undefined,device)).data[0].active,true);
  } finally {await app.close();}
});
