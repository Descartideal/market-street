'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Market}=require('../engine-v2.cjs'),{policy}=require('../npc-finance.cjs'),matching=require('../parallel-match.cjs'),{cpuRisk}=require('../risk-model.cjs');
function accountTotals(m){return m.stocks.map((_,i)=>m.people.reduce((sum,a)=>sum+a.shares[i],0));}
(async()=>{
 const m=new Market({count:50,seed:42});for(const value of [0,101,1.5,NaN])assert.equal(m.setLeverage(value).ok,false);
 assert.equal(m.setLeverage(100).ok,true);assert.equal(m.margin().maintenance,.0075);assert.ok(Math.abs(m.margin().recovery-.009)<1e-12);
 assert.equal(m.borrow(990000).ok,true);assert.equal(m.equity(m.player),10000);assert.equal(m.borrow(.01).ok,false);assert.equal(m.setLeverage(3).ok,false);
 m.checkMargin();assert.equal(m.player.liquidating,false);assert.equal(m.player.debt,990000);
 // Fully invested 100x position: a 0.3% loss breaches maintenance; no fabricated fill.
 m.orders=[];m.player.cash=0;m.player.shares=[10000,0,0,0,0];m.stocks[0].price=99.7;m.checkMargin();assert.equal(m.player.liquidating,true);assert.equal(m.player.shares[0],10000);
 m.people[0].cash=1e6;m.place(0,0,'buy',10000,99.7,30);m.checkMargin();assert.equal(m.player.liquidating,false);assert.ok(m.margin().ratio>=m.margin().recovery);assert.ok(m.player.shares[0]>0&&m.player.debt>0);
 for(const type of [5,6,7]){const input={type,risk:.8,signal:.04,volatility:.002,probUp:.9,cashRate:.0001};const cheap=policy({...input,loanRate:.0001}),expensive=policy({...input,loanRate:.02});assert.ok(cheap.qualified&&cheap.target>1);assert.equal(expensive.qualified,false);assert.equal(expensive.target,1);assert.ok(expensive.cost>cheap.cost);assert.equal(policy({...input,signal:-.03,loanRate:0}).qualified,false);}
 // Real decision test: expensive finance suppresses loans, including wait branches.
 for(const loanRate of [0,.02]){const market=new Market({count:50,seed:42,loanRate});market.orders=[];const a=market.agents.find(a=>a.type===5);Object.assign(a,{cash:0,shares:[0,1000,0,0,0],focus:0,knownSymbols:[0],usesLoans:true,loanPreference:1});market.random=()=>.1;market.stocks[0].fair=104;market.riskResults=new Float64Array(100).fill(.9);market.decide(a);assert.equal(a.debt>0,loanRate===0);if(a.debt){market.cancelAll(a.id);a.cash=a.debt;market.random=()=>.99;market.decide(a);assert.equal(a.debt,0);}}
 // Compare each worker plan with the independent immediate order matcher, including self-crosses.
 const fifo=new Market({count:50,seed:17});fifo.orders=[];for(const a of fifo.people){a.cash=1e8;a.shares.fill(100000);}
 for(let stock=0;stock<5;stock++){
  for(let n=0;n<20;n++)fifo.place(n%7,stock,n%2?'sell':'buy',1+n%5,n%2?105:95,100);
  const resting=fifo.orders.filter(o=>o.stock===stock).map(o=>({...o})),incoming=[],start=(fifo.tradeArchive||[]).length;
  for(let n=0;n<100;n++){const result=fifo.place(n%11,stock,n%2?'buy':'sell',1+n%9,90+n%21,100);assert.ok(result.ok);incoming.push({...result.order,qty:result.order.original});}
  const expected=fifo.tradeArchive.slice(start).map(t=>({buyer:t.buyer,seller:t.seller,price:t.price,qty:t.qty}));const owners=new Map([...resting,...incoming].map(o=>[o.id,o.owner]));
  const planned=matching.plan({resting,incoming});assert.deepEqual(planned.map(t=>({buyer:owners.get(t.buy),seller:owners.get(t.sell),price:t.price,qty:t.qty})),expected);
 }
 const reserved=new Market({count:50,seed:42});reserved.orders=[];const actor=reserved.agents[0];actor.cash=100;actor.shares.fill(0);reserved.decide=()=>{assert.ok(reserved.place(actor.id,0,'buy',1,80).ok);assert.equal(reserved.place(actor.id,1,'buy',1,80).ok,false);};
 const reserving=reserved.runBatchAsync([actor],'normal');assert.equal(reserved.availableCash(actor.id),20);await assert.rejects(()=>reserved.runBatchAsync([],'normal'),/撮合批次重叠/);await reserving;assert.equal(reserved.reservedCash(actor.id),80);
 const snapshotBook=new Market({count:50,seed:42});snapshotBook.orders=[];snapshotBook.people[0].shares[0]=10;snapshotBook.place(0,0,'sell',10,101,30);snapshotBook.shuffle=a=>a;snapshotBook.decide=a=>{if(a.id===0){snapshotBook.cancelAll(0);assert.equal(snapshotBook.availableShares(0,0),10);}else{assert.equal(snapshotBook.orderIndex.best(0,'sell',1).price,101);snapshotBook.place(1,0,'buy',1,102,30);}};await snapshotBook.runBatchAsync(snapshotBook.agents.slice(0,2),'normal');assert.equal(snapshotBook.orders.length,1);assert.equal(snapshotBook.orders[0].side,'buy');assert.equal(snapshotBook.lastTrades,0);
 const originalParallel=matching.parallel;matching.parallel=async()=>{throw new Error('controlled-worker-failure');};try{await reserved.runBatchAsync([],'normal');assert.equal(reserved.performance.matchBackend,'CPU 单线程回退');assert.equal(reserved.performance.matchFallback,'controlled-worker-failure');assert.deepEqual(reserved.performance.matchThreads,[]);}finally{matching.parallel=originalParallel;}
 const serial=new Market({count:5000,seed:42}),parallel=new Market({count:5000,seed:42}),shares=accountTotals(parallel);
 for(let tick=0;tick<8;tick++){
  serial.step();parallel.beginTick(true);parallel.riskResults=cpuRisk(parallel.riskInputs());await parallel.runSpeedAsync();await parallel.finishTickAsync();
  assert.deepEqual(parallel.orders,serial.orders);assert.deepEqual(parallel.tradeArchive,serial.tradeArchive);assert.deepEqual(parallel.stocks.map(s=>s.price),serial.stocks.map(s=>s.price));
  for(let i=0;i<parallel.people.length;i++){const a=parallel.people[i],b=serial.people[i];assert.equal(a.cash,b.cash);assert.equal(a.debt,b.debt);assert.deepEqual(a.shares,b.shares);assert.ok(parallel.reservedCash(i)<=a.cash+1e-6);assert.ok(a.cash>=-1e-6);for(let j=0;j<5;j++)assert.ok(parallel.reservedShares(i,j)<=a.shares[j]);}
  assert.deepEqual(accountTotals(parallel),shares);assert.ok(Math.abs(parallel.people.reduce((s,a)=>s+a.cash,0)+parallel.bankCash-parallel.initialCash-parallel.minted)<.001);
  assert.equal(new Set(parallel.performance.matchThreads).size,5);for(const a of parallel.speedAgents){const rows=parallel.actionSequence.filter(r=>r.id===a.id);assert.deepEqual(rows.map(r=>r.phase),['speed','normal']);}
 }
 // Force sufficient workload on every stock and measure overlap on the local CPU.
 const tasks=Array.from({length:5},(_,stock)=>({count:20000,resting:Array.from({length:12000},(_,id)=>({id:id+1,owner:id,stock,side:id%2?'sell':'buy',price:id%2?101:99,qty:10,expires:100})),incoming:Array.from({length:4000},(_,i)=>({id:12001+i,owner:12000+i,stock,side:i%2?'buy':'sell',price:i%2?102:98,qty:10,expires:100}))}));
 const start=performance.now(),results=await matching.parallel(tasks),wallMs=performance.now()-start;const intervals=results.map(r=>({threadId:r.threadId,start:r.start,end:r.end}));let overlaps=0;for(let i=0;i<5;i++)for(let j=i+1;j<5;j++)if(Math.max(intervals[i].start,intervals[j].start)<Math.min(intervals[i].end,intervals[j].end))overlaps++;
 assert.ok(overlaps>0,'Actual worker execution must overlap');const cpuStart=performance.now();const cpuPlans=tasks.map(matching.plan),serialMs=performance.now()-cpuStart;for(let i=0;i<5;i++)assert.deepEqual(results[i].fills,cpuPlans[i]);
 const report={date:new Date().toISOString(),node:process.version,workerCount:5,wallMs,serialMs,speedup:serialMs/wallMs,overlappingPairs:overlaps,intervals,fills:results.map(r=>r.fills.length),equivalenceTicks:8,equivalenceTraders:5000};fs.writeFileSync(path.join(__dirname,'parallel-benchmark-results.json'),JSON.stringify(report,null,2)+'\n');console.log('100x margin, rate-sensitive borrowing, 2 speed slots, conservation and real concurrent matching passed.',JSON.stringify(report));
})().catch(error=>{console.error(error);process.exitCode=1;});
