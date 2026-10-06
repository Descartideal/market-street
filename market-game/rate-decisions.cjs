'use strict';
// Rates are fixed for the session. Borrowing is a real balance-sheet action, not free income.
const shouldRepay=m=>m.loanRate>=m.cashRate;
function decide(m,a){a.rateAnalysis=m.cashRate<0?'现金负利率：计入持币成本':'现金利息：计入持币收益';a.rateAnalysis+=m.loanRate<0?'；债务负利率：负债逐刻减少':'；债务利息：计入融资成本';if(a.debt)a.rateAnalysis+=shouldRepay(m)?'；闲置现金优先还债':'；保留低成本债务优于提前还款';
 const spread=m.cashRate-m.loanRate;if(!a.usesLoans||spread<=.0001||a.liquidating||m.equity(a)<=0)return;
 const style=a.analystStyle,limit=a.type===7?(style==='极端动量'?8:style==='防御轮动'?1.2:3):Math.min(3,a.leverageLimit);
 a.leverageLimit=Math.max(a.leverageLimit,Math.ceil(limit));const eq=m.equity(a),desired=eq*Math.max(0,limit-1)*(.15+.35*a.risk)*a.loanPreference;
 const amount=Math.min(Math.max(0,desired-a.debt-m.shortValue(a)),m.margin(a.id).capacity);
 if(amount>=1){a.leverageLimit=Math.max(a.leverageLimit,Math.ceil(limit));const r=m.borrow(Math.floor(amount*100)/100,a.id);if(r.ok)a.rateAnalysis+='；利差支持借款持币';}
}
module.exports={decide,shouldRepay};
