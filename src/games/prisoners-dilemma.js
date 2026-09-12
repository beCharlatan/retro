/* =========================================================
   GAME: Дилемма заключённого (prisoners-dilemma)
   Two rounds with the SAME partner instead of one — this is
   what actually lets reciprocity (Tit for Tat and friends)
   show up: after round 1, each pair's outcome is revealed on
   a short recap screen, then round 2 lets people react to
   what their partner just did. Results compare cooperation
   between rounds and measure how often round 2 "echoed" the
   partner's round 1 move.

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same declarative pairing/swap pattern as ultimatum.js (see that
   file's header comment), plus .toggle-pair (Сотр./Пред.) buttons
   instead of number inputs for each side of each pair — same pattern
   as false-consensus.js's Да/Нет buttons. Keeps all original plain
   ids (entry-body-1/2, next-btn-1/2, recap-table/tbody,
   results-table/tbody, ...).
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderHome } from '../home.js';
import { Persist, timeAgo } from '../persist.js';
import { Print } from '../print.js';
import { Roles } from '../roles.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const TOTAL_SCREENS = 7;

function payoff(choiceA, choiceB) {
  if (choiceA === 'C' && choiceB === 'C') return [3, 3];
  if (choiceA === 'D' && choiceB === 'D') return [1, 1];
  if (choiceA === 'D' && choiceB === 'C') return [5, 0];
  return [0, 5];
}
const label = (c) => (c === 'C' ? 'Сотрудничал' : 'Предал');

function buildEntries(assignment) {
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

export class RetroGamePrisonersDilemma extends LitElement {
  static styles = sharedStyles;

  static properties = {
    screenIdx: { state: true },
    assignment: { state: true },
    entries: { state: true },
    draft: { state: true },
    results: { state: true },
    selectedSwapName: { state: true },
    shuffleSpin: { state: true },
  };

  constructor() {
    super();
    this.screenIdx = 0;
    this.assignment = Roles.makePairs(state.participants);
    this.entries = buildEntries(this.assignment);
    this.results = null;
    this.selectedSwapName = null;
    this.shuffleSpin = false;

    const loaded = Persist.load('prisoners-dilemma');
    this.draft =
      loaded && Array.isArray(loaded.payload.entries) && loaded.payload.assignment ? loaded : null;
  }

  goTo(idx) {
    this.screenIdx = idx;
  }

  _restoreDraft() {
    this.assignment = this.draft.payload.assignment;
    this.entries = this.draft.payload.entries;
    this.draft = null;
    this.goTo(2);
  }

  _discardDraft() {
    Persist.clear('prisoners-dilemma');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('prisoners-dilemma');
    renderHome();
  }

  _onShuffle() {
    this.assignment = Roles.makePairs(state.participants);
    this.selectedSwapName = null;
    this.shuffleSpin = true;
    setTimeout(() => {
      this.shuffleSpin = false;
    }, 350);
  }

  _onSwapClick(name) {
    if (this.selectedSwapName === null) {
      this.selectedSwapName = name;
      return;
    }
    if (this.selectedSwapName === name) {
      this.selectedSwapName = null;
      return;
    }
    Roles.swapInPairs(this.assignment.pairs, this.selectedSwapName, name);
    this.selectedSwapName = null;
    this.assignment = { ...this.assignment };
  }

  _lockPairs() {
    this.entries = buildEntries(this.assignment);
    this.goTo(2);
  }

  _onToggle(idx, side, round, val) {
    const field = (round === 1 ? 'r1' : 'r2') + side;
    this.entries = this.entries.map((e, i) => (i === idx ? { ...e, [field]: val } : e));
    Persist.save('prisoners-dilemma', { assignment: this.assignment, entries: this.entries });
  }

  _filledCount(round) {
    const fieldA = round === 1 ? 'r1a' : 'r2a';
    const fieldB = round === 1 ? 'r1b' : 'r2b';
    return this.entries.filter((e) => e[fieldA] !== null && e[fieldB] !== null).length;
  }

  _showRecap() {
    this.goTo(3);
  }

  _showResults() {
    const filled = this.entries.filter(
      (e) => e.r1a !== null && e.r1b !== null && e.r2a !== null && e.r2b !== null,
    );

    const coopPct = (choices) =>
      Math.round((choices.filter((c) => c === 'C').length / choices.length) * 100);
    const coopR1 = coopPct(filled.flatMap((e) => [e.r1a, e.r1b]));
    const coopR2 = coopPct(filled.flatMap((e) => [e.r2a, e.r2b]));
    const delta = coopR2 - coopR1;

    let echoes = 0,
      totalResponses = 0;
    filled.forEach((e) => {
      if (e.r2a === e.r1b) echoes++;
      totalResponses++;
      if (e.r2b === e.r1a) echoes++;
      totalResponses++;
    });
    const echoRate = Math.round((echoes / totalResponses) * 100);

    const ccCount = filled.filter(
      (e) => (e.r1a === 'C' && e.r1b === 'C') || (e.r2a === 'C' && e.r2b === 'C'),
    ).length;

    this.results = { filled, coopR1, coopR2, delta, echoRate, ccCount };

    Print.mount(
      'print-header-prisoners-dilemma',
      {
        title: 'Дилемма заключённого',
        subtitle: 'Рационально предать — но если встреча не последняя, правила меняются.',
        meta: Print.meta(filled.length * 2, `${filled.length} пар · 2 раунда`),
        explanation:
          'Рационально для каждого — предать, но если предадут оба, обоим будет хуже, чем при обоюдном сотрудничестве. Игру сформулировали Меррилл Флуд и Мелвин Дрешер в 1950 году в RAND Corporation; в компьютерных турнирах Роберта Аксельрода в начале 1980-х для повторяющейся версии игры победила простая отзывчивая стратегия «Око за око».',
      },
      this.renderRoot,
    );

    this.goTo(5);
  }

  _reset() {
    this.assignment = Roles.makePairs(state.participants);
    this.selectedSwapName = null;
    this.entries = buildEntries(this.assignment);
    this.results = null;
    Persist.clear('prisoners-dilemma');
    this.goTo(0);
  }

  _pairCard(p) {
    const selectedA = this.selectedSwapName === p.a;
    const selectedB = this.selectedSwapName === p.b;
    return html`
      <div class="role-pair-card ${p.trio ? 'role-pair-trio' : ''}">
        ${p.trio ? html`<span class="role-pair-trio-badge">🔺 трио</span>` : ''}
        <div class="role-pair-side left">
          <button
            type="button"
            class="role-pair-name ${selectedA ? 'swap-selected' : ''}"
            @click=${() => this._onSwapClick(p.a)}
          >
            ${unsafeHTML(avatarName(p.a))}
          </button>
        </div>
        <div class="role-pair-vs">↔</div>
        <div class="role-pair-side right">
          <button
            type="button"
            class="role-pair-name ${selectedB ? 'swap-selected' : ''}"
            @click=${() => this._onSwapClick(p.b)}
          >
            ${unsafeHTML(avatarName(p.b))}
          </button>
        </div>
      </div>
    `;
  }

  _pairsHolder() {
    const { pairs, observer, trio } = this.assignment;
    return html`
      <div class="role-pairs">${pairs.map((p) => this._pairCard(p))}</div>
      <p class="note swap-hint">Нажмите на двух участников по очереди, чтобы поменять их местами.</p>
      ${
        trio
          ? html`<p class="note">
            🔺 Нечётное число участников — ${trio.join(', ')} играют трио по кругу вместо пары:
            каждый сыграет дважды, с двумя разными партнёрами, но зато без исключений.
          </p>`
          : observer
            ? html`<p class="note">
              ${observer} — нечётное число участников, в этом раунде наблюдатель: ведёт протокол
              или подыгрывает за отсутствующего.
            </p>`
            : ''
      }
    `;
  }

  _entryCard(e, idx, round) {
    const fieldA = round === 1 ? 'r1a' : 'r2a';
    const fieldB = round === 1 ? 'r1b' : 'r2b';
    return html`
      <div class="pair-entry-card wide ${e.trio ? 'role-pair-trio' : ''}">
        ${e.trio ? html`<span class="role-pair-trio-badge">🔺 трио</span>` : ''}
        <div class="pair-entry-name"><b>${unsafeHTML(avatarName(e.a))}</b></div>
        <div class="toggle-pair">
          <button
            type="button"
            data-val="C"
            class="${e[fieldA] === 'C' ? 'on' : ''}"
            @click=${() => this._onToggle(idx, 'a', round, 'C')}
          >
            Coтр.
          </button>
          <button
            type="button"
            data-val="D"
            class="${e[fieldA] === 'D' ? 'on' : ''}"
            @click=${() => this._onToggle(idx, 'a', round, 'D')}
          >
            Пред.
          </button>
        </div>
        <div class="pair-entry-connector">↔</div>
        <div class="toggle-pair">
          <button
            type="button"
            data-val="C"
            class="${e[fieldB] === 'C' ? 'on' : ''}"
            @click=${() => this._onToggle(idx, 'b', round, 'C')}
          >
            Coтр.
          </button>
          <button
            type="button"
            data-val="D"
            class="${e[fieldB] === 'D' ? 'on' : ''}"
            @click=${() => this._onToggle(idx, 'b', round, 'D')}
          >
            Пред.
          </button>
        </div>
        <div class="pair-entry-name"><b>${unsafeHTML(avatarName(e.b))}</b></div>
      </div>
    `;
  }

  render() {
    const filled1 = this._filledCount(1);
    const filled2 = this._filledCount(2);
    const r = this.results;
    const recapFilled = this.entries.filter((e) => e.r1a !== null && e.r1b !== null);

    return html`
      <div class="wrap narrow">
        <div class="game-crumb">
          <button class="back-link" @click=${this._goHome}>← Все игры</button>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">Дилемма заключённого</span>
        </div>
        <div class="progress">
          ${Array.from(
            { length: TOTAL_SCREENS },
            (_, i) => html`
              <div
                class="dot ${i === this.screenIdx ? 'active' : ''} ${i < this.screenIdx ? 'done' : ''}"
              ></div>
            `,
          )}
        </div>

        <section class="screen ${this.screenIdx === 0 ? 'active' : ''}">
          <p class="eyebrow">Командное упражнение · 10 минут</p>
          <h1>Один партнёр, два хода</h1>
          <p class="lede">
            Мы разобьём вас на пары. Каждая пара сыграет два раунда подряд с одним и тем же
            партнёром — и после первого раунда узнает, что выбрал другой.
          </p>

          <div class="draft-mount">
            ${
              this.draft
                ? html`
                  <div class="draft-banner">
                    <span class="draft-text"
                      >📋 Есть незавершённая попытка (${timeAgo(this.draft.savedAt)}) — продолжить
                      с того места?</span
                    >
                    <span class="draft-actions">
                      <button type="button" class="draft-restore" @click=${() => this._restoreDraft()}>
                        Восстановить
                      </button>
                      <button type="button" class="draft-discard" @click=${() => this._discardDraft()}>
                        Начать заново
                      </button>
                    </span>
                  </div>
                `
                : ''
            }
          </div>

          <ol class="step-list">
            <li>
              <div class="step-num">1</div>
              <div class="step-body">
                <b>Прочитайте вслух правила игры</b>
                <span
                  >У каждого в паре — два варианта: «Сотрудничать» или «Предать». Оба
                  «Сотрудничать» — по 3 балла каждому. Оба «Предать» — по 1 баллу каждому. Один
                  предал, другой сотрудничал — предавший получает 5, преданный — 0.</span
                >
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Раунд 1 — вслепую, раунд 2 — уже зная итог</b>
                <span
                  >В первом раунде оба выбирают одновременно, не видя друг друга. После него мы
                  покажем, что выбрала каждая пара — и предложим сыграть второй раунд с тем же
                  партнёром, уже с этим знанием.</span
                >
              </div>
            </li>
          </ol>

          <p class="note">
            В первом раунде партнёры не должны видеть выбор друг друга до того, как оба
            определились.
          </p>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.goTo(1)}>Распределить пары →</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 1 ? 'active' : ''}">
          <p class="eyebrow">Распределение ролей</p>
          <h2>Кто с кем в паре</h2>
          <p class="lede">
            Роли симметричны, и пара останется той же на оба раунда. Не нравится расклад —
            перемешайте.
          </p>

          <div>${this._pairsHolder()}</div>
          <button
            class="shuffle-btn ${this.shuffleSpin ? 'spin' : ''}"
            @click=${() => this._onShuffle()}
          >
            🎲 Перемешать пары
          </button>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(0)}>← Назад</button>
            <button class="primary" @click=${() => this._lockPairs()}>Дальше →</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 2 ? 'active' : ''}">
          <p class="eyebrow">Раунд 1 из 2 · Вслепую</p>
          <h2>Впишите ход каждого в паре</h2>
          <p class="lede">
            Что выбрал каждый — сотрудничать или предать. Партнёры не знают выбора друг друга.
          </p>

          <div class="pair-entry-list" id="entry-body-1">
            ${this.entries.map((e, i) => this._entryCard(e, i, 1))}
          </div>

          <div class="fill-progress">
            Заполнено пар: <span>${filled1}</span> из <span>${this.entries.length}</span>
            <div class="track">
              <div style="width:${(filled1 / this.entries.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(1)}>← Назад</button>
            <button
              class="primary"
              id="next-btn-1"
              ?disabled=${filled1 < 1}
              @click=${() => this._showRecap()}
            >
              Что получилось в раунде 1 →
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 3 ? 'active' : ''}">
          <p class="eyebrow">Итог раунда 1</p>
          <h2>Вот что выбрала каждая пара</h2>
          <p class="lede">Прочитайте вслух — теперь каждый знает, что сделал его партнёр в первый раз.</p>

          <table class="results-table" id="recap-table">
            <thead>
              <tr>
                <th>Пара</th>
                <th>Ходы</th>
                <th>Баллы</th>
              </tr>
            </thead>
            <tbody id="recap-tbody">
              ${recapFilled.map((e) => {
                const pts = payoff(e.r1a, e.r1b);
                return html`
                  <tr>
                    <td class="name">${unsafeHTML(avatarName(e.a))} ↔ ${unsafeHTML(avatarName(e.b))}</td>
                    <td>${label(e.r1a)} / ${label(e.r1b)}</td>
                    <td>${pts[0]} / ${pts[1]}</td>
                  </tr>
                `;
              })}
            </tbody>
          </table>

          <p class="note">Раунд 2 — с тем же партнёром. Решайте заново, уже зная, как он повёл себя в первый раз.</p>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(2)}>← Назад</button>
            <button class="primary" @click=${() => this.goTo(4)}>Раунд 2 →</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 4 ? 'active' : ''}">
          <p class="eyebrow">Раунд 2 из 2 · Уже зная итог раунда 1</p>
          <h2>Тот же партнёр — решайте заново</h2>
          <p class="lede">Что выбрал каждый теперь, зная, как повёл себя партнёр в первый раз.</p>

          <div class="pair-entry-list" id="entry-body-2">
            ${this.entries.map((e, i) => this._entryCard(e, i, 2))}
          </div>

          <div class="fill-progress">
            Заполнено пар: <span>${filled2}</span> из <span>${this.entries.length}</span>
            <div class="track">
              <div style="width:${(filled2 / this.entries.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(3)}>← Назад</button>
            <button
              class="primary"
              id="next-btn-2"
              ?disabled=${filled2 < 1}
              @click=${() => this._showResults()}
            >
              Показать результаты →
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 5 ? 'active' : ''}">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>
          <div class="print-header" id="print-header-prisoners-dilemma"></div>

          <div class="reveal">
            <div class="n">${r ? (r.delta >= 0 ? '+' : '') + r.delta + ' п.п.' : '—'}</div>
            <p>
              <b>Насколько изменилась доля «Сотрудничать»</b> между раундами — раунд 2 минус
              раунд 1, в процентных пунктах.
            </p>
          </div>

          <div class="group-compare">
            <div class="g low">
              <div class="t">Раунд 1 · доля сотрудничества</div>
              <div class="v">${r ? r.coopR1 + '%' : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Раунд 2 · доля сотрудничества</div>
              <div class="v">${r ? r.coopR2 + '%' : '—'}</div>
            </div>
          </div>

          <div class="stat-row">
            <div class="stat">
              <div class="n">${r ? r.echoRate + '%' : '—'}</div>
              <div class="lab">ходов во втором раунде повторили ход партнёра в первом («как эхо»)</div>
            </div>
            <div class="stat">
              <div class="n">${r ? r.ccCount + ' из ' + r.filled.length : '—'}</div>
              <div class="lab">пар с обоюдным сотрудничеством хотя бы в одном раунде</div>
            </div>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Раунд</th>
                <th>Пара</th>
                <th>Ходы</th>
                <th>Баллы</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.flatMap((e) => {
                      const p1 = payoff(e.r1a, e.r1b);
                      const p2 = payoff(e.r2a, e.r2b);
                      return [
                        html`
                        <tr>
                          <td>1</td>
                          <td class="name">${unsafeHTML(avatarName(e.a))} ↔ ${unsafeHTML(avatarName(e.b))}</td>
                          <td>${label(e.r1a)} / ${label(e.r1b)}</td>
                          <td>${p1[0]} / ${p1[1]}</td>
                        </tr>
                      `,
                        html`
                        <tr>
                          <td>2</td>
                          <td class="name">${unsafeHTML(avatarName(e.a))} ↔ ${unsafeHTML(avatarName(e.b))}</td>
                          <td>${label(e.r2a)} / ${label(e.r2b)}</td>
                          <td>${p2[0]} / ${p2[1]}</td>
                        </tr>
                      `,
                      ];
                    })
                  : ''
              }
            </tbody>
          </table>

          <div class="print-footer" id="print-footer-prisoners-dilemma"></div>

          <div class="pdf-row">
            <button class="ghost" id="pdf-btn" @click=${() => Print.run()}>
              🖨️ Сохранить / отправить PDF
            </button>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(4)}>← Назад</button>
            <button class="primary" @click=${() => this.goTo(6)}>Что это было? →</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 6 ? 'active' : ''}">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Дилемма заключённого</h1>
          <p class="lede">
            Рационально для каждого — предать. Но если предадут оба, обоим будет хуже, чем если
            бы оба сотрудничали. А если встреча не последняя — правила игры меняются.
          </p>

          <p>
            Игра сформулирована Мерриллом Флудом и Мелвином Дрешером в 1950 году в RAND
            Corporation; классическую формулировку про двух заключённых и её название предложил
            математик Альберт Такер. В начале 1980-х Роберт Аксельрод провёл знаменитые
            компьютерные турниры стратегий для повторяющейся версии игры — победила простейшая
            стратегия «Око за око» (Tit for Tat): начать с сотрудничества, дальше повторять
            последний ход оппонента.
          </p>

          <p>
            <b>Почему рационально предать — и почему это ловушка.</b> Представьте, что вы уже
            знаете ход партнёра. Если он сотрудничает — вам выгоднее предать (5 баллов вместо 3).
            Если он предаёт — вам всё равно выгоднее предать (1 балл вместо 0). Предательство
            оказывается лучшим ответом <i>независимо</i> от того, что выберет другой — это
            называется доминирующей стратегией. Проблема в том, что оба партнёра рассуждают
            одинаково — хотя если бы оба выбрали сотрудничество, каждый получил бы больше (3
            балла), чем при взаимном предательстве (1 балл).
          </p>

          <p>
            <b>Зачем нужен именно второй раунд.</b> В однораундовой игре нет «тени будущего» —
            предательство ничем не грозит, партнёр не сможет ответить. Как только добавляется
            второй раунд с тем же человеком, появляется возможность отреагировать: наказать
            предательство или поддержать сотрудничество. Именно эта возможность реагировать — то
            самое условие, при котором в турнирах Аксельрода побеждала не самая хитрая, а самая
            отзывчивая стратегия.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Один раунд — не то же самое, что много раундов</b
            ><span
              >Вы могли увидеть это прямо на своей команде: в однораундовой версии реального
              сотрудничества обычно заметно меньше, чем во втором раунде с тем же партнёром —
              постоянные отношения повышают доверие именно потому, что у них есть «тень
              будущего».</span
            >
          </div>
          <div class="fact">
            <b>«Око за око» победило не потому, что карательна</b
            ><span
              >Стратегия Аксельрода выигрывала турниры за счёт простоты, отзывчивости и
              незлопамятности — она прощает партнёра сразу, как только тот вернётся к
              сотрудничеству, не затягивая месть.</span
            >
          </div>
          <div class="fact">
            <b>Более мягкая версия иногда выигрывает ещё больше</b
            ><span
              >В некоторых более поздних турнирах стратегии с редким «случайным прощением» ошибок
              партнёра (Generous Tit for Tat) показывали результат ещё лучше классического «Око
              за око» — избыточная мстительность иногда запускает бесконечную цепочку взаимных
              предательств из-за одной случайной ошибки.</span
            >
          </div>
          <div class="fact">
            <b>Применяется в биологии</b
            ><span
              >Ту же логику используют для объяснения кооперации у животных — например,
              взаимного вычёсывания паразитов у приматов или совместной охоты у хищников:
              сотрудничество устойчиво закрепляется эволюционно именно тогда, когда встречи
              повторяются, а не разовые.</span
            >
          </div>
          <div class="fact">
            <b>Рабочая параллель</b
            ><span
              >Разовые сделки с новым подрядчиком похожи на однораундовую игру — соблазн
              «предать» выше. Долгосрочные рабочие отношения в команде естественно подталкивают к
              кооперации именно потому, что раунды повторяются.</span
            >
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
            <span></span>
          </div>
        </section>
      </div>
    `;
  }
}

customElements.define('retro-game-prisoners-dilemma', RetroGamePrisonersDilemma);
