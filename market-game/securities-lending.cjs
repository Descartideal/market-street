'use strict';
// NPCs pledge 25% of their initial inventory. Loans transfer existing shares;
// lender claims and borrower obligations cancel, so no stock is manufactured.
class SecuritiesLending {
 constructor(m){this.m=m;this.rate=.0002;this.free=new Int32Array(m.people.length*5);this.total=[0,0,0,0,0];this.lenders=Array.from({length:5},()=>[]);this.cursor=[0,0,0,0,0];this.loans=new Map();for(const a of m.agents)for(let i=0;i<5;i++){const q=Math.floor(a.shares[i]*.25);this.free[a.id*5+i]=q;this.total[i]+=q;if(q)this.lenders[i].push(a.id);}}
 reserved(id,i){return this.free[id*5+i];}
 available(id,i){return Math.max(0,this.total[i]-this.reserved(id,i));}
 open(id,i,qty){const m=this.m,a=m.people[id],list=this.lenders[i];let left=Math.min(qty,this.available(id,i)),borrowed=0;const key=id*5+i,lots=this.loans.get(key)||[];let scanned=0;while(left&&scanned<list.length){const lenderId=list[this.cursor[i]],index=lenderId*5+i,n=lenderId===id?0:Math.min(left,this.free[index]);if(n){const lender=m.people[lenderId];this.free[index]-=n;this.total[i]-=n;lender.shares[i]-=n;lender.lent[i]+=n;lender.lentQuantity+=n;a.shares[i]+=n;a.shorts[i]+=n;a.shortQuantity+=n;a.shortPending[i]+=n;lots.push({lender:lenderId,qty:n});left-=n;borrowed+=n;}if(this.free[index]===0||lenderId===id){this.cursor[i]=(this.cursor[i]+1)%list.length;scanned++;}else break;}
 if(lots.length)this.loans.set(key,lots);return borrowed;}
 close(id,i,qty){const m=this.m,a=m.people[id],key=id*5+i,lots=this.loans.get(key)||[];let left=Math.min(qty,a.shorts[i],a.shares[i]);for(const lot of lots){if(!left)break;const n=Math.min(left,lot.qty);if(!n)continue;const lender=m.people[lot.lender];lot.qty-=n;a.shares[i]-=n;a.shorts[i]-=n;a.shortQuantity-=n;lender.shares[i]+=n;lender.lent[i]-=n;lender.lentQuantity-=n;this.free[lot.lender*5+i]+=n;this.total[i]+=n;left-=n;}while(lots.length&&!lots[0].qty)lots.shift();if(!lots.length)this.loans.delete(key);return qty-left;}
 tick(){const m=this.m;for(const [key,lots]of this.loans){const id=Math.floor(key/5),i=key%5,a=m.people[id];let fee=0;for(const lot of lots){const amount=lot.qty*m.stocks[i].price*this.rate;fee+=amount;const lender=m.people[lot.lender];lender.cash+=amount;lender.lendingIncome+=amount;}if(fee){const d=m.changeCash(a,-fee);a.shortFees+=fee;a.financeCosts+=fee;if(id===m.playerId)m.recordAccount('stock_borrow_fee',fee,d.cashDelta,d.debtDelta,{symbol:m.stocks[i].symbol,rate:this.rate});}}}
}
module.exports={SecuritiesLending};
