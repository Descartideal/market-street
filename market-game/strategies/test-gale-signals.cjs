const assert=require('node:assert/strict'),path=require('node:path');
const {GameSession}=require('../controller.cjs');
(async()=>{
 const c=new GameSession('signal-control-compile',{count:50,seed:1});await c.bot.compile({sourcePath:path.resolve(__dirname,'../../疾风量化.cpp')});
 const make=()=>{const s=new GameSession('signal-controls',{count:50,seed:111});s.bot.executable=c.bot.executable;s.bot.enabled=true;s.market.beginTick();s.market.orders=[];return s;};
 const run=async s=>{const r=await s.bot.run(s.market.tick,(method,args)=>s.rpc(method,args));assert.equal(r.code,0,r.output);assert.ok(!r.error,r.error);return r;};
 const neutral=make();await run(neutral);assert.equal(neutral.market.player.debt,0);assert.equal(neutral.market.player.leverageLimit,1);
 const oldDebt=make();oldDebt.market.setLeverage(3);oldDebt.market.borrow(15000);await run(oldDebt);assert.equal(oldDebt.market.player.debt,0);
 const dust=make();dust.market.setLeverage(3);dust.market.borrow(1234.56);dust.market.finishTick();dust.market.beginTick();await run(dust);assert.equal(dust.market.player.debt,0,'Capitalized fractional-cent interest is fully repaid');
 const circuit=make();circuit.memory.set('gale.signal.v2',{peak:20000});await run(circuit);assert.equal(circuit.market.orders.length,0);assert.equal(circuit.market.player.debt,0);assert.equal(circuit.memory.get('gale.signal.v2').cool,13);await run(circuit);assert.equal(circuit.market.orders.length,0);
 const forced=make();forced.market.player.liquidating=true;await run(forced);assert.equal(forced.market.player.debt,0);assert.equal(forced.market.orders.length,0);
 const strong=make(),m=strong.market,s=m.stocks[0];
 // Controlled positive trend, accurate walk-forward forecasts, visible bargain asks,
 // and insufficient own cash. This is a branch test, not a simulated return claim.
 s.candles=Array.from({length:65},(_,k)=>{const close=100*Math.exp(k*.0025);return {tick:k,open:close,high:close,low:close,close,volume:100,turnover:close*100,trades:10,vwap:close,complete:true};});s.price=s.candles.at(-1).close;s.previous=s.price;s.publicValue=s.price;s.history=s.candles.map(c=>c.close);delete s.technicalCache;
 m.player.cash=100;m.player.shares[4]=125;m.people[0].shares[0]=2000;m.people[0].cash=100000;m.people[1].cash=100000;
 m.place(0,0,'buy',1000,99,30);m.place(0,0,'sell',500,100,30);m.place(1,4,'buy',1000,80,30);m.event('A 行业利好','公开测试消息');
 const r=await run(strong);assert.ok(r.output.includes('confirmed bullish'),r.output);assert.ok(m.player.debt>1000,r.output);assert.ok(m.player.shares[0]>0);assert.ok(m.player.cash<10,'No idle borrowed cash');assert.equal(m.orders.filter(o=>o.owner===m.playerId&&o.stock===0&&o.side==='buy').length,0,'No unfilled financed order');assert.ok(m.player.debt<1.6*m.equity(m.player)+1);
 m.event('A 行业利空','使原先看涨条件失效');await run(strong);assert.equal(m.player.debt,0,'Signal lost: deleverage and repay');
 const empty=make();Object.assign(empty.market.stocks[0],{candles:structuredClone(s.candles),price:120,publicValue:120,technicalCache:null});empty.market.event('A 行业利好','无流动性');await run(empty);assert.equal(empty.market.player.debt,0,'No counterparty: no loan');
 const api=make();const results=await api.bot.run(api.market.tick,(method,args)=>api.rpc(method,args));assert.equal(results.code,0);
 console.log('Actual C++: no-signal/no-liquidity abstention, old-debt repayment, circuit/cooldown, conditional funding, no idle loans and signal-loss exit passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
