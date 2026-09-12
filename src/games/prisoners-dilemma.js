/* =========================================================
   GAME: Дилемма заключённого (prisoners-dilemma)
   Two rounds with the SAME partner instead of one — this is
   what actually lets reciprocity (Tit for Tat and friends)
   show up: after round 1, each pair's outcome is revealed on
   a short recap screen, then round 2 lets people react to
   what their partner just did. Results compare cooperation
   between rounds and measure how often round 2 "echoed" the
   partner's round 1 move.
========================================================= */

import { Persist } from '../persist.js';
import { Print } from '../print.js';
import { Roles } from '../roles.js';
import { Screen } from '../screen.js';
import { app, avatarName, state } from '../state.js';

export function renderPrisonersDilemmaGame() {
  let assignment = Roles.makePairs(state.participants);
  let entries = buildEntries();
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  const TOTAL_SCREENS = 7;

  function buildEntries() {
    return assignment.pairs.map((p) => ({
      a: p.a,
      b: p.b,
      trio: !!p.trio,
      r1a: null,
      r1b: null,
      r2a: null,
      r2b: null,
    }));
  }

  function payoff(choiceA, choiceB) {
    if (choiceA === 'C' && choiceB === 'C') return [3, 3];
    if (choiceA === 'D' && choiceB === 'D') return [1, 1];
    if (choiceA === 'D' && choiceB === 'C') return [5, 0];
    return [0, 5];
  }
  const label = (c) => (c === 'C' ? 'Сотрудничал' : 'Предал');

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Дилемма заключённого</span>
      </div>
      <div class="progress">${Roles.dotsHTML(TOTAL_SCREENS, 0)}</div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 10 минут</p>
        <h1>Один партнёр, два хода</h1>
        <p class="lede">Мы разобьём вас на пары. Каждая пара сыграет два раунда подряд с одним и тем же партнёром — и после первого раунда узнает, что выбрал другой.</p>

        <div class="draft-mount" id="draft-mount-prisoners-dilemma"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Прочитайте вслух правила игры</b>
              <span>У каждого в паре — два варианта: «Сотрудничать» или «Предать». Оба «Сотрудничать» — по 3 балла каждому. Оба «Предать» — по 1 баллу каждому. Один предал, другой сотрудничал — предавший получает 5, преданный — 0.</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Раунд 1 — вслепую, раунд 2 — уже зная итог</b>
              <span>В первом раунде оба выбирают одновременно, не видя друг друга. После него мы покажем, что выбрала каждая пара — и предложим сыграть второй раунд с тем же партнёром, уже с этим знанием.</span>
            </div>
          </li>
        </ol>

        <p class="note">В первом раунде партнёры не должны видеть выбор друг друга до того, как оба определились.</p>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="pdGoTo(1)">Распределить пары →</button>
        </div>
      </section>

      <section class="screen" id="screen-1">
        <p class="eyebrow">Распределение ролей</p>
        <h2>Кто с кем в паре</h2>
        <p class="lede">Роли симметричны, и пара останется той же на оба раунда. Не нравится расклад — перемешайте.</p>

        <div id="pairs-holder"></div>
        <button class="shuffle-btn" id="shuffle-btn">🎲 Перемешать пары</button>

        <div class="nav-row">
          <button class="ghost" onclick="pdGoTo(0)">← Назад</button>
          <button class="primary" onclick="pdLockPairs()">Дальше →</button>
        </div>
      </section>

      <section class="screen" id="screen-2">
        <p class="eyebrow">Раунд 1 из 2 · Вслепую</p>
        <h2>Впишите ход каждого в паре</h2>
        <p class="lede">Что выбрал каждый — сотрудничать или предать. Партнёры не знают выбора друг друга.</p>

        <div class="pair-entry-list" id="entry-body-1"></div>

        <div class="fill-progress">
          Заполнено пар: <span id="fill-count-1">0</span> из <span id="fill-total-1">${entries.length}</span>
          <div class="track"><div id="fill-bar-1" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="pdGoTo(1)">← Назад</button>
          <button class="primary" id="next-btn-1" onclick="pdShowRecap()" disabled>Что получилось в раунде 1 →</button>
        </div>
      </section>

      <section class="screen" id="screen-3">
        <p class="eyebrow">Итог раунда 1</p>
        <h2>Вот что выбрала каждая пара</h2>
        <p class="lede">Прочитайте вслух — теперь каждый знает, что сделал его партнёр в первый раз.</p>

        <table class="results-table" id="recap-table">
          <thead><tr><th>Пара</th><th>Ходы</th><th>Баллы</th></tr></thead>
          <tbody id="recap-tbody"></tbody>
        </table>

        <p class="note">Раунд 2 — с тем же партнёром. Решайте заново, уже зная, как он повёл себя в первый раз.</p>

        <div class="nav-row">
          <button class="ghost" onclick="pdGoTo(2)">← Назад</button>
          <button class="primary" onclick="pdGoTo(4)">Раунд 2 →</button>
        </div>
      </section>

      <section class="screen" id="screen-4">
        <p class="eyebrow">Раунд 2 из 2 · Уже зная итог раунда 1</p>
        <h2>Тот же партнёр — решайте заново</h2>
        <p class="lede">Что выбрал каждый теперь, зная, как повёл себя партнёр в первый раз.</p>

        <div class="pair-entry-list" id="entry-body-2"></div>

        <div class="fill-progress">
          Заполнено пар: <span id="fill-count-2">0</span> из <span id="fill-total-2">${entries.length}</span>
          <div class="track"><div id="fill-bar-2" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="pdGoTo(3)">← Назад</button>
          <button class="primary" id="next-btn-2" onclick="pdShowResults()" disabled>Показать результаты →</button>
        </div>
      </section>

      <section class="screen" id="screen-5">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-prisoners-dilemma"></div>

        <div class="reveal">
          <div class="n" id="coop-delta">—</div>
          <p><b>Насколько изменилась доля «Сотрудничать»</b> между раундами — раунд 2 минус раунд 1, в процентных пунктах.</p>
        </div>

        <div class="group-compare">
          <div class="g low">
            <div class="t">Раунд 1 · доля сотрудничества</div>
            <div class="v" id="coop-r1">—</div>
          </div>
          <div class="g high">
            <div class="t">Раунд 2 · доля сотрудничества</div>
            <div class="v" id="coop-r2">—</div>
          </div>
        </div>

        <div class="stat-row">
          <div class="stat"><div class="n" id="echo-rate">—</div><div class="lab">ходов во втором раунде повторили ход партнёра в первом («как эхо»)</div></div>
          <div class="stat"><div class="n" id="cc-count">—</div><div class="lab">пар с обоюдным сотрудничеством хотя бы в одном раунде</div></div>
        </div>

        <table class="results-table" id="results-table">
          <thead><tr><th>Раунд</th><th>Пара</th><th>Ходы</th><th>Баллы</th></tr></thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-prisoners-dilemma"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="pdGoTo(4)">← Назад</button>
          <button class="primary" onclick="pdGoTo(6)">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-6">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Дилемма заключённого</h1>
        <p class="lede">Рационально для каждого — предать. Но если предадут оба, обоим будет хуже, чем если бы оба сотрудничали. А если встреча не последняя — правила игры меняются.</p>

        <p>Игра сформулирована Мерриллом Флудом и Мелвином Дрешером в 1950 году в RAND Corporation; классическую формулировку про двух заключённых и её название предложил математик Альберт Такер. В начале 1980-х Роберт Аксельрод провёл знаменитые компьютерные турниры стратегий для повторяющейся версии игры — победила простейшая стратегия «Око за око» (Tit for Tat): начать с сотрудничества, дальше повторять последний ход оппонента.</p>

        <p><b>Почему рационально предать — и почему это ловушка.</b> Представьте, что вы уже знаете ход партнёра. Если он сотрудничает — вам выгоднее предать (5 баллов вместо 3). Если он предаёт — вам всё равно выгоднее предать (1 балл вместо 0). Предательство оказывается лучшим ответом <i>независимо</i> от того, что выберет другой — это называется доминирующей стратегией. Проблема в том, что оба партнёра рассуждают одинаково — хотя если бы оба выбрали сотрудничество, каждый получил бы больше (3 балла), чем при взаимном предательстве (1 балл).</p>

        <p><b>Зачем нужен именно второй раунд.</b> В однораундовой игре нет «тени будущего» — предательство ничем не грозит, партнёр не сможет ответить. Как только добавляется второй раунд с тем же человеком, появляется возможность отреагировать: наказать предательство или поддержать сотрудничество. Именно эта возможность реагировать — то самое условие, при котором в турнирах Аксельрода побеждала не самая хитрая, а самая отзывчивая стратегия.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>Один раунд — не то же самое, что много раундов</b><span>Вы могли увидеть это прямо на своей команде: в однораундовой версии реального сотрудничества обычно заметно меньше, чем во втором раунде с тем же партнёром — постоянные отношения повышают доверие именно потому, что у них есть «тень будущего».</span></div>
        <div class="fact"><b>«Око за око» победило не потому, что карательна</b><span>Стратегия Аксельрода выигрывала турниры за счёт простоты, отзывчивости и незлопамятности — она прощает партнёра сразу, как только тот вернётся к сотрудничеству, не затягивая месть.</span></div>
        <div class="fact"><b>Более мягкая версия иногда выигрывает ещё больше</b><span>В некоторых более поздних турнирах стратегии с редким «случайным прощением» ошибок партнёра (Generous Tit for Tat) показывали результат ещё лучше классического «Око за око» — избыточная мстительность иногда запускает бесконечную цепочку взаимных предательств из-за одной случайной ошибки.</span></div>
        <div class="fact"><b>Применяется в биологии</b><span>Ту же логику используют для объяснения кооперации у животных — например, взаимного вычёсывания паразитов у приматов или совместной охоты у хищников: сотрудничество устойчиво закрепляется эволюционно именно тогда, когда встречи повторяются, а не разовые.</span></div>
        <div class="fact"><b>Рабочая параллель</b><span>Разовые сделки с новым подрядчиком похожи на однораундовую игру — соблазн «предать» выше. Долгосрочные рабочие отношения в команде естественно подталкивают к кооперации именно потому, что раунды повторяются.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="pdReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('prisoners-dilemma');

  Persist.offerRestore(
    'prisoners-dilemma',
    'draft-mount-prisoners-dilemma',
    (p) => Array.isArray(p.entries) && p.assignment,
    (p) => {
      assignment = p.assignment;
      entries = p.entries;
      renderPairsHolder();
      buildEntryRows(1);
      buildEntryRows(2);
      updateFillProgress(1);
      updateFillProgress(2);
      pdGoTo(2);
    },
  );

  function renderPairsHolder() {
    const el = document.getElementById('pairs-holder');
    el.innerHTML = Roles.pairsHTML(assignment.pairs, assignment.observer);
    Roles.bindPairSwap(el, () => assignment.pairs, renderPairsHolder);
  }
  renderPairsHolder();
  Roles.bindShuffle(document.getElementById('shuffle-btn'), () => {
    assignment = Roles.makePairs(state.participants);
    renderPairsHolder();
  });

  window.pdLockPairs = () => {
    entries = buildEntries();
    buildEntryRows(1);
    buildEntryRows(2);
    updateFillProgress(1);
    updateFillProgress(2);
    pdGoTo(2);
  };

  function buildEntryRows(round) {
    const body = document.getElementById('entry-body-' + round);
    body.innerHTML = '';
    const fieldA = round === 1 ? 'r1a' : 'r2a';
    const fieldB = round === 1 ? 'r1b' : 'r2b';
    entries.forEach((e, i) => {
      const div = document.createElement('div');
      div.className = 'pair-entry-card wide' + (e.trio ? ' role-pair-trio' : '');
      div.innerHTML = `
        ${e.trio ? '<span class="role-pair-trio-badge">🔺 трио</span>' : ''}
        <div class="pair-entry-name"><b>${avatarName(e.a)}</b></div>
        <div class="toggle-pair" data-idx="${i}" data-round="${round}" data-side="a">
          <button type="button" data-val="C" class="${e[fieldA] === 'C' ? 'on' : ''}">Coтр.</button>
          <button type="button" data-val="D" class="${e[fieldA] === 'D' ? 'on' : ''}">Пред.</button>
        </div>
        <div class="pair-entry-connector">↔</div>
        <div class="toggle-pair" data-idx="${i}" data-round="${round}" data-side="b">
          <button type="button" data-val="C" class="${e[fieldB] === 'C' ? 'on' : ''}">Coтр.</button>
          <button type="button" data-val="D" class="${e[fieldB] === 'D' ? 'on' : ''}">Пред.</button>
        </div>
        <div class="pair-entry-name"><b>${avatarName(e.b)}</b></div>
      `;
      body.appendChild(div);
    });
    Array.from(body.querySelectorAll('.toggle-pair')).forEach((wrap) => {
      Array.from(wrap.querySelectorAll('button')).forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = +wrap.dataset.idx;
          const r = +wrap.dataset.round;
          const side = wrap.dataset.side;
          const field = (r === 1 ? 'r1' : 'r2') + side;
          const val = btn.dataset.val;
          entries[idx][field] = val;
          Array.from(wrap.querySelectorAll('button')).forEach((b) => {
            b.classList.toggle('on', b.dataset.val === val);
          });
          updateFillProgress(r);
        });
      });
    });
  }

  function updateFillProgress(round) {
    const fieldA = round === 1 ? 'r1a' : 'r2a';
    const fieldB = round === 1 ? 'r1b' : 'r2b';
    const filled = entries.filter((e) => e[fieldA] !== null && e[fieldB] !== null).length;
    Screen.updateProgress('-' + round, filled, entries.length, 'next-btn-' + round, 1);
    if (hydrated) {
      Persist.save('prisoners-dilemma', { assignment: assignment, entries: entries });
    }
  }

  window.pdGoTo = (screenIdx) => {
    Screen.goTo(screenIdx);
  };

  window.pdShowRecap = () => {
    const filled = entries.filter((e) => e.r1a !== null && e.r1b !== null);
    const tbody = document.getElementById('recap-tbody');
    tbody.innerHTML = '';
    filled.forEach((e) => {
      const pts = payoff(e.r1a, e.r1b);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${avatarName(e.a)} ↔ ${avatarName(e.b)}</td><td>${label(e.r1a)} / ${label(e.r1b)}</td><td>${pts[0]} / ${pts[1]}</td>`;
      tbody.appendChild(tr);
    });
    pdGoTo(3);
  };

  window.pdShowResults = () => {
    const filled = entries.filter(
      (e) => e.r1a !== null && e.r1b !== null && e.r2a !== null && e.r2b !== null,
    );

    const coopPct = (choices) =>
      Math.round((choices.filter((c) => c === 'C').length / choices.length) * 100);
    const r1Choices = filled.flatMap((e) => [e.r1a, e.r1b]);
    const r2Choices = filled.flatMap((e) => [e.r2a, e.r2b]);
    const coopR1 = coopPct(r1Choices);
    const coopR2 = coopPct(r2Choices);
    const delta = coopR2 - coopR1;

    document.getElementById('coop-delta').textContent = (delta >= 0 ? '+' : '') + delta + ' п.п.';
    document.getElementById('coop-r1').textContent = coopR1 + '%';
    document.getElementById('coop-r2').textContent = coopR2 + '%';

    // "Echo rate": in round 2, did each person's move match what their
    // PARTNER did in round 1 (mirroring — the Tit for Tat signature)?
    let echoes = 0,
      totalResponses = 0;
    filled.forEach((e) => {
      if (e.r2a === e.r1b) echoes++;
      totalResponses++;
      if (e.r2b === e.r1a) echoes++;
      totalResponses++;
    });
    document.getElementById('echo-rate').textContent =
      Math.round((echoes / totalResponses) * 100) + '%';

    const bothCoopEver = filled.filter(
      (e) => (e.r1a === 'C' && e.r1b === 'C') || (e.r2a === 'C' && e.r2b === 'C'),
    ).length;
    document.getElementById('cc-count').textContent = bothCoopEver + ' из ' + filled.length;

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    filled.forEach((e) => {
      const p1 = payoff(e.r1a, e.r1b);
      const p2 = payoff(e.r2a, e.r2b);
      const tr1 = document.createElement('tr');
      tr1.innerHTML = `<td>1</td><td class="name">${avatarName(e.a)} ↔ ${avatarName(e.b)}</td><td>${label(e.r1a)} / ${label(e.r1b)}</td><td>${p1[0]} / ${p1[1]}</td>`;
      tbody.appendChild(tr1);
      const tr2 = document.createElement('tr');
      tr2.innerHTML = `<td>2</td><td class="name">${avatarName(e.a)} ↔ ${avatarName(e.b)}</td><td>${label(e.r2a)} / ${label(e.r2b)}</td><td>${p2[0]} / ${p2[1]}</td>`;
      tbody.appendChild(tr2);
    });

    Print.mount('print-header-prisoners-dilemma', {
      title: 'Дилемма заключённого',
      subtitle: 'Рационально предать — но если встреча не последняя, правила меняются.',
      meta: Print.meta(filled.length * 2, `${filled.length} пар · 2 раунда`),
      explanation:
        'Рационально для каждого — предать, но если предадут оба, обоим будет хуже, чем при обоюдном сотрудничестве. Игру сформулировали Меррилл Флуд и Мелвин Дрешер в 1950 году в RAND Corporation; в компьютерных турнирах Роберта Аксельрода в начале 1980-х для повторяющейся версии игры победила простая отзывчивая стратегия «Око за око».',
    });

    pdGoTo(5);
  };

  window.pdReset = () => {
    assignment = Roles.makePairs(state.participants);
    renderPairsHolder();
    entries = buildEntries();
    buildEntryRows(1);
    buildEntryRows(2);
    updateFillProgress(1);
    updateFillProgress(2);
    pdGoTo(0);
    Persist.clear('prisoners-dilemma');
  };

  buildEntryRows(1);
  buildEntryRows(2);
  updateFillProgress(1);
  updateFillProgress(2);
  hydrated = true;
}
