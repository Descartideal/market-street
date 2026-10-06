'use strict';
const {Heap}=require('./order-index.cjs');
// Each stock owns an independent price/time book. Accounts are reserved before
// dispatch; workers only produce plans and never write shared balances.
function heap(rows,buy){const h=new Heap((a,b)=>buy?a.price>b.price||a.price===b.price&&a.id<b.id:a.price<b.price||a.price===b.price&&a.id<b.id);h.items=rows;for(let root=(rows.length>>1)-1;root>=0;root--){let i=root;const value=rows[i];while(i*2+1<rows.length){let j=i*2+1;if(j+1<rows.length&&h.before(rows[j+1],rows[j]))j++;if(!h.before(rows[j],value))break;rows[i]=rows[j];i=j;}rows[i]=value;}return h;}
function plan({resting,incoming}) {
 const rows=resting.map(r=>({...r})),buy=heap(rows.filter(r=>r.side==='buy'),true),sell=heap(rows.filter(r=>r.side==='sell'),false),fills=[];
 for(const row of incoming){const order={...row},oppositeHeap=order.side==='buy'?sell:buy,own=[];
  while(order.qty){let opposite=oppositeHeap.peek();while(opposite&&(opposite.qty===0||opposite.owner===order.owner)){const skipped=oppositeHeap.pop();if(skipped.qty)own.push(skipped);opposite=oppositeHeap.peek();}if(!opposite||(order.side==='buy'?opposite.price>order.price:opposite.price<order.price))break;
   const qty=Math.min(order.qty,opposite.qty);fills.push({buy:order.side==='buy'?order.id:opposite.id,sell:order.side==='sell'?order.id:opposite.id,price:opposite.price,qty});order.qty-=qty;opposite.qty-=qty;
  }for(const o of own)oppositeHeap.push(o);if(order.qty&&order.kind!=='ioc')(order.side==='buy'?buy:sell).push(order);
 }return fills;
}
function pack(rows){const buffer=new Float64Array(rows.length*6);rows.forEach((r,i)=>buffer.set([r.id,r.owner,r.qty,r.price,r.side==='buy'?1:0,r.kind==='ioc'?1:0],i*6));return buffer;}
function unpack(buffer){const rows=[];for(let i=0;i<buffer.length;i+=6)rows.push({id:buffer[i],owner:buffer[i+1],qty:buffer[i+2],price:buffer[i+3],side:buffer[i+4]?'buy':'sell',kind:buffer[i+5]?'ioc':'limit'});return rows;}
const {isMainThread,parentPort,threadId,Worker}=require('node:worker_threads');
if(!isMainThread)parentPort.on('message',({id,task})=>{const start=performance.now();try{const fills=plan({resting:unpack(task.resting),incoming:unpack(task.incoming)}),buffer=new Float64Array(fills.length*4);fills.forEach((f,i)=>buffer.set([f.buy,f.sell,f.price,f.qty],i*4));parentPort.postMessage({id,buffer,threadId,start,end:performance.now()},[buffer.buffer]);}catch(error){parentPort.postMessage({id,error:error.message});}});
let pool,serial=0;
function slot(){const worker=new Worker(__filename);worker.unref();const pending=new Map();let dead=false;const fail=error=>{dead=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();};worker.on('message',r=>{const p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(new Error(r.error)):p.resolve(r);if(!pending.size)worker.unref();});worker.on('error',fail);worker.on('exit',code=>fail(new Error('撮合线程退出：'+code)));return {run(task){if(dead)return Promise.reject(new Error('撮合线程不可用'));return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{worker.terminate();fail(new Error('撮合线程超时'));},30000);pending.set(id,{resolve,reject,timer});worker.ref();worker.postMessage({id,task},[task.resting.buffer,task.incoming.buffer]);});}};}
async function parallel(tasks){pool??=Array.from({length:5},slot);const results=await Promise.all(tasks.map((task,i)=>pool[i].run({resting:pack(task.resting),incoming:pack(task.incoming)})));return results.map(r=>{const fills=[];for(let i=0;i<r.buffer.length;i+=4)fills.push({buy:r.buffer[i],sell:r.buffer[i+1],price:r.buffer[i+2],qty:r.buffer[i+3]});return {...r,buffer:undefined,fills};});}
module.exports={plan,parallel};
