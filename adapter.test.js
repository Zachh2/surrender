'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {config,createDatabase}=require('../lib/database');
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_TEST_ONLY',TEACHER_PASSWORD:'test-only-password'};
test('configuration rejects missing values, public keys, and unsafe URLs without disclosing secrets',()=>{
  assert.throws(()=>config({}),/Server setup incomplete/);
  for(const value of ['http://test.supabase.co','https://test.supabase.co/rest','https://user:password@test.supabase.co']) assert.throws(()=>config({...env,SUPABASE_URL:value}),/SUPABASE_URL/);
  assert.throws(()=>config({...env,SUPABASE_SECRET_KEY:'sb_publishable_test'}),/secret key/);
  assert.throws(()=>config({...env,TEACHER_PASSWORD:'short'}),/12–100/);
  assert.equal(config(env).url,env.SUPABASE_URL);
});
test('modern secret key uses apikey; legacy service_role key also uses Bearer',async()=>{
  for(const key of ['sb_secret_TEST_ONLY','eyJtestLegacy']) {
    const db=createDatabase({...config(env),key},async(url,options)=>{
      assert.equal(url,'https://test.supabase.co/rest/v1/rpc/surrender_rpc');
      assert.equal(options.headers.apikey,key);
      assert.equal(options.headers.Authorization,key.startsWith('eyJ')?'Bearer '+key:undefined);
      assert.deepEqual(JSON.parse(options.body),{p_action:'health',p_args:{}});
      assert.equal(options.redirect,'error');
      return Response.json({ok:true});
    });
    assert.equal((await db('health')).ok,true);
  }
});
test('database outage, missing SQL and credential failures produce actionable errors without raw responses',async()=>{
  for(const status of [401,403,404,500]) {
    const db=createDatabase(config(env),async()=>Response.json({error:'SECRET DATABASE DETAILS'},{status}));
    await assert.rejects(db('health'),error=>error.status===503 && !error.message.includes('SECRET DATABASE DETAILS') && !error.message.includes(env.SUPABASE_SECRET_KEY));
  }
  const network=createDatabase(config(env),async()=>{throw new Error('SECRET DETAILS');});
  await assert.rejects(network('health'),error=>error.status===503 && !error.message.includes('SECRET'));
  const denied=createDatabase(config(env),async()=>Response.json({error:'Teacher sign-in required.',status:401}));
  await assert.rejects(denied('teacher_records'),error=>error.status===401);
});
