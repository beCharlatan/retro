/* =========================================================
   GAME: Ультиматум (ultimatum)
   Two rounds per pair: round 1 keeps the roles from the
   pairing screen, round 2 swaps them — so both partners get
   to be the Proposer once and the Responder once, instead of
   one person always deciding and the other always reacting.
========================================================= */

import { Persist } from '../persist.js';
import { Print } from '../print.js';
import { Roles } from '../roles.js';
import { Screen } from '../screen.js';
import { app, avatarName, state } from '../state.js';

export function renderUltimatumGame() {
  const STAKE = 1000;
  let assignment = Roles.makePairs(state.participants);
  let entries = buildEntries();
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  const TOTAL_SCREENS = 6;

  function buildEntries() {
    return assignment.pairs.map((p) => ({
      a: p.a,
      b: p.b,
      trio: !!p.trio,
      r1_offer: null,
      r1_min: null, // Round 1: a proposes, b responds
      r2_offer: null,
      r2_min: null, // Round 2: b proposes, a responds
    }));
  }

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Ультиматум</span>
      </div>
      <div class="progress">${Roles.dotsHTML(TOTAL_SCREENS, 0)}</div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 10 минут</p>
        <h1>Разделите деньги на двоих — дважды</h1>
        <p class="lede">Мы разобьём вас на пары. Каждая пара играет два раунда, и во втором роли меняются местами — так оба партнёра успеют побыть в обеих ролях.</p>

        <div class="draft-mount" id="draft-mount-ultimatum"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Раунд 1: один — Предлагающий, другой — Отвечающий</b>
              <span>Предлагающему достаётся ${STAKE} ₽, он решает, сколько предложить партнёру. Отвечающий независимо называет минимальную сумму, на которую согласился бы.</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Раунд 2: те же пары, роли наоборот</b>
              <span>Кто был Отвечающим — теперь Предлагающий, и наоборот. Те же ${STAKE} ₽, то же решение, только с другой стороны.</span>
            </div>
          </li>
        </ol>

        <p class="note">В каждом раунде оба решения в паре принимаются одновременно и независимо.</p>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="ultGoTo(1)">Распределить пары →</button>
        </div>
      </section>

      <section class="screen" id="screen-1">
        <p class="eyebrow">Распределение ролей</p>
        <h2>Кто с кем в паре</h2>
        <p class="lede">Роли на этом экране — только для раунда 1, во втором раунде они поменяются местами. Не нравится расклад — перемешайте.</p>

        <div id="pairs-holder"></div>
        <button class="shuffle-btn" id="shuffle-btn">🎲 Перемешать пары</button>

        <div class="nav-row">
          <button class="ghost" onclick="ultGoTo(0)">← Назад</button>
          <button class="primary" onclick="ultLockPairs()">Дальше →</button>
        </div>
      </section>

      <section class="screen" id="screen-2">
        <p class="eyebrow">Раунд 1 из 2 · Сбор данных</p>
        <h2>Впишите решения каждой пары</h2>
        <p class="lede">Сколько предложил Предлагающий, и какой минимум назвал Отвечающий — оба из ${STAKE} ₽.</p>

        <div class="pair-entry-list" id="entry-body-1"></div>

        <div class="fill-progress">
          Заполнено пар: <span id="fill-count-1">0</span> из <span id="fill-total-1">${entries.length}</span>
          <div class="track"><div id="fill-bar-1" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="ultGoTo(1)">← Назад</button>
          <button class="primary" id="next-btn-1" onclick="ultGoTo(3)" disabled>Раунд 2 — роли наоборот →</button>
        </div>
      </section>

      <section class="screen" id="screen-3">
        <p class="eyebrow">Раунд 2 из 2 · Роли поменялись</p>
        <h2>Те же пары, наоборот</h2>
        <p class="lede">Кто в раунде 1 отвечал — теперь предлагает, и наоборот.</p>

        <div class="pair-entry-list" id="entry-body-2"></div>

        <div class="fill-progress">
          Заполнено пар: <span id="fill-count-2">0</span> из <span id="fill-total-2">${entries.length}</span>
          <div class="track"><div id="fill-bar-2" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="ultGoTo(2)">← Назад</button>
          <button class="primary" id="next-btn-2" onclick="ultShowResults()" disabled>Показать результаты →</button>
        </div>
      </section>

      <section class="screen" id="screen-4">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-ultimatum"></div>


        <div class="reveal">
          <div class="n" id="deal-rate">—</div>
          <p><b>Доля сделок, которые состоялись</b> — по обоим раундам сразу, то есть по всем случаям, когда кто-то был Предлагающим.</p>
        </div>

        <div class="group-compare">
          <div class="g low">
            <div class="t">Среднее предложение</div>
            <div class="v" id="avg-offer">—</div>
          </div>
          <div class="g high">
            <div class="t">Средний минимум для согласия</div>
            <div class="v" id="avg-min">—</div>
          </div>
        </div>

        <table class="results-table" id="results-table">
          <thead><tr><th>Раунд</th><th>Предлагающий</th><th>Отвечающий</th><th>Предложено</th><th>Минимум</th><th>Итог</th></tr></thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-ultimatum"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>


        <div class="nav-row">
          <button class="ghost" onclick="ultGoTo(3)">← Назад</button>
          <button class="primary" onclick="ultGoTo(5)">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-5">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Ультиматум</h1>
        <p class="lede">Классическая экономическая теория предсказывает: рациональный Отвечающий согласится на любую ненулевую сумму. В реальности люди массово отвергают «несправедливые» предложения — даже теряя деньги.</p>

        <p>Игра формализована в статье Güth W., Schmittberger R., Schwarze B. (1982). An Experimental Analysis of Ultimatum Bargaining. <i>Journal of Economic Behavior & Organization</i> — одна из первых работ, экспериментально показавших, что модель «человека экономического» не описывает реальное поведение: люди систематически платят за справедливость и наказывают жадность.</p>

        <div class="stat-row">
          <div class="stat"><div class="n">40–50%</div><div class="lab">типичное предложение в классических опытах</div></div>
          <div class="stat"><div class="n">&lt;20%</div><div class="lab">предложения такого размера обычно отвергают</div></div>
        </div>

        <p><b>Почему отказ — это тоже рациональное поведение, просто по другим правилам.</b> С точки зрения чистой выгоды отказ бессмыслен: Отвечающий теряет свою долю, а взамен ничего не получает — предлагающий тоже остаётся без денег, но это ему уже не поможет. Однако люди явно считают не только «сколько я получу», но и «насколько справедливо со мной обошлись» — а несправедливое предложение воспринимается как оскорбление, за которое стоит наказать, даже по цене собственных денег. Мозг обрабатывает такие ситуации отчасти эмоционально: сканирование мозга Отвечающих во время несправедливых предложений показывает активацию зон, связанных с отвращением и негативными эмоциями — то есть отказ ощущается не как холодный расчёт, а как что-то близкое к моральному возмущению.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>Чувство «справедливой доли» не универсально</b><span>Кросс-культурное исследование Henrich et al. (2001) в 15 небольших сообществах по всему миру показало, что средний размер «справедливого» предложения сильно варьируется между культурами — от ~26% до ~57%.</span></div>
        <div class="fact"><b>Вы только что сыграли в обе роли</b><span>В большинстве лабораторных версий этой игры участник — либо только Предлагающий, либо только Отвечающий. Сыграв оба раунда, вы могли заметить, что предложение самому себе «справедливым» и оценка чужого предложения как «справедливого» — не всегда одно и то же число.</span></div>
        <div class="fact"><b>Отказ активирует те же зоны мозга, что и отвращение к еде</b><span>Исследования на фМРТ (Sanfey et al., 2003) показали, что несправедливые предложения активируют островковую долю мозга — область, также отвечающую за реакцию на неприятные запахи и вкусы. Несправедливость буквально «противна» на нейронном уровне.</span></div>
        <div class="fact"><b>Размер ставки почти не меняет картину</b><span>Даже когда на кону оказываются суммы, эквивалентные нескольким месячным зарплатам (эксперименты проводили в странах с низким доходом, где ставки были очень весомыми относительно дохода участников), люди продолжают отвергать откровенно несправедливые предложения — хотя абсолютная цена отказа становится куда выше.</span></div>
        <div class="fact"><b>Рабочая параллель</b><span>Первое предложение на переговорах о зарплате или бюджете задаёт тон всему разговору — слишком низкий «якорь» может привести к отказу от сделки целиком, даже если условия объективно приемлемы.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="ultReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('ultimatum');

  Persist.offerRestore(
    'ultimatum',
    'draft-mount-ultimatum',
    (p) => Array.isArray(p.entries) && p.assignment,
    (p) => {
      assignment = p.assignment;
      entries = p.entries;
      renderPairsHolder();
      buildEntryRows(1);
      buildEntryRows(2);
      updateFillProgress(1);
      updateFillProgress(2);
      ultGoTo(2);
    },
  );

  function renderPairsHolder() {
    const el = document.getElementById('pairs-holder');
    el.innerHTML = Roles.pairsHTML(assignment.pairs, assignment.observer, {
      labelA: 'Предлагающий (раунд 1)',
      labelB: 'Отвечающий (раунд 1)',
    });
    Roles.bindPairSwap(el, () => assignment.pairs, renderPairsHolder);
  }
  renderPairsHolder();
  Roles.bindShuffle(document.getElementById('shuffle-btn'), () => {
    assignment = Roles.makePairs(state.participants);
    renderPairsHolder();
  });

  window.ultLockPairs = () => {
    entries = buildEntries();
    buildEntryRows(1);
    buildEntryRows(2);
    updateFillProgress(1);
    updateFillProgress(2);
    ultGoTo(2);
  };

  function buildEntryRows(round) {
    const body = document.getElementById('entry-body-' + round);
    body.innerHTML = '';
    entries.forEach((e, i) => {
      const proposer = round === 1 ? e.a : e.b;
      const responder = round === 1 ? e.b : e.a;
      const offerField = round === 1 ? 'r1_offer' : 'r2_offer';
      const minField = round === 1 ? 'r1_min' : 'r2_min';
      const div = document.createElement('div');
      div.className = 'pair-entry-card wide' + (e.trio ? ' role-pair-trio' : '');
      div.innerHTML = `
        ${e.trio ? '<span class="role-pair-trio-badge">🔺 трио</span>' : ''}
        <div class="pair-entry-name"><b>${avatarName(proposer)}</b><span>Предлагающий</span></div>
        <input type="number" min="0" max="${STAKE}" inputmode="numeric" placeholder="Предложил" data-idx="${i}" data-round="${round}" data-field="${offerField}" value="${e[offerField] ?? ''}">
        <div class="pair-entry-connector">↔</div>
        <input type="number" min="0" max="${STAKE}" inputmode="numeric" placeholder="Минимум" data-idx="${i}" data-round="${round}" data-field="${minField}" value="${e[minField] ?? ''}">
        <div class="pair-entry-name"><b>${avatarName(responder)}</b><span>Отвечающий</span></div>
      `;
      body.appendChild(div);
    });
    Array.from(body.querySelectorAll('input')).forEach((inp) => {
      inp.addEventListener('input', onEntryInput);
    });
  }

  function onEntryInput(e) {
    const idx = +e.target.dataset.idx;
    const round = +e.target.dataset.round;
    const field = e.target.dataset.field;
    let v = e.target.value === '' ? null : Number(e.target.value);
    if (v !== null) {
      if (v < 0) v = 0;
      if (v > STAKE) v = STAKE;
    }
    entries[idx][field] = v;
    updateFillProgress(round);
  }

  function updateFillProgress(round) {
    const offerField = round === 1 ? 'r1_offer' : 'r2_offer';
    const minField = round === 1 ? 'r1_min' : 'r2_min';
    const filled = entries.filter((e) => e[offerField] !== null && e[minField] !== null).length;
    Screen.updateProgress('-' + round, filled, entries.length, 'next-btn-' + round, 1);
    if (hydrated) {
      Persist.save('ultimatum', { assignment: assignment, entries: entries });
    }
  }

  window.ultGoTo = (screenIdx) => {
    Screen.goTo(screenIdx);
  };

  window.ultShowResults = () => {
    // Flatten both rounds into one list of "who proposed to whom".
    const instances = [];
    entries.forEach((e) => {
      if (e.r1_offer !== null && e.r1_min !== null) {
        instances.push({
          round: 1,
          proposer: e.a,
          responder: e.b,
          offer: e.r1_offer,
          min: e.r1_min,
        });
      }
      if (e.r2_offer !== null && e.r2_min !== null) {
        instances.push({
          round: 2,
          proposer: e.b,
          responder: e.a,
          offer: e.r2_offer,
          min: e.r2_min,
        });
      }
    });

    const deals = instances.filter((x) => x.offer >= x.min).length;
    document.getElementById('deal-rate').textContent = instances.length
      ? Math.round((deals / instances.length) * 100) + '%'
      : '—';

    const avgOffer = instances.reduce((a, b) => a + b.offer, 0) / instances.length;
    const avgMin = instances.reduce((a, b) => a + b.min, 0) / instances.length;
    document.getElementById('avg-offer').textContent = Math.round(avgOffer) + ' ₽';
    document.getElementById('avg-min').textContent = Math.round(avgMin) + ' ₽';

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    instances.forEach((x) => {
      const deal = x.offer >= x.min;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${x.round}</td><td class="name">${avatarName(x.proposer)}</td><td class="name">${avatarName(x.responder)}</td><td>${x.offer} ₽</td><td>${x.min} ₽</td><td>${deal ? 'Сделка' : 'Отказ'}</td>`;
      tbody.appendChild(tr);
    });

    Print.mount('print-header-ultimatum', {
      title: 'Ультиматум',
      subtitle: 'Люди отвергают выгодные предложения, если те кажутся нечестными.',
      meta: Print.meta(entries.length * 2, `${entries.length} пар · 2 раунда`),
      explanation:
        'Классическая теория предсказывает: рациональный Отвечающий согласится на любую ненулевую сумму — в реальности люди массово отвергают «несправедливые» предложения, даже теряя деньги. Игру формализовали Güth, Schmittberger и Schwarze в статье 1982 года.',
    });

    ultGoTo(4);
  };

  window.ultReset = () => {
    assignment = Roles.makePairs(state.participants);
    renderPairsHolder();
    entries = buildEntries();
    buildEntryRows(1);
    buildEntryRows(2);
    updateFillProgress(1);
    updateFillProgress(2);
    ultGoTo(0);
    Persist.clear('ultimatum');
  };

  buildEntryRows(1);
  buildEntryRows(2);
  updateFillProgress(1);
  updateFillProgress(2);
  hydrated = true;
}
