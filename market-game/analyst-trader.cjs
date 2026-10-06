'use strict';
const {forecast}=require('./analyst-model.cjs');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function decide(m,a){
 m.cancelAll(a.id);const eq=m.equity(a);if(eq<=0){a.action='分析派：停止新增风险';m.activity.wait++;return;}
 const extreme=a.analystStyle==='极端动量',defensive=a.analystStyle==='防御轮动';
 const rows=m.stocks.map((s,i)=>{const ind=m.indicators(i),model=forecast(a.analystStyle,ind,s.price,s.publicValue*Math.exp(a.valuationBias),a.risk,m.analysisContext(i));
 const bid=m.orderIndex.best(i,'buy',a.id),ask=m.orderIndex.best(i,'sell',a.id),spread=bid&&ask?Math.max(0,(ask.price-bid.price)/s.price):.003;
 const uncertainty=model.volatility*Math.sqrt(model.horizon),longEdge=model.signal+model.dividendYield*Math.max(1,model.horizon/12)-Math.expm1(model.horizon*Math.log1p(m.cashRate))-spread;
 // An overpriced but rising stock is a reason to reduce a long, not proof it will fall.
 const falling=ind.momentum<-.002&&ind.regressionSlope<-.0001&&ind.regressionR2>.35;
 const shortEdge=falling?-model.signal-m.lending.rate*model.horizon-model.dividendYield*Math.max(1,model.horizon/12)-Math.max(0,m.cashRate)*model.horizon-spread:0;
 const borrowingEdge=longEdge-Math.expm1(model.horizon*Math.log1p(m.loanRate))-uncertainty;
 return {i,s,ind,model,bid,ask,longEdge,shortEdge,borrowingEdge,uncertainty};});
 const state=a.analystState||(a.analystState={cooldown:[0,0,0,0,0]});
 const buys=rows.filter(r=>r.longEdge>.001&&r.model.signal>0&&state.cooldown[r.i]<=m.tick);
 const strongest=Math.max(0,...buys.map(r=>r.borrowingEdge));
 // Strategic risk budget only: exchange credit and mark-to-market collateral stay unchanged.
 const riskBudget=extreme?.12:defensive?.025:.06,maxStrategy=extreme?8:defensive?1.2:3;
 const good=buys.filter(r=>r.borrowingEdge>.003&&r.model.confidence>=.65);
 const sigma=good.length?Math.max(.008,...good.map(r=>r.uncertainty)):1;
 const leverage=a.usesLoans&&good.length?Math.min(maxStrategy,good[0].model.ceiling,1+strongest/(sigma*2),riskBudget/sigma):1;
 const targetGross=eq*(defensive?.55:extreme?.95:.8)*Math.max(1,leverage),weights=buys.reduce((n,r)=>n+Math.max(.002,r.longEdge)/Math.max(.004,r.uncertainty),0);
 const tasks=[];
 for(const r of rows){const {i,s,model}=r,beneficial=a.shares[i]+a.lent[i]-a.shortPending[i],held=beneficial*s.price;
 const stopped=beneficial>0&&s.price<a.cost[i]*(1-(extreme?.12:.08));
 if(stopped)state.cooldown[i]=m.tick+12;
 let goal=buys.includes(r)&&!stopped?Math.min(eq*(extreme?.75:.4)*Math.max(1,leverage),targetGross*(Math.max(.002,r.longEdge)/Math.max(.004,r.uncertainty))/weights):0;
 const band=eq*(extreme?.055:.035);
 if(a.shorts[i]){const stop=s.price>a.shortCost[i]*(extreme?1.09:1.05),profit=s.price<a.shortCost[i]*.96;
 if(stop||profit||r.shortEdge<.002||goal>0){tasks.push({r,kind:'cover',dollars:a.shorts[i]*s.price,priority:(stop?100:profit?20:10)+a.shorts[i]*s.price/eq});if(stop)state.cooldown[i]=m.tick+12;continue;}}
 if(held-goal>band&&m.availableShares(a.id,i)>0)tasks.push({r,kind:'sell',dollars:held-goal,priority:(stopped?90:5)+(held-goal)/eq});
 else if(goal-held>band&&r.ask&&!a.shorts[i])tasks.push({r,kind:'buy',dollars:goal-held,priority:1+r.longEdge/Math.max(.004,r.uncertainty)});
 else if(!a.shorts[i]&&m.availableShares(a.id,i)===0&&a.usesLoans&&r.shortEdge>Math.max(.004,r.uncertainty*.7)&&model.confidence>=.65&&state.cooldown[i]<=m.tick){
 const desired=Math.min(eq*(extreme?.4:.15),eq*r.shortEdge/Math.max(.01,r.uncertainty)*.08);tasks.push({r,kind:'short',dollars:desired,priority:r.shortEdge/Math.max(.004,r.uncertainty)});}
 }
 tasks.sort((x,y)=>y.priority-x.priority||x.r.i-y.r.i);let acted=false;
 for(const task of tasks){const {r,kind}=task,{i,s,bid,ask}=r;let q=0,result;
 if(kind==='cover'&&ask){q=Math.min(a.shorts[i],ask.qty,Math.floor(m.availableCash(a.id)/ask.price));if(q)result=m.shortTrade(a.id,i,q,ask.price*1.003,true);}
 else if(kind==='sell'&&bid){q=Math.min(m.availableShares(a.id,i),Math.max(1,Math.floor(task.dollars/s.price)),Math.max(bid.qty,Math.floor(eq*.08/s.price)));if(q)result=m.place(a.id,i,'sell',q,Math.max(.01,Math.floor(bid.price*.997*100)/100),1);}
 else if(kind==='buy'&&ask){const reserve=eq*.12+m.shortValue(a),budget=Math.min(task.dollars,eq*(extreme?.2:.1)),cost=Math.min(ask.price,s.price*Math.exp(Math.max(.001,r.model.signal*.4)));q=Math.floor(budget/cost);const shortage=q*cost+reserve-m.availableCash(a.id);
 if(shortage>0&&leverage>1&&r.borrowingEdge>.003){a.leverageLimit=Math.min(100,Math.max(a.leverageLimit,Math.ceil(leverage)));const allowance=Math.min(m.margin(a.id).capacity,Math.max(0,(leverage-1)*eq-a.debt-m.shortValue(a)));if(allowance>0)m.borrow(Math.min(shortage,allowance),a.id);}
 q=Math.min(q,Math.floor(Math.max(0,m.availableCash(a.id)-reserve)/cost));if(q)result=m.place(a.id,i,'buy',q,Math.floor(cost*100)/100,2);}
 else if(kind==='short'&&bid){a.leverageLimit=Math.max(2,a.leverageLimit);q=Math.min(Math.floor(task.dollars/s.price),bid.qty,m.lending.available(a.id,i),Math.floor(m.margin(a.id).capacity/Math.max(s.price,bid.price)));if(q)result=m.shortTrade(a.id,i,q,bid.price*.997);}
 if(result?.ok){a.action=`分析派${{buy:'买入',sell:'减仓',short:'做空',cover:'平空'}[kind]} ${s.symbol} ${q} 股`;a.analysis=`${a.analystStyle} · 目标仓位/执行价 · 扣除持有成本 · ${kind==='short'?'下跌趋势确认':'优先管理存量风险'}`;m.activity[kind==='buy'||kind==='cover'?'buy':'sell']++;acted=true;break;}
 }
 const excess=m.availableCash(a.id)-eq*.15-m.shortValue(a);if(a.debt&&excess>0)m.repay(Math.min(a.debt,excess),a.id);
 if(!acted){a.action='分析派：等待净优势或仓位偏离';m.activity.wait++;}
}
module.exports={decide};
