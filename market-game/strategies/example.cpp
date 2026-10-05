#include "market.hpp"
#include <expected>
#include <string>

// Real C++23 example: main() runs once per tick, then exits.
// The built-in indicators only use completed past candles; no hidden intrinsic value is exposed.
std::expected<double,std::string> fast_average(const std::vector<market::Candle>& bars) {
    double sum=0;int n=0;
    for(auto it=bars.rbegin();it!=bars.rend()&&n<5;++it) {
        if(it->complete){sum+=it->close;++n;}
    }
    if(n<5)return std::unexpected("Need five completed candles");
    return sum/n;
}

int main() {
    try {
        const auto a=market::account();
        market::log("Tick "+std::to_string(a.tick)+", equity $"+std::to_string(a.equity));
        // Demonstrates persistent memory between otherwise fresh processes.
        const int rounds=market::memory_get("rounds").integer();
        market::memory_set("rounds",rounds+1);
        if(a.liquidating){market::repay(a.available_cash);return 0;}
        const auto s=market::stock("A");
        const auto bars=market::history("A",40);
        const auto fast=fast_average(bars);
        if(!fast){market::log(fast.error());return 0;}
        const auto b=market::book("A");
        // Small positions, no automatic borrowing in this example. Edit the rules freely.
        if(*fast>s.indicators.sma20*1.002&&a.shares[0]<20&&!b.sell.empty()&&a.available_cash>b.sell.front().price*2) {
            const auto r=market::buy("A",2);market::log(r.message);
        } else if(*fast<s.indicators.sma20*.998&&a.shares[0]>0) {
            const auto r=market::sell("A",std::min(2,a.shares[0]));market::log(r.message);
        }
        // Optional examples:
        // market::set_leverage(2); market::borrow(1000); market::repay(500);
        // auto order=market::limit_buy("B",1,60.00,5);
        // if(order.order_id) market::cancel_order(order.order_id);
        return 0;
    } catch(const std::exception& e) {market::log(e.what());return 1;}
}
