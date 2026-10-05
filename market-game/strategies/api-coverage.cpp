#include "market.hpp"
int main(){
    try{
        const auto info=market::market_info();
        if(info["playerId"].integer()<50)return 2;
        const auto own=market::player_info();
        if(own["positions"].array().size()!=5||own["cost"].array().size()!=5)return 3;
        if(market::stocks().array().size()!=5)return 4;
        if(market::traders(0).array().size()!=info["count"].integer()+1)return 5;
        if(market::trader(info["playerId"].integer())["name"].string()!="你")return 6;
        if(market::rules()["loanRate"].number()!=.0005)return 7;
        market::trades(0);market::trades(2,0,"A");market::my_trades(0);
        market::events(0);market::news();market::raw_book("A",0);
        market::equity_history(0);market::ledger(0);market::bot_info();market::snapshot();
        const auto net=market::equity_history(0).array();
        if(net.back()["tick"].integer()!=info["tick"].integer()||net.back()["complete"].boolean())return 9;
        market::memory_set("api_test",true);market::memory_keys();
        if(!market::memory_get("api_test").boolean())return 8;
        market::log("All public/private SDK queries passed.");return 0;
    }catch(const std::exception& e){market::log(e.what());return 1;}
}
