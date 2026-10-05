# 交易街 · C++23 策略接口

公开新闻接口：`std::vector<market::News> market::news(int count=50)`，条数范围 1–100，按发布时间倒序返回。`News` 字段为 `tick, direction, symbol, title, body`。股票行业利好 `direction=1`，利空 `-1`，其他事件 `0` 且 `symbol` 为空。只返回当时已发布、网页可见的消息，不含内部估值或精确冲击幅度；此快捷接口最多取最近 100 条。完整档案请用 `events(0)` 或分页。玩家机器可以在消息发布的当刻查询，但速度派交易者已经先执行。

## 完整数据接口（新增）

以下均返回 `market::Json`，保留原始字段与数值精度。现有 `account()` / `stock()` 等强类型接口仍可使用；详细成本、冻结、行业等字段用以下接口查询。新接口需要启动新版服务并重新编译策略。

| C++ 函数 | 返回数据 |
|---|---|
| `market_info()` | 当前刻、阶段、是否进行中、人数、玩家 ID、成交/活动统计、目标状态、交易者类型、规则 |
| `rules()` | 货币、股票列表、现金和融资利率、技能收入、融资档位、强平/恢复线、手续费、消息与报告周期/延迟、目标及调用限制 |
| `player_info()` | 自己的完整账户：平均成本、现金/冻结/可用现金、股份/冻结/可卖股份、逐股市值和浮盈、初始净资产、已实现盈亏、累计收入和融资成本、保证金等 |
| `stocks()` | 全部股票的行业、颜色、开盘基准、价格、公开估值、上一收盘、成交量额、配置波动参数、技术指标及保存的 K 线数量 |
| `trader(id)` | 指定交易者的公开资料、账户、持仓、类型、已公开行为和图鉴信息 |
| `traders(count=100, offset=0)` | 按 ID 正序分页的交易者资料，包含玩家；`count=0` 全部 |
| `raw_book(symbol, count=100, offset=0)` | `buy/sell` 逐笔挂单，含订单 ID、所有者、价格、数量、原始数量、方向、时间、过期刻与类型；各侧分别按价格/时间优先分页 |
| `trades(count=100, offset=0, symbol="")` | 本局全部公开成交档案；可按股票筛选 |
| `my_trades(count=100, offset=0, symbol="")` | 自己的全部成交，额外含买卖方向和成交额 |
| `events(count=100, offset=0)` | 本局全部公开事件/新闻档案，含 ID、时间、标题、正文、股票和方向 |
| `equity_history(count=200, offset=0)` | 自己的净资产历史，时间正序；包含 `tick, equity, complete`，当前正在进行的刻标为未完成 |
| `ledger(count=100, offset=0)` | 私人资金流水：借款、还款、现金利息/技能收入、融资利息、买卖成交；含余额、负债、净资产、金额、现金/负债变化与明细 |
| `bot_info()` | 自己程序的状态、编译情况、源码、运行限制、保留的运行记录与输出 |
| `memory_keys()` | 自己策略保存的全部记忆键，再用 `memory_get(key)` 读取对应完整数据 |
| `snapshot()` | 一次读取市场概况、完整自己账户、股票摘要、全部交易者公开资料、当前所有挂单、近期事件和成交、机器状态 |

分页条数 `count` 范围为 0–100000，`offset` 为非负整数；`count=0` 取偏移后的全部。成交、事件、资金流水和挂单内的序列 ID 可用于增量读取；成交/事件/流水按最新在前。`equity_history` 和 `traders` 的偏移从最早记录 / 最小 ID 起算。`raw_book` 不合并同价挂单，会包含自己的订单；撮合仍跳过自成交。

`snapshot()` 是当前状态快照，近期成交只附带最近 100 笔，事件最近 100 条；它不代替档案接口。市场成交和新闻不再因网页展示条数而丢失。私人流水在新版开局后记录，`income.details` 分列 `cashInterest` 和 `skillIncome`，`loan_interest` 的 `cashDelta=0`、`debtDelta>0`（利息资本化）；`borrow/repay` 同时改变现金和负债。当前字段使用服务端 camelCase 命名。

```cpp
auto own = market::player_info();
double costA = own["cost"].array()[0].number();
int availableA = own["availableShares"].array()[0].integer();
auto positions = own["positions"].array();
double floatingA = positions[0]["unrealized"].number();
double loanRate = market::rules()["loanRate"].number();
auto latestTrades = market::trades(100, 0, "A");
auto wholeLedger = market::ledger(0);
market::log(latestTrades.dump());
```

