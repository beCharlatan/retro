/* =========================================================
   RESULTS COPY — what the headline number means
   =========================================================
   Every game's results screen opens with one big number. On its own
   it isn't self-explanatory ("44%" of what? is that a lot?), so each
   one is followed by three short lines (see renderReveal() in
   game-shell.js):

     ЧТО ЭТО          — what exactly was counted, in plain words
     КАК ЧИТАТЬ       — the benchmark: what "no effect" and "a strong
                        effect" look like for this number
     У ВАШЕЙ КОМАНДЫ  — a verdict for THIS team, from its own data

   The copy lives here, not in the game files, because it is pure
   text-from-numbers (unit-testable in test/unit/reveal-copy.test.js)
   and because all 13 games need the same three-part shape. Every
   function takes a plain object of numbers and returns
   { what, read, verdict } — `verdict` is null until there is data.
========================================================= */

import { plural } from './logic/format.js';

const pp = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n))} п.п.`;

export const REVEAL_COPY = {
  // r: { lowAvg, highAvg } — average guesses (numbers, %) of people whose
  // step-1 number was below 50 / 50 and above; null when a group is empty.
  anchoring(r) {
    const what =
      'Правильный ответ на вопрос «какой процент стран ООН — африканские»: 54 из 193 стран, то есть 28%.';
    const read =
      'Точность тут не главное. Смотрим на другое: если те, кто перед этим видел большое случайное число, называют в среднем больше, чем те, кто видел маленькое, — это и есть эффект якоря.';
    if (!r) return { what, read, verdict: null };
    if (r.lowAvg === null || r.highAvg === null) {
      return {
        what,
        read,
        verdict:
          'Все числа из шага 1 оказались по одну сторону от 50 — сравнить «малый» и «большой» якорь не с чем. Посмотрите на график ниже: он показывает связь числа и оценки для каждого человека.',
      };
    }
    const diff = r.highAvg - r.lowAvg;
    const head = `С малым числом (до 49) в среднем называли ${r.lowAvg}%, с большим (50 и выше) — ${r.highAvg}%. Разница ${pp(diff)}.`;
    let tail;
    if (diff >= 10) tail = ' Якорь сработал: случайное число заметно сдвинуло оценки.';
    else if (diff >= 4) tail = ' Небольшой сдвиг в сторону якоря — эффект есть, но слабый.';
    else
      tail =
        ' Заметного сдвига нет — в маленькой команде так бывает, эффект проявляется на больших выборках.';
    return { what, read, verdict: head + tail };
  },

  // r: { totalCorrect, totalAnswered, worst: { short, pct } | null, questionCount }
  availability(r) {
    const what =
      'Доля ответов, где человек интуитивно угадал, какая из двух причин смерти встречается чаще — по всем вопросам и всем участникам сразу.';
    const read =
      'Если просто гадать, выйдет 50%. Заметно ниже 50% — интуиция системно тянет к ярким, «новостным» причинам: это и есть эвристика доступности. Заметно выше — вы знаете статистику лучше, чем подсказывают заголовки.';
    if (!r?.totalAnswered) return { what, read, verdict: null };
    const pct = (r.totalCorrect / r.totalAnswered) * 100;
    const head = `Верно ${r.totalCorrect} из ${r.totalAnswered} ответов.`;
    let tail;
    if (pct < 40) tail = ' Ниже случайного: команду уверенно уводят громкие новости.';
    else if (pct <= 60)
      tail = ' На уровне подбрасывания монетки: по ощущению вы не отличаете частое от громкого.';
    else tail = ' Команда знает реальную статистику лучше, чем подсказывают заголовки.';
    const worst =
      r.worst && r.questionCount > 1
        ? ` Сложнее всего — «${r.worst.short}»: верно только ${r.worst.pct}%.`
        : '';
    return { what, read, verdict: head + tail + worst };
  },

  // r: { avg } — mean accuracy rating, 0..5.
  barnum(r) {
    const what =
      'Средняя оценка того, насколько описание «попало» в человека, по шкале от 0 («совсем не про меня») до 5 («точно про меня»).';
    const read =
      'Все получили один и тот же текст, так что «про меня» он быть не мог. Всё, что выше 3, — общий текст принят за личный: это и есть эффект Барнума. В опыте Форера (1949) средняя оценка была 4,26.';
    if (!r) return { what, read, verdict: null };
    let tail;
    if (r.avg >= 3.5)
      tail = 'Эффект сработал: команда в среднем узнала себя в тексте, написанном для всех.';
    else if (r.avg >= 2.5) tail = 'Умеренно: часть команды узнала себя, часть отнеслась скептично.';
    else
      tail =
        'Команда отнеслась к тексту скептичнее, чем студенты Форера, — эффект слабее обычного.';
    return { what, read, verdict: `${r.avg.toFixed(2)} из 5 — ${tail}` };
  },

  // r: { hitPct, totalHits, totalAnswered } — hitPct is null if nothing answered.
  calibration(r) {
    const what =
      'Как часто правильный ответ действительно оказывался внутри диапазона, про который человек сказал «я на 90% уверен» — по всем вопросам и всем участникам.';
    const read =
      'У идеально откалиброванного человека это около 90%: девять диапазонов из десяти накрывают правду. Обычно выходит 40–60% — мы называем слишком узкие диапазоны и слишком уверены в своих знаниях.';
    if (!r || r.hitPct === null) return { what, read, verdict: null };
    const head = `Правильный ответ попал в диапазон ${r.totalHits} раз из ${r.totalAnswered}.`;
    let tail;
    if (r.hitPct >= 80)
      tail = ' Отличная калибровка: уверенность команды почти совпадает с реальностью.';
    else if (r.hitPct >= 60) tail = ' Близко к идеалу: небольшая самоуверенность.';
    else tail = ` Самоуверенность: ваши «90% уверен» на деле работают как «примерно ${r.hitPct}%».`;
    return { what, read, verdict: head + tail };
  },

  // r: { pct, worse, total } — share of personal guesses worse than the team mean.
  crowdWisdom(r) {
    const what =
      'Доля личных оценок, которые оказались дальше от правильного ответа, чем среднее по команде на том же вопросе. Считаем все три вопроса вместе.';
    const read =
      '50% значит, что усреднение ничем не лучше случайного участника. Чем ближе к 100%, тем сильнее «мудрость толпы»: среднее обыгрывает почти всех по отдельности, потому что личные ошибки в разные стороны гасят друг друга.';
    if (!r || r.pct === null) return { what, read, verdict: null };
    const head = `В ${r.worse} из ${r.total} случаев среднее команды оказалось точнее одного человека.`;
    let tail;
    if (r.pct >= 70) tail = ' Мудрость толпы налицо: усреднение обыграло большинство участников.';
    else if (r.pct > 50) tail = ' Среднее команды в плюсе, но перевес небольшой.';
    else tail = ' В этот раз среднее не помогло: ошибки участников шли в одну сторону.';
    return { what, read, verdict: head + tail };
  },

  // r: { avgR1, avgR2, delta, pot } — average given amounts and their change.
  dictator(r) {
    const what =
      'Разница между средней суммой, которую участники отдали в раунде 2 (решение видно всем), и в раунде 1 (решение анонимное): раунд 2 минус раунд 1.';
    const read =
      'Ноль — анонимность ничего не меняла. Плюс — под взглядом других делились щедрее: значит, часть щедрости была про репутацию, а не про сам поступок. Минус — анонимно делились охотнее.';
    if (!r) return { what, read, verdict: null };
    const head = `Раунд 1: в среднем ${Math.round(r.avgR1)} ₽, раунд 2: ${Math.round(r.avgR2)} ₽ (из ${r.pot} ₽).`;
    let tail;
    if (Math.abs(r.delta) < r.pot * 0.03)
      tail = ' Почти без изменений: щедрость команды не зависела от того, смотрят ли на неё.';
    else if (r.delta > 0) tail = ' Открытость сделала команду щедрее — репутация работает.';
    else tail = ' Анонимно делились больше, чем открыто — редкий, но возможный исход.';
    return { what, read, verdict: head + tail };
  },

  // r: { ratio, lots: [{ name, avgWTA, avgWTP, ratio }] } — `ratio` is the average
  // of the per-lot ratios; a lot's ratio is null until both sides priced it.
  endowment(r) {
    const what =
      'Во сколько раз владельцы просили за вещь больше, чем покупатели были готовы заплатить: цену продажи делим на цену покупки для каждого лота (кружка, автомобиль, дом) и усредняем.';
    const read =
      'Вещь одна и та же, так что по логике цены должны совпадать — 1× значит, что эффекта нет. В классических экспериментах владельцы просили в 2–3 раза больше покупателей. Интереснее всего смотреть, как отношение меняется с ценой вещи.';
    if (!r || r.ratio === null) return { what, read, verdict: null };
    const usable = r.lots.filter((l) => l.ratio !== null);
    const perLot = usable.map((l) => `${l.name} ${l.ratio.toFixed(1)}×`).join(', ');
    const head = `По лотам: ${perLot}.`;
    let tail;
    if (r.ratio >= 1.8)
      tail =
        ' Сильный эффект владения — как в классических опытах: своё стоит дороже, просто потому что своё.';
    else if (r.ratio >= 1.2)
      tail = ' Заметный эффект владения: владельцы оценивают вещь выше покупателей.';
    else tail = ' Эффект почти не проявился: цены продавца и покупателя близки.';
    if (usable.length >= 2) {
      const first = usable[0].ratio;
      const last = usable.at(-1).ratio;
      if (first - last >= 0.4)
        tail += ` Чем дороже вещь, тем слабее разрыв (${usable[0].name} ${first.toFixed(1)}× → ${usable.at(-1).name} ${last.toFixed(1)}×): к крупным покупкам мы относимся расчётливее, чем к мелким.`;
      else if (last - first >= 0.4)
        tail += ` Чем дороже вещь, тем сильнее разрыв (${usable[0].name} ${first.toFixed(1)}× → ${usable.at(-1).name} ${last.toFixed(1)}×): чем больше ставка, тем сильнее привязанность к своему.`;
    }
    return { what, read, verdict: head + tail };
  },

  // r: { realYesPct, yesAvg, noAvg } — real share of «yes», and average forecasts by group.
  falseConsensus(r) {
    const what = 'Доля людей в команде, которые на самом деле ответили «да».';
    const read =
      'Ложный консенсус — когда мы думаем, что остальные согласны с нами чаще, чем на деле. Смотрим не на само число, а на прогнозы: если ответившие «да» ждали заметно больше «да», чем ответившие «нет», — каждый судил по себе.';
    if (!r) return { what, read, verdict: null };
    if (r.yesAvg === null || r.noAvg === null) {
      return {
        what,
        read,
        verdict: 'Ответы у всех совпали, поэтому сравнивать прогнозы двух сторон не с чем.',
      };
    }
    const gap = r.yesAvg - r.noAvg;
    const head = `Ответившие «да» ждали в среднем ${r.yesAvg}% согласных, ответившие «нет» — ${r.noAvg}%. Разрыв ${pp(gap)}.`;
    let tail;
    if (gap >= 15) tail = ' Ложный консенсус налицо: каждая сторона считала «своих» большинством.';
    else if (gap >= 5) tail = ' Эффект есть, но умеренный.';
    else tail = ' Разрыв маленький: команда неплохо угадывала чужое мнение.';
    return { what, read, verdict: head + tail };
  },

  // r: { aRisky, bRisky } — % choosing the risky Program 2 in group A (gain frame)
  // and group B (loss frame); null while a group is empty.
  // r: { rounds: [{ name, gainRisky, lossRisky }], gainRisky, lossRisky } — % who took
  // the gamble under the gain wording and under the loss wording, per scenario
  // and pooled. Everyone hears both wordings (once each), so the two sides are
  // the same people.
  framing(r) {
    const what =
      'Один и тот же выбор с одинаковыми числами подали двумя способами: как выигрыш («спасём», «исправим») и как потерю («погибнут», «пропустим»). Считаем, как часто выбирали рискованный вариант в каждой формулировке — сначала в истории про людей, потом в рабочей ситуации с багами.';
    const read =
      'По логике выбор не должен зависеть от слов. На деле в формулировке выигрыша люди избегают риска, а в формулировке потери готовы рискнуть. Чем больше риска при «потере» по сравнению с «выигрышем», тем сильнее эффект. Смотрите и на рабочий пример: срабатывает ли то же самое на привычных задачах.';
    if (!r || r.gainRisky === null || r.lossRisky === null) return { what, read, verdict: null };
    const diff = r.lossRisky - r.gainRisky;
    const lines = r.rounds
      .filter((x) => x.gainRisky !== null && x.lossRisky !== null)
      .map((x) => `${x.name}: ${x.gainRisky}% → ${x.lossRisky}%`)
      .join('; ');
    const head = `Риск при формулировке выигрыша — ${r.gainRisky}%, при формулировке потери — ${r.lossRisky}% (${pp(diff)}). По сценариям (выигрыш → потеря): ${lines}.`;
    let tail;
    if (diff >= 20) tail = ' Формулировка сработала: те же числа, а решения противоположные.';
    else if (diff > 0) tail = ' Сдвиг в нужную сторону есть, но небольшой.';
    else
      tail =
        ' В этот раз переворота нет — в малых группах так бывает, особенно если несколько человек знали эффект.';
    const work = r.rounds.at(-1);
    if (r.rounds.length > 1 && work.gainRisky !== null && work.lossRisky !== null) {
      const workDiff = work.lossRisky - work.gainRisky;
      if (workDiff >= 15)
        tail += ` На рабочем примере («${work.name}») эффект тоже виден: «потеря» подтолкнула к риску на ${Math.abs(workDiff)} п.п. — те же слова управляют решениями и в проектах.`;
      else if (workDiff <= 0)
        tail += ` На рабочем примере («${work.name}») формулировка не сдвинула решения — профессиональный контекст мог сработать как защита.`;
    }
    return { what, read, verdict: head + tail };
  },

  // r: { avgRatio, accurateCount, overrunCount, total }
  planningFallacy(r) {
    const what =
      'Во сколько раз реальное время в среднем оказалось больше «лучшего случая», который человек называл заранее. 1× — уложились ровно в лучший сценарий, 2× — ушло вдвое дольше.';
    const read =
      'Обычно результат заметно выше 1×: мы планируем по лучшему сценарию и забываем, что что-то пойдёт не так. Ничего необычного в этом нет — так делает большинство людей.';
    if (!r) return { what, read, verdict: null };
    const head = `Почти в план (до 1,3×) уложились ${r.accurateCount} из ${r.total}, а ${r.overrunCount} превысили срок в 1,5 раза и больше.`;
    let tail;
    if (r.avgRatio >= 1.8)
      tail = ' Сильная недооценка: реальные сроки почти вдвое длиннее «лучшего случая».';
    else if (r.avgRatio >= 1.25)
      tail = ' Типичная недооценка: команда планирует оптимистичнее, чем получается.';
    else tail = ' Необычно точно: команда закладывала реальные, а не лучшие сроки.';
    return { what, read, verdict: head + tail };
  },

  // r: { coopR1, coopR2, delta, echoRate }
  prisonersDilemma(r) {
    const what =
      'Как изменилась доля выбравших «Сотрудничать» между раундом 1 (вслепую) и раундом 2 (когда каждый уже знал ход партнёра в первом раунде). В процентных пунктах, раунд 2 минус раунд 1.';
    const read =
      'Плюс — команда стала доверять друг другу больше. Минус — после первого раунда сотрудничать стали реже (партнёр предал, или захотелось предать первым). Обычно ход в раунде 2 зеркалит ход партнёра из раунда 1 — принцип «зуб за зуб».';
    if (!r) return { what, read, verdict: null };
    const head = `Сотрудничали ${r.coopR1}% в раунде 1 и ${r.coopR2}% в раунде 2. Ответным ходом повторили выбор партнёра ${r.echoRate}% участников.`;
    let tail;
    if (r.delta >= 10)
      tail = ' Доверие выросло: увидев ход партнёра, команда стала сотрудничать чаще.';
    else if (r.delta <= -10)
      tail = ' Доверие упало: после первого раунда сотрудничать стало опаснее.';
    else tail = ' Доля почти не изменилась.';
    return { what, read, verdict: head + tail };
  },

  // r: { avgR1, avgR2, delta, stake }
  publicGoods(r) {
    const what =
      'Как изменился средний вклад в общий котёл между раундом 1 и раундом 2: раунд 2 минус раунд 1, в фишках.';
    const read =
      'Ноль — вклады остались прежними. Минус — классическая картина: в первом раунде вкладывают щедро, а увидев, что не все так делают, во втором сокращают вклад. Плюс — команда договорилась и стала вкладывать больше.';
    if (!r) return { what, read, verdict: null };
    const head = `Средний вклад: ${r.avgR1.toFixed(1)} фишек в раунде 1 и ${r.avgR2.toFixed(1)} в раунде 2 (из ${r.stake}).`;
    let tail;
    if (Math.abs(r.delta) < 0.5)
      tail = ' Вклады почти не изменились: команда держалась выбранной линии.';
    else if (r.delta < 0)
      tail = ' Вклады упали: это типичное «угасание кооперации» при повторении игры.';
    else tail = ' Вклады выросли: команда стала кооперироваться охотнее.';
    return { what, read, verdict: head + tail };
  },

  // r: { deals, total, avgOffer, avgMin }
  ultimatum(r) {
    const what =
      'Какая доля предложений была принята — по обоим раундам сразу, то есть по всем случаям, когда кто-то выступал Предлагающим. Сделка состоялась, если предложение не меньше минимума, который согласен принять Отвечающий.';
    const read =
      'Если все рациональны, отвергать нечего — сделки должны быть почти 100%. Каждое отвергнутое предложение — знак, что Отвечающий предпочёл остаться без денег, лишь бы не соглашаться на «нечестно».';
    if (!r?.total) return { what, read, verdict: null };
    const head = `Состоялось ${r.deals} сделок из ${r.total}. В среднем предлагали ${Math.round(r.avgOffer)} ₽, а минимум для согласия был ${Math.round(r.avgMin)} ₽.`;
    const rejected = r.total - r.deals;
    let tail;
    if (rejected === 0)
      tail = ' Отвергнутых предложений нет: команда предлагала достаточно честно.';
    else
      tail = ` Отвергнуто ${rejected} ${plural(rejected, ['предложение', 'предложения', 'предложений'])} — люди отказывались от денег ради справедливости.`;
    return { what, read, verdict: head + tail };
  },
};
