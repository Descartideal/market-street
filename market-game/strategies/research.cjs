'use strict';
const {Market}=require('../engine-v2.cjs');
function strategy(m,p={}){
 m.cancelAll();const a=m.player,eq=m.equity(a);if(eq<=0)return;
 if(a.debt&&m.availableCash(a.id)>Math.max(50,eq*.03))m.repay(m.availableCash(a.id)-Math.max(50,eq*.03));m.setLeverage(3);
 const needed=Math.max(0,eq*(p.leverage??1.4)-m.gross(a));if(needed>10)m.borrow(Math.floor(Math.min(needed,m.margin().capacity)*100)/100);
 const per=eq*(p.cap??.35),spread=p.spread??.003,skew=p.skew??.002;
 for(let i=0;i<5;i++){
  const s=m.stocks[i],ref=m.reference(i),hold=a.shares[i]*ref,target=eq*(p.target??.14),center=ref*Math.exp(Math.max(-.015,Math.min(.015,Math.log(s.publicValue/ref)*(p.public??.15)))-Math.max(-1,Math.min(1,(hold-target)/per))*skew);
  const bid=Math.round(center*(1-spread)*100)/100,ask=Math.round(center*(1+spread)*100)/100;
  const qbuy=Math.min(Math.floor(Math.max(0,per-hold)/bid),Math.floor(m.availableCash(a.id)/bid),Math.floor(eq*(p.size??.15)/bid));
  const qsell=Math.min(a.shares[i],Math.max(1,Math.floor(eq*(p.size??.15)/ask)));
  if(qsell>0)m.submit(i,'sell',qsell,'limit',ask,1);if(qbuy>0)m.submit(i,'buy',qbuy,'limit',bid,1);
 }
}
async function main(){const rows=[];const variants=[{name:'tight',spread:.0015},{name:'medium',spread:.003},{name:'wide',spread:.005},{name:'no-public',spread:.003,public:0},{name:'big',spread:.003,size:.3,cap:.45,leverage:1.8}];for(const p of variants){for(const seed of [17,42,123]){const m=new Market({count:1000,seed});let peak=10000,dd=0,wins=0;for(let t=0;t<180;t++){m.beginTick();strategy(m,p);m.finishTick();const eq=m.equity(m.player);peak=Math.max(peak,eq);dd=Math.max(dd,1-eq/peak);if(m.won&&!wins)wins=m.tick;}const row={name:p.name,seed,equity:Math.round(m.equity(m.player)),profit:Math.round(m.investment(m.player)),dd:+(dd*100).toFixed(2),debt:Math.round(m.player.debt),wins,trades:m.playerTrades.length};rows.push(row);console.log(JSON.stringify(row));}}require('node:fs').writeFileSync(require('node:path').join(__dirname,'research-results.json'),JSON.stringify(rows,null,2));}
if(require.main===module)main();module.exports={strategy};
