'use strict';
// 64 stress scenarios of eight steps, using only current beliefs and historical volatility.
// Identical counter-based samples in JS and CUDA; neither sees future market randomness.
function mix(x){x=(x^x>>>16)>>>0;x=Math.imul(x,0x7feb352d)>>>0;x=(x^x>>>15)>>>0;x=Math.imul(x,0x846ca68b)>>>0;return (x^x>>>16)>>>0;}
function cpuRisk(input){const n=input.length/4,out=new Float64Array(n*2);for(let i=0;i<n;i++){const drift=input[i*4],vol=input[i*4+1],risk=input[i*4+2],seed=input[i*4+3]>>>0;let positive=0,loss=0;for(let p=0;p<64;p++){let path=0;for(let t=0;t<8;t++){const k=(seed+Math.imul(p*8+t,3))>>>0;const z=2*((mix(k)/4294967296)+(mix((k+1)>>>0)/4294967296)+(mix((k+2)>>>0)/4294967296)-1.5);path+=drift+vol*z;}if(path>0)positive++;loss+=Math.max(0,-path);}out[i*2]=positive/64;out[i*2+1]=Math.max(.15,Math.min(1,1-loss/64*(10+20*(1-risk))));}return out;}
module.exports={cpuRisk};