公开资料采用明确字段列表，不暴露 NPC 的内部估值、随机状态、风险偏好、私有估值偏差或未来决策。图鉴已公开的内幕者身份及其掌握股票列表可以查询，精确内部估值仍属于该 NPC 私人信息。你的完整账户、成交、流水、源码和策略记忆仅来自当前游戏连接。完整 K 线继续用 `history(symbol, 0)` 获取。

双击项目根目录的「启动炒股游戏.bat」，在网页底部的「量化自动机器」中导入 `.cpp`，或填写电脑文件的绝对路径，再点击编译。勾选「下一刻启用自动机器」后，每次推进都会启动一个全新的程序，`main()` 退出才进入普通交易者阶段并完成本刻。可以逐刻启停，也可以点击「本刻跳过机器并推进」。

本机需要 Node.js 22+ 和支持 C++23 的 g++ / clang++。程序使用 `-std=c++23 -O2` 编译；本项目已用 g++ 15.2 验证。游戏自动寻找编译器，也可通过环境变量 `MARKET_CXX` 指定编译器完整路径。SDK 是单文件头文件，不需要下载依赖。示例位于 `strategies/example.cpp`。

## 最小策略

```cpp
#include "market.hpp"
int main() {
    auto a = market::account();
    auto b = market::book("A");
    if (!a.liquidating && a.shares[0] < 10 &&
        !b.sell.empty() && a.available_cash > b.sell[0].price) {
        auto r = market::buy("A", 1);
        market::log(r.message);
    }
    return 0;
}
```

所有接口在 `market` 命名空间。查询同步返回当前数据，交易同步执行；每次交易后再次查询账户可看到变化。价格/现金均为游戏美元，数量为整数股。A–E 对应 `shares[0]`–`shares[4]`。

## 回合顺序与数据时点

1. 生成新周期，处理过期订单，所有人获得现金利息和技能收入；融资利息计入玩家负债，并检查强平。
2. 更新内部估值、行业消息和滞后的公开估值。
3. 速度派量化先交易。
4. 启动玩家程序。此时 `phase()` 返回 `"player-bot"`，当前 K 线尚未完成。
5. 程序退出，其他交易者按随机顺序交易，再检查强平并封存 K 线。

`stock()` 的现价、盘口、成交量包含本刻已发生的交易。`history()` 包含当前未完成周期，请用 `complete` 过滤。内置趋势指标仅使用已经完成的历史 K 线，盘口不平衡使用实时盘口。玩家接口不提供内幕估值、未来行情或 NPC 的私有决策状态。

## 查询接口

| 函数 | 返回与用途 |
|---|---|
| `int tick()` | 当前刻数 |
| `std::string phase()` | 当前阶段 |
| `Account account()` | 账户、现金、融资与持仓 |
| `Stock stock(symbol)` | 股票价格、公开估值、成交量及指标 |
| `std::vector<Candle> history(symbol, count=200, timeframe=1, offset=0)` | 完整保存的历史；`count=0` 获取全部，`offset` 向前跳过多少个周期 |
| `Book book(symbol, depth=10)` | 同价聚合盘口；买盘价格降序，卖盘升序；深度 1–1000 |
| `Json orders()` | 玩家挂单数组 |
| `Json rankings(mode="equity")` | 全体排行；`equity` 净资产、`return` 总收益率、`trading` 投资收益率 |

`Account` 字段：`tick, cash, available_cash, equity, debt, investment, borrow_capacity, margin_ratio, finance_costs, total_income, liquidating, shares`。`equity` 已扣负债；`investment` 已剔除被动收入并包含融资成本。账户接口保留内部精度，网页金额摘要显示到分。

`Stock` 字段：`symbol, price, public_value, previous, volume, turnover, indicators`。`previous` 为上一完成周期收盘价；`public_value` 为所有人可见的公开估值，不能当作内部价格。

`Indicators` 字段：`sma5, sma20, ema12, rsi14, volatility, regression_slope, regression_r2, bollinger_upper, bollinger_lower, z_score, imbalance, momentum`。`volatility` 是最多 60 个已完成周期的对数收益标准差；回归使用最多 24 个收盘价，RSI 使用最多 14 次变化，布林带使用最多 20 个收盘价；样本不足时使用已有样本。`imbalance` 是买卖前 10 笔挂单的股数差除以总股数，范围 −1 到 1。各指标是明确实现的游戏指标，不是未来预测保证。

