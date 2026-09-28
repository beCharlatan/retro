/* =========================================================
   BEER GAME (MIT, Forrester; Sterman 1989) — the supply-chain engine
   =========================================================
   Four links: Магазин → Оптовик → Дистрибьютор → Пивоварня. Customer
   demand is 4 cases a week for four weeks, then 8 until the end — the
   only change in the whole game. Each week every link:
     1. receives the shipment sent from upstream SHIP_DELAY weeks ago;
     2. sees its incoming order (the shop: customer demand; the others:
        the order their downstream link placed ORDER_DELAY weeks ago);
     3. ships min(stock, order + backlog), the rest stays as backlog;
     4. pays 0.5 per case in stock and 1 per case of backlog;
     5. orders from upstream (the brewery: brews, ready in BREW_DELAY weeks).
   The chain starts in balance (12 in stock, 4 in every pipeline slot).

   The game state is never stored: it is replayed from the orders every
   time (`orders[w]` = the four orders placed in week w+1), which keeps
   a restored draft exact and the logic pure.
========================================================= */

export const BG_ROLES = [
  {
    id: 'shop',
    name: 'Магазин',
    from: 'Покупатели купили',
    supplier: 'Оптовика',
    ask: 'Сколько заказать у Оптовика?',
  },
  {
    id: 'wholesale',
    name: 'Оптовик',
    from: 'Заказ от Магазина',
    supplier: 'Дистрибьютора',
    ask: 'Сколько заказать у Дистрибьютора?',
  },
  {
    id: 'distributor',
    name: 'Дистрибьютор',
    from: 'Заказ от Оптовика',
    supplier: 'Пивоварни',
    ask: 'Сколько заказать у Пивоварни?',
  },
  {
    id: 'brewery',
    name: 'Пивоварня',
    from: 'Заказ от Дистрибьютора',
    supplier: 'варки',
    ask: 'Сколько поставить в варку?',
  },
];
export const BG_WEEKS = 24;
export const BG_SHIP_DELAY = 2;
export const BG_ORDER_DELAY = 2;
export const BG_BREW_DELAY = 2;
export const BG_STOCK = 12;
export const BG_PIPE = 4;
export const BG_HOLDING = 0.5;
export const BG_BACKLOG = 1;
export const BG_DEMAND_BEFORE = 4;
export const BG_DEMAND_AFTER = 8;
export const BG_STEP_WEEK = 5;

export const bgDemand = (week) => (week < BG_STEP_WEEK ? BG_DEMAND_BEFORE : BG_DEMAND_AFTER);

function initial() {
  return {
    week: 0,
    stock: [BG_STOCK, BG_STOCK, BG_STOCK, BG_STOCK],
    backlog: [0, 0, 0, 0],
    // incoming[i]: what is on its way TO link i, next arrival first (for the brewery: the brew)
    incoming: [0, 1, 2, 3].map((i) => Array(i === 3 ? BG_BREW_DELAY : BG_SHIP_DELAY).fill(BG_PIPE)),
    // mail[i]: orders link i placed that haven't reached link i+1 yet
    mail: [0, 1, 2].map(() => Array(BG_ORDER_DELAY).fill(BG_PIPE)),
    cost: [0, 0, 0, 0],
    history: [],
  };
}

// Steps 1–4 of week `s.week + 1` for every link; returns what each link sees before ordering.
function runWeek(s) {
  s.week += 1;
  const view = [];
  for (let i = 0; i < 4; i++) {
    const arrived = s.incoming[i].shift();
    s.stock[i] += arrived;
    const order = i === 0 ? bgDemand(s.week) : s.mail[i - 1].shift();
    const owedBefore = s.backlog[i];
    const need = order + owedBefore;
    const shipped = Math.min(s.stock[i], need);
    s.stock[i] -= shipped;
    s.backlog[i] = need - shipped;
    if (i > 0) s.incoming[i - 1].push(shipped);
    const weekCost = BG_HOLDING * s.stock[i] + BG_BACKLOG * s.backlog[i];
    s.cost[i] += weekCost;
    view.push({
      arrived,
      order,
      owedBefore,
      shipped,
      stock: s.stock[i],
      backlog: s.backlog[i],
      weekCost,
    });
  }
  // what each link has coming and still in the mail — after this week's shipments
  view.forEach((v, i) => {
    v.inTransit = s.incoming[i].slice();
    v.inMail = i < 3 ? s.mail[i].slice() : [];
    v.owedToYou = i < 3 ? s.backlog[i + 1] : 0; // the supplier's backlog — owed to this link
    v.totalCost = s.cost[i];
  });
  return view;
}

