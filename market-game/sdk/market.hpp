#pragma once
// Market Street C++23 SDK. Communicates with the local game over stdin/stdout.
#include <algorithm>
#include <cmath>
#include <cctype>
#include <cstddef>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <map>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <variant>
#include <vector>

namespace market {
class Json {
public:
 using Array=std::vector<Json>;using Object=std::map<std::string,Json>;
 std::variant<std::nullptr_t,bool,double,std::string,Array,Object> value=nullptr;
 Json()=default;Json(std::nullptr_t):value(nullptr){}Json(bool v):value(v){}Json(int v):value(double(v)){}Json(long long v):value(double(v)){}Json(double v):value(v){}Json(const char* v):value(std::string(v)){}Json(std::string v):value(std::move(v)){}Json(Array v):value(std::move(v)){}Json(Object v):value(std::move(v)){}
 double number(double fallback=0)const{const auto p=std::get_if<double>(&value);return p?*p:fallback;}
 int integer(int fallback=0)const{return static_cast<int>(number(fallback));}
 bool boolean(bool fallback=false)const{const auto p=std::get_if<bool>(&value);return p?*p:fallback;}
 std::string string(std::string fallback="")const{const auto p=std::get_if<std::string>(&value);return p?*p:fallback;}
 bool is_null()const{return std::holds_alternative<std::nullptr_t>(value);}
 const Array& array()const{static const Array empty;const auto p=std::get_if<Array>(&value);return p?*p:empty;}
 const Json& operator[](std::string_view key)const{static const Json empty;const auto p=std::get_if<Object>(&value);if(!p)return empty;const auto it=p->find(std::string(key));return it==p->end()?empty:it->second;}
 static std::string quote(std::string_view s){std::ostringstream out;out<<'"';for(unsigned char c:s){switch(c){case '"':out<<"\\\"";break;case '\\':out<<"\\\\";break;case '\n':out<<"\\n";break;case '\r':out<<"\\r";break;case '\t':out<<"\\t";break;default:if(c<32)out<<"\\u"<<std::hex<<std::setw(4)<<std::setfill('0')<<int(c)<<std::dec;else out<<c;}}out<<'"';return out.str();}
 std::string dump()const{if(is_null())return "null";if(auto p=std::get_if<bool>(&value))return *p?"true":"false";if(auto p=std::get_if<double>(&value)){if(!std::isfinite(*p))throw std::runtime_error("JSON cannot contain NaN or infinity");std::ostringstream o;o<<std::setprecision(17)<<*p;return o.str();}if(auto p=std::get_if<std::string>(&value))return quote(*p);std::string r;if(auto p=std::get_if<Array>(&value)){r="[";for(const auto& v:*p){if(r.size()>1)r+=',';r+=v.dump();}return r+"]";}r="{";for(const auto& [k,v]:std::get<Object>(value)){if(r.size()>1)r+=',';r+=quote(k)+":"+v.dump();}return r+"}";}
 static Json parse(std::string_view text){struct Parser {
  std::string_view s;std::size_t p=0;int depth=0;
  void ws(){while(p<s.size()&&std::isspace(static_cast<unsigned char>(s[p])))p++;}
  char get(){if(p>=s.size())throw std::runtime_error("Unexpected JSON end");return s[p++];}
  static void utf8(std::string& out,unsigned cp){if(cp<128)out+=char(cp);else if(cp<2048){out+=char(0xc0|(cp>>6));out+=char(0x80|(cp&63));}else if(cp<65536){out+=char(0xe0|(cp>>12));out+=char(0x80|((cp>>6)&63));out+=char(0x80|(cp&63));}else{out+=char(0xf0|(cp>>18));out+=char(0x80|((cp>>12)&63));out+=char(0x80|((cp>>6)&63));out+=char(0x80|(cp&63));}}
  unsigned hex4(){unsigned n=0;for(int k=0;k<4;k++){char c=get();n<<=4;if(c>='0'&&c<='9')n+=c-'0';else if(c>='a'&&c<='f')n+=c-'a'+10;else if(c>='A'&&c<='F')n+=c-'A'+10;else throw std::runtime_error("Invalid Unicode escape");}return n;}
  std::string str(){if(get()!='"')throw std::runtime_error("Expected JSON string");std::string r;while(true){char c=get();if(c=='"')break;if(c!='\\'){r+=c;continue;}c=get();switch(c){case 'n':r+='\n';break;case 'r':r+='\r';break;case 't':r+='\t';break;case 'b':r+='\b';break;case 'f':r+='\f';break;case '"':r+='"';break;case '\\':r+='\\';break;case '/':r+='/';break;case 'u':{unsigned cp=hex4();if(cp>=0xd800&&cp<=0xdbff){if(get()!='\\'||get()!='u')throw std::runtime_error("Invalid Unicode pair");unsigned lo=hex4();if(lo<0xdc00||lo>0xdfff)throw std::runtime_error("Invalid Unicode pair");cp=0x10000+((cp-0xd800)<<10)+(lo-0xdc00);}utf8(r,cp);break;}default:throw std::runtime_error("Invalid JSON escape");}}return r;}
  Json read(){ws();if(++depth>100)throw std::runtime_error("JSON nesting too deep");Json result;char c=p<s.size()?s[p]:'\0';if(c=='"')result=Json(str());else if(c=='{'){get();Object o;ws();if(p<s.size()&&s[p]=='}')get();else while(true){ws();auto k=str();ws();if(get()!=':')throw std::runtime_error("Expected colon");o[k]=read();ws();char end=get();if(end=='}')break;if(end!=',')throw std::runtime_error("Expected comma");}result=Json(std::move(o));}else if(c=='['){get();Array a;ws();if(p<s.size()&&s[p]==']')get();else while(true){a.push_back(read());ws();char end=get();if(end==']')break;if(end!=',')throw std::runtime_error("Expected comma");}result=Json(std::move(a));}else if(s.substr(p,4)=="true"){p+=4;result=true;}else if(s.substr(p,5)=="false"){p+=5;result=false;}else if(s.substr(p,4)=="null"){p+=4;result=nullptr;}else{std::size_t begin=p;while(p<s.size()&&(std::isdigit(static_cast<unsigned char>(s[p]))||s[p]=='-'||s[p]=='+'||s[p]=='.'||s[p]=='e'||s[p]=='E'))p++;if(begin==p)throw std::runtime_error("Invalid JSON number");result=std::stod(std::string(s.substr(begin,p-begin)));}depth--;return result;}
 };Parser p{text};Json r=p.read();p.ws();if(p.p!=text.size())throw std::runtime_error("Trailing JSON data");return r;}
};

inline Json rpc(const std::string& method,Json::Object args={}){static std::mutex mutex;std::scoped_lock lock(mutex);std::cout<<"\n@market "<<Json(Json::Object{{"method",method},{"args",Json(std::move(args))}}).dump()<<std::endl;std::string line;if(!std::getline(std::cin,line))throw std::runtime_error("Game connection closed. Run this program through Market Street.");const auto answer=Json::parse(line);if(!answer["ok"].boolean())throw std::runtime_error(answer["error"].string("Game API error"));return answer["data"];}
struct Result {bool ok=false;int filled=0,order_id=0,remaining=0;double amount=0;std::string message;};
inline Result result(const Json& j){return {j["ok"].boolean(),j["filled"].integer(),j["orderId"].integer(),j["remaining"].integer(),j["amount"].number(),j["message"].string()};}
struct Account {int tick=0;double cash=0,available_cash=0,equity=0,debt=0,investment=0,borrow_capacity=0,margin_ratio=1,finance_costs=0,total_income=0;bool liquidating=false;std::vector<int> shares;};
inline Account account(){const auto j=rpc("get_account");Account a;a.tick=j["tick"].integer();a.cash=j["cash"].number();a.available_cash=j["availableCash"].number();a.equity=j["equity"].number();a.debt=j["debt"].number();a.investment=j["investment"].number();a.borrow_capacity=j["margin"]["capacity"].number();a.margin_ratio=j["margin"]["ratio"].number();a.liquidating=j["margin"]["liquidating"].boolean();a.finance_costs=j["financeCosts"].number();a.total_income=j["totalIncome"].number();for(const auto& q:j["shares"].array())a.shares.push_back(q.integer());return a;}
inline int tick(){return rpc("get_tick")["tick"].integer();}
inline std::string phase(){return rpc("get_tick")["phase"].string();}
struct Indicators {double sma5=0,sma20=0,ema12=0,rsi14=50,volatility=0,regression_slope=0,regression_r2=0,bollinger_upper=0,bollinger_lower=0,z_score=0,imbalance=0,momentum=0;};
struct Stock {std::string symbol;double price=0,public_value=0,previous=0,volume=0,turnover=0;Indicators indicators;long long supply=0;};
inline Stock stock(const std::string& symbol){const auto j=rpc("get_stock",{{"stock",symbol}}),v=j["indicators"];return {j["symbol"].string(),j["price"].number(),j["publicValue"].number(),j["previous"].number(),j["volume"].number(),j["turnover"].number(),{v["sma5"].number(),v["sma20"].number(),v["ema12"].number(),v["rsi14"].number(),v["volatility"].number(),v["regressionSlope"].number(),v["regressionR2"].number(),v["bollingerUpper"].number(),v["bollingerLower"].number(),v["zScore"].number(),v["imbalance"].number(),v["momentum"].number()},static_cast<long long>(j["supply"].number())};}
struct Candle {int tick=0,end_tick=0,trades=0;double open=0,high=0,low=0,close=0,volume=0,turnover=0,vwap=0;bool complete=false;};
inline std::vector<Candle> history(const std::string& symbol,int count=200,int timeframe=1,int offset=0){const auto j=rpc("get_history",{{"stock",symbol},{"count",count},{"timeframe",timeframe},{"offset",offset}});std::vector<Candle> bars;for(const auto& b:j.array())bars.push_back({b["tick"].integer(),b["endTick"].integer(),b["trades"].integer(),b["open"].number(),b["high"].number(),b["low"].number(),b["close"].number(),b["volume"].number(),b["turnover"].number(),b["vwap"].number(),b["complete"].boolean()});return bars;}
struct Level {double price=0;int qty=0;};struct Book {std::vector<Level> buy,sell;};
struct News {int tick=0,direction=0;std::string symbol,title,body;};
inline std::vector<News> news(int count=50){const auto j=rpc("get_news",{{"count",count}});std::vector<News> out;for(const auto& e:j.array())out.push_back({e["tick"].integer(),e["direction"].integer(),e["symbol"].string(),e["title"].string(),e["body"].string()});return out;}
inline Book book(const std::string& symbol,int depth=10){const auto j=rpc("get_order_book",{{"stock",symbol},{"depth",depth}});Book r;for(const auto& x:j["buy"].array())r.buy.push_back({x["price"].number(),x["qty"].integer()});for(const auto& x:j["sell"].array())r.sell.push_back({x["price"].number(),x["qty"].integer()});return r;}
inline Result buy(const std::string& symbol,int qty){return result(rpc("trade",{{"stock",symbol},{"side","buy"},{"qty",qty},{"kind","market"}}));}
inline Result sell(const std::string& symbol,int qty){return result(rpc("trade",{{"stock",symbol},{"side","sell"},{"qty",qty},{"kind","market"}}));}
inline Result limit_buy(const std::string& symbol,int qty,double price,int ttl=30){return result(rpc("trade",{{"stock",symbol},{"side","buy"},{"qty",qty},{"kind","limit"},{"price",price},{"ttl",ttl}}));}
inline Result limit_sell(const std::string& symbol,int qty,double price,int ttl=30){return result(rpc("trade",{{"stock",symbol},{"side","sell"},{"qty",qty},{"kind","limit"},{"price",price},{"ttl",ttl}}));}
inline Result cancel_order(int id){return result(rpc("cancel",{{"id",id}}));}
inline Result cancel_all(){return result(rpc("cancel_all"));}
inline Json orders(){return rpc("get_orders");}inline Json rankings(const std::string& mode="equity"){return rpc("get_rankings",{{"mode",mode}});}
// Complete public data and your own private data. Arrays are newest first except equity history.
inline Json market_info(){return rpc("get_market");}
inline Json rules(){return rpc("get_rules");}
inline Json player_info(){return rpc("get_player");}
inline Json stocks(){return rpc("get_stocks");}
inline Json trader(int id){return rpc("get_trader",{{"id",id}});}
inline Json traders(int count=100,int offset=0){return rpc("get_traders",{{"count",count},{"offset",offset}});}
inline Json trades(int count=100,int offset=0,const std::string& symbol=""){Json::Object a{{"count",count},{"offset",offset}};if(!symbol.empty())a["stock"]=symbol;return rpc("get_trades",std::move(a));}
inline Json my_trades(int count=100,int offset=0,const std::string& symbol=""){Json::Object a{{"count",count},{"offset",offset}};if(!symbol.empty())a["stock"]=symbol;return rpc("get_player_trades",std::move(a));}
inline Json events(int count=100,int offset=0){return rpc("get_events",{{"count",count},{"offset",offset}});}
inline Json raw_book(const std::string& symbol,int count=100,int offset=0){return rpc("get_raw_book",{{"stock",symbol},{"count",count},{"offset",offset}});}
inline Json equity_history(int count=200,int offset=0){return rpc("get_equity_history",{{"count",count},{"offset",offset}});}
inline Json bot_info(){return rpc("get_bot");}
inline Json memory_keys(){return rpc("get_memory_keys");}
inline Json ledger(int count=100,int offset=0){return rpc("get_ledger",{{"count",count},{"offset",offset}});}
inline Json snapshot(){return rpc("get_snapshot");}
inline Result set_leverage(int value){return result(rpc("set_leverage",{{"value",value}}));}
inline Result borrow(double amount){return result(rpc("borrow",{{"amount",amount}}));}
inline Result repay(double amount){return result(rpc("repay",{{"amount",amount}}));}
inline Json memory_get(const std::string& key){return rpc("get_memory",{{"key",key}});}
inline void memory_set(const std::string& key,Json value){rpc("set_memory",{{"key",key},{"value",std::move(value)}});}
inline void log(const std::string& text){std::cerr<<text<<std::endl;}
} // namespace market
