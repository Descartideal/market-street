const {Market}=require('../engine-v2.cjs'),fs=require('node:fs'),path=require('node:path');const rows=[];
for(const seed of [717,2026,8888])for(const name of ['cash','equal-buy-hold','example-sma']){
 const m=new Market({count:1000,seed});let peak=10000,dd=0;
 for(let k=0;k<180;k++){m.beginTick();if(name==='equal-buy-hold'&&k===0){for(let i=0;i<5;i++){const ask=m.book(i).sell[0];if(ask)m.submit(i,'buy',Math.floor(1900/ask.price),'market');}}
  if(name==='example-sma'){const a=m.player,h=m.stocks[0].candles.filter(b=>b.complete).slice(-5),ind=m.indicators(0),book=m.book(0);if(h.length===5){const mean=h.reduce((n,b)=>n+b.close,0)/5;if(mean>ind.sma20*1.002&&a.shares[0]<20&&book.sell.length&&m.availableCash(a.id)>book.sell[0].price*2)m.submit(0,'buy',2,'market');else if(mean<ind.sma20*.998&&a.shares[0]>0)m.submit(0,'sell',Math.min(2,a.shares[0]),'market');}}
  m.finishTick();const eq=m.equity(m.player);peak=Math.max(peak,eq);dd=Math.max(dd,1-eq/peak);
 }
 rows.push({name,seed,ticks:180,equity:+m.equity(m.player).toFixed(2),investment:+m.investment(m.player).toFixed(2),maxDrawdownPct:+(dd*100).toFixed(3)});
}
fs.writeFileSync(path.join(__dirname,'hunter-baselines-results.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