`Candle` 字段：`tick, end_tick, open, high, low, close, volume, turnover, trades, vwap, complete`。VWAP 为成交额÷成交量；无成交时取收盘价。聚合按 `floor(tick/timeframe)` 分组，开盘参考周期为第 0 刻，5 刻周期第一组为第 0–4 刻。数据按时间正序返回。`count` 为 0–100000，周期为 1–1000。

`Book` 的 `buy/sell` 是 `std::vector<Level>`，档位字段为 `price, qty`。盘口会包含自己的挂单，但撮合会跳过自成交。

## 交易、挂单与融资

| 函数 | 用途 |
|---|---|
| `Result buy(symbol, qty)` / `sell(symbol, qty)` | 市价买卖；按实际对手盘逐档成交，剩余取消 |
| `Result limit_buy(symbol, qty, price, ttl=30)` / `limit_sell(...)` | 限价单，到达即尝试撮合，剩余挂单；有效期 1–1000 刻 |
| `Result cancel_order(id)` | 撤销自己的指定订单 |
| `Result cancel_all()` | 撤销自己的全部挂单 |
| `Result set_leverage(value)` | 融资上限 1、2、3 倍；已有负债可能阻止降档 |
| `Result borrow(amount)` | 在可借额度内借款，增加现金与负债，净资产不变 |
| `Result repay(amount)` | 使用可用现金还款，最多归还现有负债 |

`Result` 字段：`ok, filled, order_id, remaining, amount, message`。`order_id=0` 表示没有剩余挂单。市价单 `remaining` 是未成交股数；限价单是剩余挂单股数。普通交易失败通过 `ok=false` 返回，请检查 `message`。非法查询参数、断开的游戏连接等会抛 `std::exception`，建议在 `main()` 捕获并日志输出。

买单冻结价格×剩余股数，卖单冻结剩余股数；冻结资产仍属于玩家，不能重复使用。市价买单要求现金足以支付本次可成交的所有数量，不会自动借款或自动缩单。市场不支持卖空。借款利率每刻 0.05%，现金利息每刻 0.01%；技能收入另加 $3/刻。

可借额度 `max(0, (融资上限−1)×净资产−负债)`。保证金比例 `净资产÷总资产` 低于 25% 触发强平：先撤单、用现金还款，再通过真实买盘卖出必要持仓，恢复至 35% 即停止。没有对手盘会保留持仓和负债，在后续回合重试；不能凭空变现。强平期间禁止买入、借款。

## 跨回合记忆与输出

```cpp
int n = market::memory_get("rounds").integer();
market::memory_set("rounds", n + 1);
market::log("已经运行 " + std::to_string(n + 1) + " 刻");
// 支持任意 JSON 对象/数组：
market::memory_set("state", market::Json::Object{{"last_price", 100.0}, {"enabled", true}});
double last = market::memory_get("state")["last_price"].number();
```

每刻都是新进程，普通变量、`static` 变量不保留。`memory_get/set` 的数据在本局服务器内存中保留，单项最大 100 KB，重新开局或关闭服务后清空。`Json` 提供 `number(), integer(), boolean(), string(), array(), is_null(), operator[](key), parse(), dump()`；JSON 数组通过 `.array()[i]` 访问。

日志建议使用 `market::log()`（写到标准错误）；一般标准输出也会显示。标准输入输出用于接口协议，不要自行读写 `@market ` 协议行，不要自行读取 `std::cin`。SDK 自带互斥锁串行处理接口调用；不同线程的普通标准输出不要干扰协议。

## 文件、启停与运行限制

- 「导入电脑 .cpp 文件」将源码读入编辑器；点击编译才执行编译。通过绝对路径「读取并编译」还会把原文件夹加入头文件搜索路径，可使用相邻自定义头文件。当前编译单个 `.cpp`，不自动构建多文件工程。
- 成功编译后仍需手动开启机器人；编译失败会清除旧的可执行程序绑定，避免误跑旧策略。
- 每刻运行上限可设 1–120 秒，默认 10 秒；超时、异常退出或主动停止会关闭机器人，随后完成市场回合。已经执行的交易保留。
- 「暂停推进」停止启动下一刻；当前正在运行的程序继续。要立即结束当前程序，使用「停止本刻程序 / 关闭机器」。
- 每刻最多 2000 次接口调用、2 MB 输出；程序会在本机原生运行，能访问电脑文件与网络，没有隔离沙箱，只运行自己信任的代码。
- 编译产生的源码和程序位于 `market-game/runtime/`，运行目录是本局程序文件夹。游戏资产只存在本局服务器内存；关闭服务器会结束本局。
