/* =========================================================
   MARKET FOR LEMONS (Akerlof 1970)
   =========================================================
   Half the team sells used cars, half buys. Each round every seller gets
   one car — good or a lemon, 50/50 — and only they know which. With
   these values a buyer who can't see quality pays on average
   (100 + 30) / 2 = 65, below the 80 a good car's owner needs: good cars
   should leave the market. In the last round a seller may pay for an
   honest inspection that is shown on the lot.

   A round: { lots: [{ seller, lot, quality, price, selling, cert, buyer }],
              order: [buyer names in the order they pick], picks: { buyer: lot | 'pass' },
              revealed }
========================================================= */
import { mean, percent, sum } from './stats.js';

export const LM_VALUES = {
  good: { seller: 80, buyer: 100, label: 'хорошая' },
  lemon: { seller: 10, buyer: 30, label: 'лимон' },
};
export const LM_ROUNDS = 4;
export const LM_CERT_ROUND = 4; // 1-based
export const LM_CERT_COST = 5;
export const LM_MAX_PRICE = 150;
export const LM_P_GOOD = 0.5;

const shuffle = (xs, rand) => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Sellers are the smaller half: an odd person out becomes a buyer.
export function splitMarket(names, rand = Math.random) {
  const s = shuffle(names, rand);
  const n = Math.floor(s.length / 2);
  return { sellers: s.slice(0, n), buyers: s.slice(n) };
}

// Every round is drawn up front (qualities, lot numbers, buying order), so a
// restored draft replays exactly the same market.
export function drawRounds({ sellers, buyers }, rand = Math.random) {
  return Array.from({ length: LM_ROUNDS }, () => {
    const lotNumbers = shuffle(
      sellers.map((_, i) => i + 1),
      rand,
    );
    return {
      lots: sellers.map((seller, i) => ({
        seller,
        lot: lotNumbers[i],
        quality: rand() < LM_P_GOOD ? 'good' : 'lemon',
        price: null,
        selling: true,
        cert: false,
        buyer: null,
      })),
      order: shuffle(buyers, rand),
      picks: {},
      revealed: false,
    };
  });
}

export const onShowcase = (lot) => lot.selling && lot.price !== null;

// The next buyer to pick, or null when everyone has.
export const nextBuyer = (round) => round.order.find((b) => !(b in round.picks)) ?? null;

export function roundStats(round) {
  const listed = round.lots.filter(onShowcase);
  const sold = listed.filter((l) => l.buyer);
  const good = (xs) => xs.filter((l) => l.quality === 'good').length;
  const gain = (l) => LM_VALUES[l.quality].buyer - LM_VALUES[l.quality].seller;
  const certs = round.lots.filter((l) => l.cert).length;
  return {
    listed: listed.length,
    sold: sold.length,
    goodListed: good(listed),
    goodSold: good(sold),
    goodShareListed: percent(good(listed), listed.length),
    goodShareSold: percent(good(sold), sold.length),
    avgPrice: sold.length ? Math.round(mean(sold.map((l) => l.price))) : null,
    surplus: sum(sold.map(gain)) - certs * LM_CERT_COST,
    maxSurplus: sum(round.lots.map(gain)),
  };
}

// What each person made over all rounds (a seller who keeps the car gets 0).
export function lemonsPayoffs(rounds, { sellers, buyers }) {
  const total = new Map([...sellers, ...buyers].map((n) => [n, 0]));
  for (const round of rounds) {
    if (!round.revealed) continue;
    for (const l of round.lots) {
      const v = LM_VALUES[l.quality];
      let seller = l.cert ? -LM_CERT_COST : 0;
      if (l.buyer && onShowcase(l)) {
        seller += l.price - v.seller;
        total.set(l.buyer, total.get(l.buyer) + v.buyer - l.price);
      }
      total.set(l.seller, total.get(l.seller) + seller);
    }
  }
  return total;
}

export function lemonsResults(rounds, market) {
  const played = rounds.filter((r) => r.revealed);
  if (!played.length) return null;
  const stats = rounds.map((r) => (r.revealed ? roundStats(r) : null));
  const payoffs = lemonsPayoffs(rounds, market);
  const surplus = sum(stats.filter(Boolean).map((s) => s.surplus));
  const maxSurplus = sum(stats.filter(Boolean).map((s) => s.maxSurplus));
  return {
    stats,
    goodSoldByRound: stats.map((s) => s?.goodShareSold ?? null),
    goodListedByRound: stats.map((s) => s?.goodShareListed ?? null),
    avgPriceByRound: stats.map((s) => s?.avgPrice ?? null),
    surplusPct: percent(surplus, maxSurplus),
    people: [...payoffs].map(([name, total]) => ({
      name,
      role: market.sellers.includes(name) ? 'Продавец' : 'Покупатель',
      total,
    })),
  };
}

// The private message for a seller.
export function lemonsMessage(roundIdx, lot) {
  const v = LM_VALUES[lot.quality];
  const lines = [
    `Рынок «лимонов» · раунд ${roundIdx + 1}`,
    `Ваша машина (лот ${lot.lot}): ${v.label.toUpperCase()}.`,
    `Для вас она стоит ${v.seller}: столько вы получите, если оставите её себе.`,
    `Для покупателя она стоила бы ${v.buyer}, но он этого не знает.`,
    '',
    `Пришлите мне цену (0–${LM_MAX_PRICE}) или «не продаю». Говорить покупателям можно что угодно.`,
  ];
  if (roundIdx + 1 === LM_CERT_ROUND)
    lines.push(
      '',
      `Новое: можно заплатить ${LM_CERT_COST} за независимую проверку. На лоте появится честная отметка о качестве.`,
      'Пришлите цену и «с проверкой» / «без проверки».',
    );
  return lines.join('\n');
}
