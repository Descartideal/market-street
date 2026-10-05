// 交易街 C++23 单文件策略：导入此文件，编译并启用即可。
// 五股滚动岭回归 + 新闻 + 样本外检验 + 按信号融资。
// 平时不借款；只有通过确认的看涨信号、现金不足且能实际成交才融资。
#include "market.hpp"
#include <array>

namespace gale {
constexpr std::array<const char*,5> symbols{"A","B","C","D","E"};
constexpr double leverage_target=2.6; // 这是上限，不是必须维持的资产杠杆。
constexpr double prediction_gain=.5, spread=.001;
constexpr const char* key="gale.signal.v2";
int qty(double value,double price){if(!std::isfinite(value)||!std::isfinite(price)||value<=0||price<.01)return 0;return int(std::min(100000000.,std::floor(value/price)));}
double cents(double x){return std::round(x*100)/100;}
double lr(double a,double b){return a>0&&b>0?std::log(a/b):0;}
struct Model{double ref=0,alpha=0;int samples=0;double error=1,accuracy=0;int validation=0;};

Model fit(const std::vector<market::Candle>& input,bool validate=true){
    std::vector<market::Candle> h;
    for(const auto& c:input)if(c.complete&&c.close>0)h.push_back(c);
    if(h.empty())return {};
    if(h.size()>220)h.erase(h.begin(),h.end()-220);
    const int n=int(h.size());std::vector<double> ref(n);
    for(int k=0;k<n;k++){
        double v=0,t=0;for(int j=std::max(0,k-4);j<=k;j++){v+=h[j].volume;t+=h[j].turnover;}
        ref[k]=v>0?t/v:h[k].close;
    }
    Model out{ref.back(),0,std::max(0,n-9)};
    if(n<30)return out;
    auto feature=[&](int k){return std::array<double,5>{1,100*lr(h[k].close,ref[k]),100*lr(ref[k],ref[k-1]),100*lr(h[k].vwap,ref[k]),100*lr(h[k].close,h[k-3].close)};};
    // 标签是“下一根已完成 K 线的五刻 VWAP 变化”，绝不读取未来数据。
    // 加权最小二乘 + L2 正则；近期样本权重大，避免追随过时行情。
    std::array<std::array<double,6>,5> a{};
    for(int i=0;i<5;i++)a[i][i]=.02;
    for(int k=8;k<n-1;k++){
        const auto x=feature(k);const double y=100*lr(ref[k+1],ref[k]),w=std::exp(-(n-k)/80.);
        for(int i=0;i<5;i++){for(int j=0;j<5;j++)a[i][j]+=w*x[i]*x[j];a[i][5]+=w*x[i]*y;}
    }
    for(int i=0;i<5;i++){
        int p=i;for(int j=i+1;j<5;j++)if(std::abs(a[j][i])>std::abs(a[p][i]))p=j;
        std::swap(a[i],a[p]);if(std::abs(a[i][i])<1e-10)return out;
        double d=a[i][i];for(int j=i;j<=5;j++)a[i][j]/=d;
        for(int k=0;k<5;k++)if(k!=i){d=a[k][i];for(int j=i;j<=5;j++)a[k][j]-=d*a[i][j];}
    }
    const auto x=feature(n-1);double pred=0;for(int i=0;i<5;i++)pred+=x[i]*a[i][5];
    if(std::isfinite(pred))out.alpha=std::clamp(pred/100.,-.003,.003)*prediction_gain;
    // 真正逐点向前验证：预测第 k 根时，只训练第 k 根之前的数据。
    if(validate&&n>=60){double error=0,hits=0;int tested=0;
        for(int k=n-20;k<n;k++){
            const std::vector<market::Candle> prefix(h.begin(),h.begin()+k);
            const auto past=fit(prefix,false);const double forecast=past.alpha/prediction_gain;
            const double actual=lr(ref[k],ref[k-1]);error+=std::abs(forecast-actual);
            if(std::abs(actual)>1e-7){tested++;hits+=(forecast*actual>0);}
        }
        out.error=error/20;out.accuracy=tested?hits/tested:0;out.validation=tested;
    }
    return out;
}
void repay_cash(double reserve){
    const auto a=market::account();const double free=std::max(0.,a.available_cash-reserve);
    // 请求金额向上到分；服务器按实际债务截断，清掉资本化利息产生的分以下尾数。
    if(a.debt>1e-7&&free>=.01)market::repay(std::max(.01,std::ceil(std::min(a.debt,free)*100)/100));
}
void reduce(double cap){
    for(int i=0;i<5;i++)for(int j=0;j<20;j++){
        auto a=market::account();auto s=market::stock(symbols[i]);int excess=a.shares[i]-qty(std::max(0.,a.equity)*cap,s.price);if(excess<=0)break;
        auto b=market::book(symbols[i],1);if(b.buy.empty())break;
        auto r=market::limit_sell(symbols[i],std::min(excess,b.buy.front().qty),b.buy.front().price,1);
        if(r.order_id)market::cancel_order(r.order_id);
        if(!r.ok||!r.filled)break;
    }
    repay_cash(2);
}
struct Plan {market::Stock stock;Model model;double bid=0,ask=0,forecast=0,hurdle=0;int direction=0;bool bullish=false,bearish=false;};
int run(){
    market::cancel_all();auto a=market::account();
    if(a.shares.size()!=5||!std::isfinite(a.equity))throw std::runtime_error("Invalid account");
    auto st=market::memory_get(key);const double neutral=a.equity-a.total_income;
    double peak=std::max(st["peak"].number(neutral),neutral),dd=peak>0?std::max(0.,1-neutral/peak):1;
    int cool=st["cool"].integer(),rounds=st["rounds"].integer()+1;
    auto save=[&](){market::memory_set(key,market::Json::Object{{"peak",peak},{"cool",cool},{"rounds",rounds}});};
    if(a.equity<=0||a.liquidating||a.margin_ratio<.33||dd>=.08){
        reduce(0);cool=a.tick+12;a=market::account();peak=a.equity-a.total_income;save();
        market::log("Risk breaker: selling, repaying and cooling down; no new debt.");return 0;
    }
    if(a.tick<=cool){reduce(.03);save();market::log("Cooling down; no borrowing or buying.");return 0;}
    repay_cash(2);a=market::account();const double eq=a.equity,scale=dd>=.04?.5:1;
    const auto rules=market::rules();
    const auto news=market::news(100);
    const double loan_rate=rules["loanRate"].number(.0005);
    std::array<Plan,5> plans;int strong=0;
    for(int i=0;i<5;i++){
        auto& p=plans[i];p.stock=market::stock(symbols[i]);p.model=fit(market::history(symbols[i],221));
        const auto& s=p.stock;const auto& m=p.model;if(m.ref<=0)continue;
        double news_shift=0;
        for(const auto& e:news)if(e.symbol==symbols[i]&&e.direction){
            const int age=a.tick-e.tick;if(age>=0&&age<=8){p.direction=e.direction;news_shift=e.direction*.00015*std::exp(-age/3.);}break;
        }
        const double held=a.shares[i]*m.ref;
        const double center=m.ref*std::exp(std::clamp(m.alpha,-.0005,.0005)+news_shift+std::clamp(lr(s.public_value,m.ref)*.02,-.005,.005)-std::clamp((held-eq*.14)/(eq*.35),-1.,1.)*.0006);
        p.bid=std::max(.01,cents(center*(1-spread)));p.ask=std::max(p.bid+.01,cents(center*(1+spread)));
        // 五刻收益预测必须覆盖五刻利息、0.30%执行/模型缓冲及验证误差。
        const double trend=std::clamp(s.indicators.regression_slope,-.004,.004);
        p.forecast=m.ref*std::exp(std::clamp(5*(m.alpha*.5+trend*.5),-.025,.025));
        p.hurdle=loan_rate*5+.003+1.65*m.error*std::sqrt(5.);
        const bool valid=m.samples>=50&&m.validation>=12&&m.accuracy>=.60;
        p.bullish=scale==1&&valid&&m.alpha>std::max(.00008,m.error*.35)&&trend>.00015&&s.indicators.regression_r2>.45&&p.direction>=0&&(p.direction>0||s.indicators.imbalance>.12);
        p.bearish=(valid&&m.alpha<-.00008&&trend<-.00015&&s.indicators.regression_r2>.45)||(p.direction<0&&s.indicators.momentum<-.001);
        if(p.bullish){const auto b=market::book(symbols[i],1);p.bullish=!b.sell.empty()&&lr(p.forecast,b.sell.front().price)>p.hurdle;}
        strong+=p.bullish;
        if(m.validation<12)market::log(std::string(symbols[i])+" | 收集历史样本（"+std::to_string(m.samples)+"）| 暂不融资");
        else market::log(std::string(symbols[i])+" | 验证方向命中 "+std::to_string(m.accuracy*100)+"% | 验证误差 "+std::to_string(m.error*100)+"% | 消息 "+std::to_string(p.direction)+" | "+(p.bullish?"confirmed bullish（允许按需融资）":p.bearish?"看跌，减仓还款":"无融资信号"));
    }
    // 不把上刻的判断无限延期：失去强信号时，将仓位降回现金可支撑的范围。
    a=market::account();if(a.debt>.01&&(!strong||scale<1))reduce(.14*scale);
    repay_cash(2);
    double borrowed=0;int fills=0;
    for(int i=0;i<5;i++){
        auto& p=plans[i];if(!p.bullish||p.model.ref<=0)continue;
        a=market::account();if(a.liquidating||a.equity<=0||a.margin_ratio<.38)continue;
        const auto b=market::book(symbols[i],100);const double max_price=p.forecast/std::exp(p.hurdle);
        int wanted=std::min(qty(std::max(0.,a.equity*1.8-a.shares[i]*p.stock.price),p.stock.price),qty(a.equity*1.4,p.stock.price));
        int executable=0;double limit=0;
        for(const auto& l:b.sell){if(l.price>max_price||executable>=wanted)break;const int n=std::min(l.qty,wanted-executable);executable+=n;limit=l.price;}
        if(!executable||limit<=0)continue;
        const double debt_room=std::max(0.,(leverage_target-1)*a.equity-a.debt);
        executable=std::min(executable,qty(a.available_cash-2+debt_room,limit));if(!executable)continue;
        const double need=std::max(0.,executable*limit+2-a.available_cash);
        if(need>=.01){
            auto r=market::set_leverage(3);if(!r.ok)continue;a=market::account();
            const double amount=std::ceil(need*100)/100;
            if(amount>std::min(debt_room,a.borrow_capacity)-1)continue;
            r=market::borrow(amount);if(!r.ok){market::log(r.message);continue;}borrowed+=r.amount;
        }
        // 只对已存在且价格划算的卖盘执行。未成交部分立即撤掉，不借钱等成交。
        auto r=market::limit_buy(symbols[i],executable,limit,1);fills+=r.filled;
        if(r.order_id)market::cancel_order(r.order_id);
        if(!r.ok)market::log(r.message);
        repay_cash(2);market::log(std::string("Directional entry ")+symbols[i]+" filled "+std::to_string(r.filled)+"; net edge threshold "+std::to_string(p.hurdle*100)+"%");
    }
    // 无强信号时靠自有资金做窄价差；看跌时只卖不买。
    for(int i=0;i<5;i++){
        const auto& p=plans[i];if(p.model.ref<=0)continue;
        if(p.bearish){
            // 明确偏空时先用现有买盘减仓，不能只挂一个可能永不成交的高价卖单。
            for(int attempt=0;attempt<20;attempt++){
                a=market::account();const auto b=market::book(symbols[i],1);
                const int excess=a.shares[i]-qty(std::max(0.,a.equity)*.05,p.stock.price);
                if(excess<=0||b.buy.empty())break;
                auto r=market::limit_sell(symbols[i],std::min(excess,b.buy.front().qty),b.buy.front().price,1);
                if(r.order_id)market::cancel_order(r.order_id);
                if(!r.ok||!r.filled)break;
            }
            repay_cash(2);
        }
        a=market::account();const double held=a.shares[i]*p.model.ref;
        int q=std::min(a.shares[i],qty(eq*(p.bearish?.5:.15)*scale,p.ask));
        if(q>0){auto r=market::limit_sell(symbols[i],q,p.ask,1);if(!r.ok)market::log(r.message);}
        if(p.bearish||p.bullish)continue;
        a=market::account();if(a.liquidating||a.debt>.01)continue;
        q=std::min({qty(std::max(0.,eq*.35*scale-held),p.bid),qty(a.available_cash-2,p.bid),qty(eq*.15*scale,p.bid)});
        if(q>0){auto r=market::limit_buy(symbols[i],q,p.bid,1);if(!r.ok)market::log(r.message);}
    }
    repay_cash(2);a=market::account();if(a.debt<.01)market::set_leverage(1);save();
    market::log("Tick "+std::to_string(a.tick)+" | equity $"+std::to_string(a.equity)+" | investment $"+std::to_string(a.investment)+" | strong signals "+std::to_string(strong)+" | new credit $"+std::to_string(borrowed)+" | debt $"+std::to_string(a.debt)+" | directional filled "+std::to_string(fills));
    return 0;
}
}
int main(){try{return gale::run();}catch(const std::exception& e){market::log(std::string("Strategy failed: ")+e.what());return 1;}}
