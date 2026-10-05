// 交易街 V2 专用：价差猎手。作为一个 .cpp 导入游戏、编译、启用即可。
// 只调用公开 SDK；不读内部估值、随机种子、电脑文件或网络，不修改游戏规则。
// 核心：复现 NPC 的五刻 VWAP 报价锚；窄价差双边做市，库存偏移，逐刻刷新。
// 历史模拟表现不是收益保证。适用于当前 engine-v2.cjs 的撮合与 NPC 行为。
#include "market.hpp"
#include <array>
#include <expected>
#include <limits>

namespace hunter {
constexpr std::array<const char*, 5> symbols{"A", "B", "C", "D", "E"};
constexpr const char* memory_key = "spread_hunter.v1";

// 默认参数经过多组独立市场测试。0.001 = 单边报价距离约 0.10%。
constexpr double half_spread = 0.001;
constexpr double public_weight = 0.02;
constexpr double inventory_skew = 0.0006;
constexpr double target_weight = 0.14;
constexpr double position_cap = 0.35;
constexpr double order_fraction = 0.15;
constexpr double cash_buffer = 2.0;
constexpr double defensive_drawdown = 0.04;
constexpr double circuit_drawdown = 0.08;
constexpr bool enable_crossed_book_arbitrage = true;
// 默认为 0（不新借款），测试中长期加杠杆反而损害做市收益。
// 如自行修改，建议不超过 0.15。安全检查仍限制债务/净资产。
constexpr double credit_fraction = 0.0;

double cents(double x) { return std::round(x * 100.0) / 100.0; }
int quantity(double notional, double price) {
    if (!std::isfinite(notional) || !std::isfinite(price) || notional <= 0 || price < .01) return 0;
    return static_cast<int>(std::min(100000000.0, std::floor(notional / price)));
}
bool finite_positive(double x) { return std::isfinite(x) && x > 0; }

struct Model {
    double reference = 0, center = 0, bid = 0, ask = 0;
    double volatility = 0, public_value = 0;
    int index = 0;
};

std::expected<Model, std::string> model(int index, const market::Account& account) {
    const auto stock = market::stock(symbols[index]);
    const auto bars = market::history(symbols[index], 80);
    // 当前未完成周期绝不用于 VWAP 锚或风险波动计算。
    double turnover = 0, volume = 0, last_close = stock.previous;
    int n = 0;
    for (auto it = bars.rbegin(); it != bars.rend() && n < 5; ++it) {
        if (!it->complete) continue;
        if (!n) last_close = it->close;
        turnover += it->turnover;
        volume += it->volume;
        ++n;
    }
    const double reference = volume > 0 ? turnover / volume : last_close;
    if (!finite_positive(reference) || !finite_positive(stock.public_value))
        return std::unexpected(std::string("Invalid public market data for ") + symbols[index]);

    const double eq = account.equity;
    const double held = account.shares[index] * reference;
    const double deviation = std::clamp((held - eq * target_weight) / (eq * position_cap), -1.0, 1.0);
    // 公开估值只占很小权重，避免把滞后的报告误当即时成交价值。
    const double public_signal = std::clamp(std::log(stock.public_value / reference) * public_weight, -.015, .015);
    const double center = reference * std::exp(public_signal - deviation * inventory_skew);
    double width = half_spread;
    // 只在异常波动时显著扩大报价；正常市场保留测试过的窄价差。
    if (stock.indicators.volatility > .006)
        width += std::min(.004, (stock.indicators.volatility - .006) * .35);
    const double bid = std::max(.01, cents(center * (1 - width)));
    const double ask = std::max(bid + .01, cents(center * (1 + width)));
    return Model{reference, center, bid, ask, stock.indicators.volatility, stock.public_value, index};
}

// 撮合跳过自成交，偶尔会留下交叉的 NPC 盘口。玩家阶段没有其他 NPC
// 插单；先低价买、再对现存高价买盘卖，严格以实际成交数量计算第二腿。
// 不用借款做这一模块；每次重新查询深度，最多循环 8 次/股。
void crossed_book(int index) {
    if (!enable_crossed_book_arbitrage) return;
    for (int attempt = 0; attempt < 8; ++attempt) {
        const auto account = market::account();
        if (account.liquidating || account.equity <= 0) return;
        const auto book = market::book(symbols[index], 1);
        if (book.buy.empty() || book.sell.empty()) return;
        const auto buy = book.buy.front(), sell = book.sell.front();
        if (buy.price < sell.price + .009999) return;
        const int qty = std::min({buy.qty, sell.qty,
            quantity(account.available_cash - cash_buffer, sell.price),
            quantity(account.equity * .10, sell.price)});
        if (qty < 1) return;
        const auto first = market::limit_buy(symbols[index], qty, sell.price, 1);
        if (first.order_id) market::cancel_order(first.order_id);
        if (!first.ok || first.filled < 1) return;
        const auto second = market::limit_sell(symbols[index], first.filled, buy.price, 1);
        if (second.order_id) market::cancel_order(second.order_id);
        if (!second.ok || second.filled != first.filled) {
            market::log(std::string("Arbitrage leg incomplete: ") + symbols[index] + "; residual inventory managed by maker.");
            return;
        }
    }
}

void repay_free_cash() {
    const auto a = market::account();
    const double amount = std::min(a.debt, std::max(0.0, a.available_cash - cash_buffer));
    if (amount >= .01) market::repay(amount);
}

// 严重风控时只通过已有买盘逐档卖出；没有真实深度就保留库存下刻重试。
void reduce_inventory(double cap_fraction) {
    for (int i = 0; i < 5; ++i) {
        for (int attempt = 0; attempt < 20; ++attempt) {
            const auto a = market::account();
            const auto s = market::stock(symbols[i]);
            const int keep = quantity(std::max(0.0, a.equity) * cap_fraction, s.price);
            const int excess = std::max(0, a.shares[i] - keep);
            if (!excess) break;
            const auto b = market::book(symbols[i], 1);
            if (b.buy.empty()) break;
            const auto r = market::limit_sell(symbols[i], std::min(excess, b.buy.front().qty), b.buy.front().price, 1);
            if (r.order_id) market::cancel_order(r.order_id);
            if (!r.ok || !r.filled) break;
        }
    }
    repay_free_cash();
}

int run() {
    market::cancel_all(); // 释放所有旧挂单，避免重复冻结现金/股份。
    auto account = market::account();
    if (account.shares.size() != 5 || !std::isfinite(account.equity))
        throw std::runtime_error("Unexpected account format");
    auto state = market::memory_get(memory_key);
    // 剔除收入后跟踪经济净值，避免被每刻补贴掩盖交易回撤。
    const double neutral_equity = account.equity - account.total_income;
    double peak = std::max(state["peak"].number(neutral_equity), neutral_equity);
    double drawdown = peak > 0 ? std::max(0.0, 1 - neutral_equity / peak) : 1.0;
    int cooldown = state["cooldown"].integer();
    const int rounds = state["rounds"].integer() + 1;

    repay_free_cash();
    account = market::account();
    if (account.equity <= 0 || account.liquidating || account.margin_ratio < .45) {
        reduce_inventory(.05);
        market::memory_set(memory_key, market::Json::Object{{"peak", peak}, {"cooldown", account.tick + 12}, {"rounds", rounds}});
        market::log("Defensive deleveraging: no new buy orders this tick.");
        return 0;
    }
    if (drawdown >= circuit_drawdown) {
        reduce_inventory(0);
        cooldown = account.tick + 12;
        account = market::account();
        peak = account.equity - account.total_income;
        market::memory_set(memory_key, market::Json::Object{{"peak", peak}, {"cooldown", cooldown}, {"rounds", rounds}});
        market::log("8% income-adjusted drawdown circuit breaker; reducing inventory and cooling down.");
        return 0;
    }
    if (account.tick <= cooldown) {
        reduce_inventory(.03);
        market::memory_set(memory_key, market::Json::Object{{"peak", peak}, {"cooldown", cooldown}, {"rounds", rounds}});
        market::log("Cooling down: sell/repaid only, no fresh buying.");
        return 0;
    }

    for (int i = 0; i < 5; ++i) crossed_book(i);
    account = market::account();
    // 可选轻融资。默认关闭；绝不会借满三倍额度。
    if constexpr (credit_fraction > 0) {
        const auto leverage = market::set_leverage(2);
        if (leverage.ok) {
            account = market::account();
            const double wanted = std::max(0.0, account.equity * credit_fraction - account.debt);
            const double amount = std::floor(std::min(wanted, account.borrow_capacity) * 100) / 100;
            if (amount >= 10) market::borrow(amount);
        }
        account = market::account();
    }
    const double risk_scale = drawdown >= defensive_drawdown ? .5 : 1.0;
    const double equity = account.equity;
    const auto holdings_at_open = account.shares;
    int immediate_fills = 0, resting_orders = 0;
    for (int i = 0; i < 5; ++i) {
        const auto plan = model(i, account);
        if (!plan) { market::log(plan.error()); continue; }
        const auto& p = *plan;
        // 单股库存上限35%，单边单刻最多投入15%，分散至五股。
        const double held = holdings_at_open[i] * p.reference;
        const int sell_qty = std::min(holdings_at_open[i], std::max(1, quantity(equity * order_fraction * risk_scale, p.ask)));
        if (sell_qty > 0) {
            const auto r = market::limit_sell(symbols[i], sell_qty, p.ask, 1);
            immediate_fills += r.filled;
            resting_orders += r.order_id != 0;
            if (!r.ok) market::log(r.message);
        }
        // 卖单可能立即成交，重新查现金；预留$2消除摘要四舍五入误差。
        const auto fresh = market::account();
        const double room = std::max(0.0, equity * position_cap * risk_scale - held);
        const int buy_qty = std::min({quantity(room, p.bid),
            quantity(fresh.available_cash - cash_buffer, p.bid),
            quantity(equity * order_fraction * risk_scale, p.bid)});
        if (buy_qty > 0 && !fresh.liquidating) {
            const auto r = market::limit_buy(symbols[i], buy_qty, p.bid, 1);
            immediate_fills += r.filled;
            resting_orders += r.order_id != 0;
            if (!r.ok) market::log(r.message);
        }
    }
    const auto final = market::account();
    market::memory_set(memory_key, market::Json::Object{{"peak", peak}, {"cooldown", cooldown}, {"rounds", rounds}});
    market::log("Tick " + std::to_string(final.tick) +
        " | equity $" + std::to_string(final.equity) +
        " | investment $" + std::to_string(final.investment) +
        " | debt $" + std::to_string(final.debt) +
        " | drawdown " + std::to_string(drawdown * 100) + "%" +
        " | immediate shares " + std::to_string(immediate_fills) +
        " | live orders " + std::to_string(resting_orders));
    return 0;
}
} // namespace hunter

int main() {
    try { return hunter::run(); }
    catch (const std::exception& e) { market::log(std::string("Strategy stopped: ") + e.what()); return 1; }
}