function placeOrders(s, orders) {
  for (let i = 0; i < 4; i++) {
    if (i < 3) s.mail[i].push(orders[i]);
    else s.incoming[3].push(orders[i]);
  }
}

// Replays `orders` (week by week) and runs the next week up to the moment of ordering.
// → { week, views: [4 link views], history, cost }  (week = BG_WEEKS + 1 means the game is over)
export function simulate(orders) {
  const s = initial();
  const history = [];
  let views = null;
  for (let w = 0; w < orders.length; w++) {
    views = runWeek(s);
    history.push({ week: s.week, demand: bgDemand(s.week), views, orders: orders[w] });
    placeOrders(s, orders[w]);
  }
  const current = orders.length < BG_WEEKS ? runWeek(s) : null;
  return { week: s.week, views: current, history, cost: s.cost.slice() };
}

// A private weekly summary for one link (plain text for a messenger).
export function bgMessage(week, roleIdx, v) {
  const role = BG_ROLES[roleIdx];
  const brewery = roleIdx === 3;
  const lines = [
    `Пивная игра · неделя ${week} · ${role.name.toUpperCase()}`,
    `${brewery ? 'Пришло с варки' : `Пришло от ${role.supplier}`}: ${v.arrived}`,
    `${role.from}: ${v.order}${v.owedBefore ? ` (+ долг с прошлой недели ${v.owedBefore})` : ''}`,
    `Отгружено: ${v.shipped}`,
    `Склад: ${v.stock} · Долг: ${v.backlog}`,
    `Затраты за неделю: ${fmt(v.weekCost)} · всего: ${fmt(v.totalCost)}`,
    `${brewery ? 'В варке' : 'В пути к вам'}: ${v.inTransit.join(', потом ')}`,
  ];
  if (!brewery)
    lines.push(`Ваши заказы, ещё не дошедшие до ${role.supplier}: ${v.inMail.join(', ')}`);
  lines.push('', `${role.ask} Ответьте одним числом.`);
  return lines.join('\n');
}

const fmt = (n) => String(n).replace('.', ',');

// ---------- the benchmark ----------
// A simple, sane robot for every link: order what is being ordered from you, plus 10%
// of the gap between 30 and "stock − backlog + everything already ordered and on its way".
// The point of the rule is that it REMEMBERS the supply line — what people forget.
export const BG_BENCHMARK_RULE = { target: 30, adjust: 0.1 };

export function benchmarkOrders(weeks = BG_WEEKS) {
  const orders = [];
  for (let w = 0; w < weeks; w++) {
    const { views } = simulate(orders);
    orders.push(
      views.map((v) => {
        const supplyLine =
          v.inTransit.reduce((a, b) => a + b, 0) +
          v.inMail.reduce((a, b) => a + b, 0) +
          v.owedToYou;
        const gap = BG_BENCHMARK_RULE.target - (v.stock - v.backlog + supplyLine);
        return Math.max(0, Math.round(v.order + BG_BENCHMARK_RULE.adjust * gap));
      }),
    );
  }
  return orders;
}

export function bgTotal(cost) {
  return cost.reduce((a, b) => a + b, 0);
}

export const BG_BENCHMARK_COST = bgTotal(simulate(benchmarkOrders()).cost);

// Everything the results screen needs, from the orders placed and the forecasts.
// forecasts: [{ name, shape: 'flat'|'step'|'waves'|'upDown'|null, peak: number|null }]
export function beerResults(orders, forecasts = []) {
  if (!orders.length) return null;
  const { history, cost } = simulate(orders);
  const ordersByRole = [0, 1, 2, 3].map((i) => orders.map((o) => o[i]));
  const netStock = [0, 1, 2, 3].map((i) =>
    history.map((h) => h.views[i].stock - h.views[i].backlog),
  );
  const answered = forecasts.filter((f) => f.shape);
  const peaks = forecasts.map((f) => f.peak).filter((p) => p !== null && p !== undefined);
  const teamCost = bgTotal(cost);
  return {
    weeks: history.length,
    demand: history.map((h) => h.demand),
    ordersByRole,
    netStock,
    maxOrderByRole: ordersByRole.map((xs) => Math.max(...xs)),
    costByRole: cost,
    teamCost,
    benchmarkCost: BG_BENCHMARK_COST,
    ratio: Math.round((teamCost / BG_BENCHMARK_COST) * 10) / 10,
    wavesShare: answered.length
      ? Math.round(
          (answered.filter((f) => f.shape === 'waves' || f.shape === 'upDown').length /
            answered.length) *
            100,
        )
      : null,
    avgGuessMax: peaks.length
      ? Math.round((peaks.reduce((a, b) => a + b, 0) / peaks.length) * 10) / 10
      : null,
  };
}
