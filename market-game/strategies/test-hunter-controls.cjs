const assert=require('node:assert/strict'),path=require('node:path');
const {GameSession}=require('../controller.cjs');
(async()=>{
 const c=new GameSession('hunter-control-compile',{count:50,seed:1});await c.bot.compile({sourcePath:path.resolve(__dirname,'../../价差猎手.cpp')});
 const make=()=>{const s=new GameSession('hunter-controls',{count:50,seed:111});s.bot.executable=c.bot.executable;s.bot.compiler=c.bot.compiler;s.bot.enabled=true;s.market.beginTick();s.market.orders=[];return s;};
 const run=async s=>{const r=await s.bot.run(s.market.tick,(method,args)=>s.rpc(method,args));assert.equal(r.code,0,r.output);return r;};
 const crossed=make(),m=crossed.market;m.place(0,0,'buy',5,110,30);m.place(0,0,'sell',5,90,30);assert.equal(m.book(0).buy[0].price,110);assert.equal(m.book(0).sell[0].price,90);const before=m.player.cash;await run(crossed);assert.equal(m.player.cash,before+100);assert.equal(m.player.shares[0],0);assert.equal(m.playerTrades.filter(t=>t.buyer===m.playerId).reduce((s,t)=>s+t.qty,0),5);assert.equal(m.playerTrades.filter(t=>t.seller===m.playerId).reduce((s,t)=>s+t.qty,0),5);
 const circuit=make();circuit.memory.set('spread_hunter.v1',{peak:20000,rounds:3});await run(circuit);assert.equal(circuit.market.orders.filter(o=>o.owner===circuit.market.playerId&&o.side==='buy').length,0);assert.equal(circuit.memory.get('spread_hunter.v1').cooldown,circuit.market.tick+12);await run(circuit);assert.equal(circuit.market.orders.length,0);
 const debt=make();debt.market.setLeverage(2);debt.market.borrow(1000);await run(debt);assert.equal(debt.market.player.debt,0);
 const forced=make();forced.market.player.liquidating=true;await run(forced);assert.equal(forced.market.orders.filter(o=>o.owner===forced.market.playerId&&o.side==='buy').length,0);
 console.log('Actual C++ controls passed: crossed-book two-leg fills, 8% circuit breaker, cooldown, debt repayment and liquidation buying lock.');
})().catch(e=>{console.error(e);process.exitCode=1;});
