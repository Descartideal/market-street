'use strict';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
function policy({type,risk,signal,volatility,probUp,loanRate,cashRate,horizon:holdingHorizon,ceiling:styleCeiling,mode}){
 const horizon=holdingHorizon??(type===5?12:type===7?8:type===6?2:5);
 const cost=Math.expm1(horizon*Math.log1p(loanRate));
 const cashCarry=Math.expm1(horizon*Math.log1p(cashRate));
 const expected=Math.expm1(Math.max(0,signal)*(type===5?.7:type===7?.65:type===6?.55:.4));
 const uncertainty=Math.max(.002,volatility)*Math.sqrt(horizon)*(type===5?.25:type===7?.45:.65);
 const edge=(mode==='short'?expected+cashCarry-cost:expected-Math.max(cost,cashCarry))-uncertainty-.001;
 const qualified=signal>0&&edge>0&&probUp>=(type===5?.59:type===7?.65:.7);
 const ceiling=styleCeiling??(type===5?40:type===7?20:type===6?8:4);
 // Asset financing; deterministic positive cash/debt carry is handled in rate-decisions.
 const target=qualified?clamp(1+edge/Math.max(.004,uncertainty)*(.3+risk)*3,1,ceiling):1;
 return {horizon,cost,cashCarry,edge,qualified,target};
}
module.exports={policy};
