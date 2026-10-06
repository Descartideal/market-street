'use strict';
class MarketView {
 constructor(state){Object.assign(this,state);this.marginData=state.margin;delete this.margin;this.people[this.playerId]=this.player;this.agents=this.people.filter(a=>a.id!==this.playerId);window.MARKET_TYPES=state.types;}
 gross(a){return a.cash+a.shares.reduce((s,q,i)=>s+(q+(a.lent?.[i]||0))*this.stocks[i].price,0);}
 equity(a){return this.gross(a)-a.debt-(a.shorts||[]).reduce((v,q,i)=>v+q*this.stocks[i].price,0);}
 investment(a){return this.equity(a)-a.initialEquity-a.totalIncome;}
 margin(){return this.marginData;}
 reservedCash(id){return this.orders.reduce((s,o)=>s+(o.owner===id&&o.side==='buy'?o.qty*o.price:0),0);}
 availableCash(id){return Math.max(0,this.people[id].cash-this.reservedCash(id));}
 reservedShares(id,i){return this.orders.reduce((s,o)=>s+(o.owner===id&&o.stock===i&&o.side==='sell'?o.qty:0),0)+(this.people[id].lendingReserved?.[i]||0);}
 availableShares(id,i){return Math.max(0,this.people[id].shares[i]-this.reservedShares(id,i));}
 book(i){return {buy:this.orders.filter(o=>o.stock===i&&o.side==='buy').sort((a,b)=>b.price-a.price||a.id-b.id),sell:this.orders.filter(o=>o.stock===i&&o.side==='sell').sort((a,b)=>a.price-b.price||a.id-b.id)};}
 ranking(mode='equity'){if(this.compact){const p=this.player,eq=this.equity(p);return [{id:p.id,name:p.name,type:p.type,debt:p.debt,equity:eq,returnPct:(eq/p.initialEquity-1)*100,tradingReturnPct:this.investment(p)/p.initialEquity*100,rank:this.playerRanks[mode]}];}const key=mode==='return'?'returnPct':mode==='trading'?'tradingReturnPct':'equity';return this.people.map(a=>({id:a.id,name:a.name,type:a.type,debt:a.debt,equity:this.equity(a),returnPct:(this.equity(a)/a.initialEquity-1)*100,tradingReturnPct:this.investment(a)/a.initialEquity*100})).sort((a,b)=>b[key]-a[key]||a.id-b.id).map((a,i)=>({...a,rank:i+1}));}
}
