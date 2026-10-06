'use strict';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const STYLES=['趋势杠杆','价值纠偏','波动突破','均值反转','防御轮动','极端动量','逆势抄底','盘口跟随'];
function forecast(style,ind,ref,publicValue,risk,context={}){
 const trend=ind.regressionR2>.4&&Math.abs(ind.regressionSlope)>.00015;
 const slope=ind.regressionSlope,momentum=ind.momentum,value=Math.log(publicValue/ref),ema=Math.log(ind.ema12/ref),vol=Math.max(.002,ind.volatility);
 let signal=0,confidence=.5,exposure=.5,aggression=1,horizon=8,ceiling=20;
 switch(style){
 case '趋势杠杆':signal=trend?slope*8+momentum*.3+ema*.2:0;confidence=trend?.55+.35*ind.regressionR2:.5;exposure=signal>0?.65:.2;break;
 case '价值纠偏':signal=value*.65-ind.zScore*.0015;confidence=.55+Math.min(.35,Math.abs(value)*3);exposure=signal>0?.6:.15;horizon=16;ceiling=8;break;
 case '波动突破':signal=trend&&Math.abs(ind.zScore)>1?slope*10+momentum*.5:0;confidence=signal?.55+.3*ind.regressionR2:.5;exposure=signal>0?.75:.1;aggression=1.4;horizon=4;break;
 case '均值反转':signal=-ind.zScore*.004+(50-ind.rsi14)*.00015+value*.25;confidence=.55+Math.min(.28,Math.abs(ind.zScore)*.08);exposure=signal>0?.55:.15;ceiling=6;break;
 case '防御轮动':signal=value*.3+momentum*.2+slope*3-vol*.5;confidence=.6;exposure=signal>0?.4:.05;ceiling=2;break;
 case '极端动量':signal=trend?slope*18+momentum*.8:0;confidence=trend?.52+.4*ind.regressionR2:.5;exposure=signal>0?.95:0;aggression=2.2;horizon=3;ceiling=60;break;
 case '逆势抄底':signal=value*.35-ind.zScore*.005-momentum*.3;confidence=.55+Math.min(.25,Math.abs(ind.zScore)*.08);exposure=signal>0?.8:.1;aggression=1.5;horizon=12;ceiling=12;break;
 default:signal=ind.imbalance*.008+slope*4+momentum*.25+value*.1;confidence=.55+Math.min(.3,Math.abs(ind.imbalance)*.3);exposure=signal>0?.55:.2;horizon=2;ceiling=8;
 }
 // Expensive stocks are not a free leveraged momentum trade. All styles see only public inputs.
 const c=context.company;let fundamental=0,dividendYield=0;
 if(c&&context.supply>0){const estimate=Math.max(.01,(context.start*.5+c.bookValuePerShare+clamp(c.cashFlow/context.supply*250,-context.start*.4,context.start*4))/.6425);fundamental=clamp(Math.log(estimate/ref),-.4,.4);dividendYield=Math.max(0,c.dividendPerShare/ref);signal+=fundamental*(style==='价值纠偏'||style==='防御轮动'?.35:.12)+dividendYield*2;confidence=Math.max(confidence,.55+Math.min(.3,Math.abs(fundamental)*1.2));}
 const expensive=Math.max(0,-value-.12);
 signal=clamp(signal+clamp(value,-.3,.3)*.08-Math.min(.08,expensive*.25),-.08,.08);
 if(value<-Math.log(style==='极端动量'?1.8:1.35)){exposure=Math.min(exposure,.05);ceiling=Math.min(ceiling,2);}
 if(signal<0)exposure=Math.min(exposure,.2);
 return {fundamental,dividendYield,shortExposure:signal<0?(style==='极端动量'?.8:style==='防御轮动'?.15:.45):0,signal,confidence:clamp(confidence,.5,.95),exposure,aggression,horizon,ceiling,volatility:vol,risk};
}
module.exports={STYLES,forecast};
