'use strict';
const {Market,TYPES}=require('./engine-v2.cjs'),{BotRuntime}=require('./bot-runtime.cjs');
const data=require('./data-api.cjs');
class GameSession {
 constructor(id,options){this.id=id;this.market=new Market(options);this.bot=new BotRuntime(id);this.memory=new Map();this.busy=false;this.updated=Date.now();this.stateRevision=0;}
 index(symbol){if(typeof symbol==='number'&&Number.isInteger(symbol)&&symbol>=0&&symbol<5)return symbol;const i=this.market.stocks.findIndex(s=>s.symbol===String(symbol).toUpperCase());if(i<0)throw new Error('股票须为 A、B、C、D、E。');return i;}
 snapshot(){this.updated=Date.now();return {...this.market.snapshot(),people:this.market.people.map(a=>data.trader(this.market,a)),bot:this.bot.status(),busy:this.busy,types:TYPES,sessionId:this.id,revision:++this.stateRevision};}
 action(method,args={}){const m=this.market;switch(method){case 'trade':return m.submit(this.index(args.stock),args.side,Number(args.qty),args.kind||'market',Number(args.price||0),Number(args.ttl??30));case 'cancel':return {ok:m.cancel(Number(args.id)),message:'已处理撤单。'};case 'cancel_all':return {ok:true,count:m.cancelAll(),message:'已撤销全部玩家挂单。'};case 'set_leverage':return m.setLeverage(Number(args.value));case 'borrow':return m.borrow(Number(args.amount));case 'repay':return m.repay(Number(args.amount));default:throw new Error('未知操作。');}}
 rpc(method,args={}){const m=this.market;switch(method){case 'get_tick':return {tick:m.tick,phase:m.phase};case 'get_account':return {...m.summary(),...data.own(m)};case 'get_stock':return data.stock(m,this.index(args.stock));
  case 'get_market':return data.info(m);case 'get_rules':return data.rules(m);case 'get_player':return data.own(m);
  case 'get_stocks':return m.stocks.map((_,i)=>data.stock(m,i));
  case 'get_trader':{const id=Number(args.id);if(!Number.isInteger(id)||!m.people[id])throw new Error('交易者不存在。');return data.trader(m,m.people[id]);}
  case 'get_traders':return data.page(m.people,args).map(a=>data.trader(m,a));
  case 'get_trades':case 'get_player_trades':{let list=method==='get_trades'?[...(m.tradeArchive||[])].reverse():m.playerTrades;if(args.stock!==undefined)list=list.filter(t=>t.stock===this.index(args.stock));return data.page(list,args).map(t=>({...t,symbol:m.stocks[t.stock].symbol,amount:t.price*t.qty,...(method==='get_player_trades'?{side:t.buyer===m.playerId?'buy':'sell'}:{})}));}
  case 'get_events':return data.page([...(m.eventArchive||[])].reverse(),args).map(data.news);
  case 'get_raw_book':{const b=m.book(this.index(args.stock));return {buy:data.page(b.buy,args),sell:data.page(b.sell,args)};}
  case 'get_equity_history':{const h=m.equityHistory.map((equity,tick)=>({tick,equity,complete:tick<m.tick||!m.inTick}));const current={tick:m.tick,equity:m.equity(m.player),complete:!m.inTick};if(h.at(-1)?.tick===m.tick)h[h.length-1]=current;else h.push(current);return data.page(h,args);}
  case 'get_bot':return {...this.bot.status(),source:this.bot.source};
  case 'get_memory_keys':return [...this.memory.keys()];
  case 'get_ledger':return data.page([...(m.accountLedger||[])].reverse(),args);
  case 'get_snapshot':return {market:data.info(m),player:data.own(m),stocks:m.stocks.map((_,i)=>data.stock(m,i)),traders:m.people.map(a=>data.trader(m,a)),orders:m.orders,events:m.events.map(data.news),trades:m.trades.slice(0,100),bot:this.bot.status()};
  case 'get_history':{const count=Number(args.count??200),timeframe=Number(args.timeframe??1),offset=Number(args.offset??0);if(!Number.isInteger(count)||count<0||count>100000||!Number.isInteger(offset)||offset<0)throw new Error('无效历史范围。');return m.candles(this.index(args.stock),timeframe,count,offset);}
  case 'get_order_book':{const book=m.book(this.index(args.stock)),depth=Number(args.depth??10);if(!Number.isInteger(depth)||depth<1||depth>1000)throw new Error('盘口深度须为 1–1000。');const levels=orders=>{const grouped=new Map();orders.forEach(o=>grouped.set(o.price,(grouped.get(o.price)||0)+o.qty));return [...grouped].slice(0,depth).map(([price,qty])=>({price,qty}));};return {buy:levels(book.buy),sell:levels(book.sell)};}
  case 'get_news':{const count=Number(args.count??50);if(!Number.isInteger(count)||count<1||count>100)throw new Error('新闻条数须为 1–100。');return m.events.slice(0,count).map(e=>{const match=/^([A-E]) 行业(利好|利空)$/.exec(e.title);return {...e,symbol:match?.[1]||'',direction:match?(match[2]==='利好'?1:-1):0};});}
  case 'get_orders':return m.orders.filter(o=>o.owner===m.playerId);case 'get_rankings':return m.ranking(args.mode||'equity');case 'get_memory':return this.memory.get(String(args.key))??null;case 'set_memory':if(Buffer.byteLength(JSON.stringify(args.value))>100000)throw new Error('单项记忆最多 100 KB。');this.memory.set(String(args.key),args.value);return {ok:true};case 'log':this.bot.logs.unshift({tick:m.tick,text:String(args.text).slice(0,5000)});return {ok:true};default:return this.action(method,args);}
 }
 async step(runBot=this.bot.enabled){if(this.busy||this.bot.compiling)throw new Error('上一回合或编译尚未结束。');this.busy=true;let run=null;try{this.market.beginTick();if(runBot&&this.bot.enabled&&this.bot.executable)run=await this.bot.run(this.market.tick,(method,args)=>this.rpc(method,args));else{run={tick:this.market.tick,ms:0,code:0,calls:0,skipped:true,output:'本刻机器已关闭或选择跳过。'};this.bot.history.unshift(run);this.bot.logs.unshift({tick:this.market.tick,text:run.output});if(this.bot.history.length>100)this.bot.history.length=100;if(this.bot.logs.length>100)this.bot.logs.length=100;}this.market.finishTick();return {ok:true,run,state:this.snapshot()};}finally{this.busy=false;this.updated=Date.now();}}
}
module.exports={GameSession};
