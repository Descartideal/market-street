'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {GameSession}=require('../controller.cjs');
async function main(){
 const compile=new GameSession('hunter-compile',{count:50,seed:9});await compile.bot.compile({sourcePath:path.resolve(__dirname,'../../价差猎手.cpp')});
 const configs=process.argv.includes('--long')?[{count:1000,seed:20261005,ticks:1200}]:[{count:1000,seed:717,ticks:180},{count:1000,seed:2026,ticks:180},{count:1000,seed:8888,ticks:180},{count:123,seed:5017,ticks:180},{count:50,seed:731,ticks:180},{count:5000,seed:881,ticks:90}];const rows=[];
 for(const cfg of configs){const s=new GameSession('hunter-'+cfg.count+'-'+cfg.seed,cfg);s.bot.executable=compile.bot.executable;s.bot.compiler=compile.bot.compiler;s.bot.enabled=true;let peak=10000,neutralPeak=10000,dd=0,ndd=0,totalMs=0,maxMs=0,maxCalls=0,winTick=0,maxDebt=0,marginCalls=0;const initialShares=s.market.stocks.map((_,i)=>s.market.people.reduce((n,a)=>n+a.shares[i],0));
  for(let k=0;k<cfg.ticks;k++){s.market.beginTick();const r=await s.bot.run(s.market.tick,(method,args)=>s.rpc(method,args));assert.equal(r.code,0,r.output);assert.ok(!r.error,r.error);totalMs+=r.ms;maxMs=Math.max(maxMs,r.ms);maxCalls=Math.max(maxCalls,r.calls);s.market.finishTick();const eq=s.market.equity(s.market.player),neutral=eq-s.market.player.totalIncome;peak=Math.max(peak,eq);neutralPeak=Math.max(neutralPeak,neutral);dd=Math.max(dd,1-eq/peak);ndd=Math.max(ndd,1-neutral/neutralPeak);maxDebt=Math.max(maxDebt,s.market.player.debt);if(s.market.player.liquidating)marginCalls++;if(s.market.won&&!winTick)winTick=s.market.tick;if(process.argv.includes('--long')&&k%200===199)console.log(JSON.stringify({progress:k+1,equity:Math.round(eq),profit:Math.round(s.market.investment(s.market.player))}));}
  assert.deepEqual(s.market.stocks.map((_,i)=>s.market.people.reduce((n,a)=>n+a.shares[i],0)),initialShares);assert.ok(Math.abs(s.market.people.reduce((n,a)=>n+a.cash,0)+s.market.bankCash-s.market.initialCash-s.market.minted)<.001);
  const marked=s.market.equity(s.market.player),profit=s.market.investment(s.market.player),income=s.market.player.totalIncome,positions=[...s.market.player.shares];
  // 另估算在测试结束时按真实买盘卖出的价值；深度不足的剩余股数明确记录。
  s.market.cancelAll();for(let i=0;i<5;i++)if(s.market.player.shares[i])s.market.submit(i,'sell',s.market.player.shares[i],'market');if(s.market.player.debt)s.market.repay(s.market.availableCash(s.market.playerId));
  const row={...cfg,equity:+marked.toFixed(2),investment:+profit.toFixed(2),income:+income.toFixed(2),maxDrawdownPct:+(dd*100).toFixed(3),incomeAdjustedDrawdownPct:+(ndd*100).toFixed(3),maxDebt,marginCalls,trades:s.market.playerTrades.length,positions,exitEquity:+s.market.equity(s.market.player).toFixed(2),exitInvestment:+s.market.investment(s.market.player).toFixed(2),exitUnsold:s.market.player.shares,averageBotMs:+(totalMs/cfg.ticks).toFixed(1),maxBotMs:maxMs,maxCalls,winTick};rows.push(row);console.log(JSON.stringify(row));
 }
 await fs.writeFile(path.join(__dirname,process.argv.includes('--long')?'hunter-long-results.json':'hunter-validation-results.json'),JSON.stringify(rows,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
