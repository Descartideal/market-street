'use strict';
const assert=require('node:assert/strict'),{GPU}=require('../gpu-risk.cjs'),{cpuRisk}=require('../risk-model.cjs');
(async()=>{
 const previous=process.env.MARKET_PYTHON;process.env.MARKET_PYTHON='__market_missing_python_for_test__';const g=new GPU();
 try{const status=await g.start();assert.equal(status.available,false);assert.equal(status.backend,'CPU');assert.ok(status.reason);const input=new Float64Array([.001,.01,.5,42]);const result=await g.compute(input,'auto');assert.equal(result.backend,'CPU');assert.deepEqual(result.values,cpuRisk(input));await assert.rejects(()=>g.compute(input,'gpu'));console.log('GPU failure: actual process launch failure is labelled CPU, automatic fallback works, forced GPU rejects.');}
 finally{g.close();if(previous===undefined)delete process.env.MARKET_PYTHON;else process.env.MARKET_PYTHON=previous;}
})().catch(e=>{console.error(e);process.exitCode=1;});
