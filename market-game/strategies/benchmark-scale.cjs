'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{GameSession}=require('../controller.cjs'),{gpu}=require('../gpu-risk.cjs'),{cpuRisk}=require('../risk-model.cjs');
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
(async()=>{
 const hardware=await gpu.start();assert.ok(hardware.available&&hardware.discrete,'A real discrete CUDA GPU is required by this benchmark');
 const report={date:new Date().toISOString(),hardware:{backend:hardware.backend,device:hardware.device,discrete:hardware.discrete,memoryMB:hardware.memoryMB,computeCapability:hardware.computeCapability},seed:42,samples:8,warmup:2,old5000FirstTickMs:1406.3843,results:[]};
 for(const count of [5000,100000]){
  const cpu=new GameSession('bench-cpu',{count,seed:42,acceleration:'cpu'}),cuda=new GameSession('bench-cuda',{count,seed:42,acceleration:'gpu'});
  const input=cpu.market.riskInputs(),t=performance.now(),reference=cpuRisk(input),cpuRiskMs=performance.now()-t,output=await gpu.compute(input,'gpu');let maxError=0;for(let i=0;i<reference.length;i++)maxError=Math.max(maxError,Math.abs(reference[i]-output.values[i]));assert.ok(maxError<1e-12);
  const rows={count,cpuRiskMs,cudaRiskTransferMs:output.ms,cudaKernelMs:output.kernelMs,maxError,cpu:[],cuda:[],cpuWall:[],cudaWall:[],stateBytes:0};
  for(let k=0;k<10;k++){
   for(const [name,s]of k%2?[['cuda',cuda],['cpu',cpu]]:[['cpu',cpu],['cuda',cuda]]){const start=performance.now(),r=await s.step(false),wall=performance.now()-start;if(k>=2){rows[name].push(s.market.performance.tickMs);rows[name+'Wall'].push(wall);}rows.stateBytes=Buffer.byteLength(JSON.stringify(r.state));}
   assert.deepEqual(cpu.market.stocks.map(s=>s.price),cuda.market.stocks.map(s=>s.price));assert.deepEqual(cpu.market.orders,cuda.market.orders);
   for(let i=0;i<count;i++){assert.ok(Math.abs(cpu.market.people[i].cash-cuda.market.people[i].cash)<1e-8);assert.deepEqual(cpu.market.people[i].shares,cuda.market.people[i].shares);}
  }
  rows.cpuMedianMs=median(rows.cpu);rows.cudaMedianMs=median(rows.cuda);rows.cpuWallMedianMs=median(rows.cpuWall);rows.cudaWallMedianMs=median(rows.cudaWall);rows.speedup=rows.cpuMedianMs/rows.cudaMedianMs;report.results.push(rows);console.log(JSON.stringify(rows));
 }
 const outputPath=path.join(__dirname,'scale-benchmark-results.json');fs.writeFileSync(outputPath,JSON.stringify(report,null,2)+'\n');console.log('Discrete GPU verified; CPU/CUDA books, holdings and prices agree. Report: '+outputPath);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>gpu.close());
