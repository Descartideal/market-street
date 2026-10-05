'use strict';
// Price/time heaps, owner indexes and incremental collateral. Matching stays serial.
class Heap {
 constructor(before){this.items=[];this.before=before;}
 push(x){const a=this.items;let i=a.length;a.push(x);while(i){const p=(i-1)>>1;if(!this.before(x,a[p]))break;a[i]=a[p];i=p;}a[i]=x;}
 pop(){const a=this.items,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&this.before(a[j+1],a[j]))j++;if(!this.before(a[j],last))break;a[i]=a[j];i=j;}a[i]=last;}return top;}
 peek(){return this.items[0];}
}
class OrderIndex {
 constructor(count){this.count=count;this.active=new Map();this.owners=new Map();this.cash=new Float64Array(count);this.shares=new Float64Array(count*5);this.heaps=Array.from({length:5},()=>({buy:new Heap((a,b)=>a.price>b.price||a.price===b.price&&a.id<b.id),sell:new Heap((a,b)=>a.price<b.price||a.price===b.price&&a.id<b.id)}));this.expiry=new Heap((a,b)=>a.expires<b.expires||a.expires===b.expires&&a.id<b.id);this.version=0;this.sorted=new Map();}
 add(o){if(!o.qty)return;this.active.set(o.id,o);let own=this.owners.get(o.owner);if(!own)this.owners.set(o.owner,own=new Set());own.add(o.id);this.reserve(o,o.qty);this.heaps[o.stock][o.side].push(o);this.expiry.push(o);this.version++;}
 reserve(o,qty){if(o.side==='buy')this.cash[o.owner]+=qty*o.price;else this.shares[o.owner*5+o.stock]+=qty;}
 fill(o,qty){if(this.active.get(o.id)!==o)return;this.reserve(o,-qty);this.version++;if(!o.qty)this.remove(o.id);}
 remove(id){const o=this.active.get(id);if(!o)return false;this.reserve(o,-o.qty);this.active.delete(id);const own=this.owners.get(o.owner);own.delete(id);if(!own.size)this.owners.delete(o.owner);this.version++;return true;}
 cancelAll(owner){const ids=this.owners.get(owner);if(!ids)return 0;const n=ids.size;for(const id of [...ids])this.remove(id);return n;}
 expire(tick){while(this.expiry.peek()?.expires<=tick)this.remove(this.expiry.pop().id);this.compact();}
 compact(){if(this.expiry.items.length>Math.max(2048,this.active.size*3)){const all=[...this.active.values()];this.expiry.items=[];for(const book of this.heaps){book.buy.items=[];book.sell.items=[];}for(const o of all){this.expiry.push(o);this.heaps[o.stock][o.side].push(o);}}}
 valid(o){return o&&o.qty>0&&this.active.get(o.id)===o;}
 // Best-first traversal visits only the depth requested and never sorts the whole book.
 *iterate(stock,side){const h=this.heaps[stock][side];while(h.peek()&&!this.valid(h.peek()))h.pop();const a=h.items;if(!a.length)return;const frontier=new Heap((x,y)=>h.before(a[x],a[y]));frontier.push(0);while(frontier.items.length){const i=frontier.pop(),o=a[i];if(i*2+1<a.length)frontier.push(i*2+1);if(i*2+2<a.length)frontier.push(i*2+2);if(this.valid(o))yield o;}}
 best(stock,side,owner){for(const o of this.iterate(stock,side))if(o.owner!==owner)return o;return null;}
 book(stock){const key=stock,cached=this.sorted.get(key);if(cached?.version===this.version)return cached.book;const book={buy:[...this.iterate(stock,'buy')],sell:[...this.iterate(stock,'sell')]};this.sorted.set(key,{version:this.version,book});return book;}
 values(){return [...this.active.values()];}
}
module.exports={Heap,OrderIndex};
