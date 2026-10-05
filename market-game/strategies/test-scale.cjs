'use strict';
const assert=require('node:assert/strict'),{Market}=require('../engine-v2.cjs'),{GameSession}=require('../controller.cjs');
const m=new Market({count:10000,seed:42,playerCash:25000,cashRate:.0002,loanRate:.001});
assert.equal(m.player.cash,25000);assert.equal(m.equityHistory[0],25000);assert.equal(m.goalEquity,50000);
for(const args of [{count:100001},{cashRate:-1},{cashRate:.011},{loanRate:.021},{playerCash:0},{acceleration:'fake'}])assert.throws(()=>new Market(args));
const wealth=m.agents.map(a=>a.initialEquity).sort((a,b)=>a-b);assert.ok(wealth[9900]>wealth[5000]*15);assert.ok(wealth[0]<2000&&wealth.at(-1)>100000);
const ordinary=m.agents.filter(a=>a.type<5);assert.ok(ordinary.filter(a=>!a.usesLoans).length/ordinary.length>.7);
assert.ok(m.agents.filter(a=>a.type===5&&a.usesLoans).length/m.agents.filter(a=>a.type===5).length>.7);
const income=m.player.cash*.0002+3;m.setLeverage(2);m.borrow(1000);const before=m.player.cash;m.beginTick();assert.ok(Math.abs(m.player.cash-before-(before*.0002+3))<1e-8);assert.equal(m.player.debt,1001);m.finishTick();
for(const a of m.speedAgents){const sequence=m.actionSequence.filter(row=>row.id===a.id);assert.equal(sequence.length,3);assert.equal(sequence[0].phase,'speed');assert.deepEqual(sequence.slice(1).map(r=>r.phase),['normal','normal']);}
for(const type of [0,5,7]){
 const sample=new Market({count:50,seed:9});sample.orders=[];const a=sample.agents.find(a=>a.type===type);a.focus=0;a.knownSymbols=type===5?[0]:[];a.cash=type===0?100000:0;a.shares=[0,1000,0,0,0];a.usesLoans=type!==0;a.leverageLimit=3;a.loanPreference=1;
 sample.random=()=>.1;sample.stocks[0].fair=130;sample.stocks[0].publicValue=120;sample.riskResults=new Float64Array(sample.count*2).fill(1);
 if(type===7){const ind=sample.indicators(0,false);sample.stocks[0].technicalCache={key:'0:false',value:{...ind,regressionR2:.9,regressionSlope:.005,ema12:110}};}
 const eq=sample.equity(a);sample.decide(a);assert.ok(sample.orders.find(o=>o.owner===a.id&&o.side==='buy').qty>12,'Capital-based sizing');if(type!==0){assert.ok(a.debt>0);assert.ok(Math.abs(sample.equity(a)-eq)<1e-6);}
}
const forced=new Market({count:50,seed:42});forced.orders=[];const a=forced.people[0];a.cash=0;a.debt=8000;a.shares=[100,0,0,0,0];forced.people[1].cash=20000;forced.place(1,0,'buy',100,100,30);const playerCash=forced.player.cash;forced.checkMargin(a.id);assert.equal(a.shares[0],57);assert.equal(a.debt,3700);assert.equal(forced.player.cash,playerCash);assert.equal(a.liquidating,false);
const noBid=new Market({count:50,seed:42});noBid.orders=[];noBid.people[0].cash=0;noBid.people[0].debt=8000;noBid.people[0].shares=[100,0,0,0,0];noBid.checkMargin(0);assert.equal(noBid.people[0].debt,8000);assert.equal(noBid.place(0,0,'buy',1,100).ok,false);
const ui=new GameSession('compact-test',{count:10000,seed:42});const snap=ui.snapshot();assert.equal(snap.people.length,200);for(const mode of ['equity','return','trading']){const page=ui.rpc('get_ranking_page',{mode,count:25,offset:500});const full=ui.market.ranking(mode);assert.deepEqual(page.rows,full.slice(500,525));assert.equal(page.mine.rank,snap.playerRanks[mode]);}assert.equal(ui.rpc('get_traders',{count:10,offset:9990})[0].id,9990);
console.log('Scale mechanisms: configuration, Pareto wealth, capital sizing, selective NPC loans, NPC liquidation, three speed slots and complete paginated data passed.');
