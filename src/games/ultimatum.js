/* =========================================================
   GAME: Ультиматум (ultimatum)
   Two rounds per pair: round 1 keeps the roles from the
   pairing screen, round 2 swaps them — so both partners get
   to be the Proposer once and the Responder once, instead of
   one person always deciding and the other always reacting.

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   first game with a pairing/click-to-swap screen. Unlike the earlier
   games, this one does NOT reuse Roles.pairsHTML()/bindPairSwap()/
   bindShuffle() (the string-building + imperative-listener trio) —
   those stay as-is for the remaining legacy games, but here the pair
   cards and swap-to-select interaction are declarative Lit template +
   reactive state instead, consistent with how every other imperative
   piece (draft banner, custom question) got rewritten in earlier
   conversions. Roles.makePairs()/swapPairsAt() (pure data functions,
   no DOM) are reused as-is — swap tracked by exact {pairIndex, side}
   slot, not by name, because makePairs()'s trio triangle deliberately
   puts a trio member in two pair slots at once (see roles.js). Keeps
   all original plain ids
   (entry-body-1/2, next-btn-1/2, results-table/tbody, ...).
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import {
  ICON_CLIPBOARD,
  ICON_DOWNLOAD,
  ICON_LEFT,
  ICON_RIGHT,
  ICON_SHUFFLE,
  ICON_TRIO,
  ICON_X,
} from '../icons.js';
import {
  buildUltimatumEntries,
  countFilled,
  hasEnough,
  hasFields,
  loadableDraft,
  MIN_FILLED_PAIRS,
  parseNumberInput,
  patchRow,
} from '../logic/entries.js';
import { isDeal, ultimatumResults } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { Roles } from '../roles.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const STAKE = 1000;
const TOTAL_SCREENS = 6;
const ROUND_TITLES = [
  'Разделите деньги на двоих — дважды',
  'Кто с кем в паре',
  'Впишите решения каждой пары',
  'Те же пары, наоборот',
  'Что получилось у вашей команды',
  'Ультиматум',
];

export class RetroGameUltimatum extends LitElement {
  static styles = sharedStyles;

  static properties = {
    assignment: { state: true },
    entries: { state: true },
    draft: { state: true },
    results: { state: true },
    selectedSwap: { state: true },
    shuffleSpin: { state: true },
  };

  constructor() {
    super();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.assignment = Roles.makePairs(state.participants);
    this.entries = buildUltimatumEntries(this.assignment);
    this.results = null;
    this.selectedSwap = null;
    this.shuffleSpin = false;

    this.draft = loadableDraft(Persist.load('ultimatum'), {
      key: 'entries',
      requires: 'assignment',
    });
  }

  _restoreDraft() {
    this.flow.advance(2, () => {
      this.assignment = this.draft.payload.assignment;
      this.entries = this.draft.payload.entries;
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear('ultimatum');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('ultimatum');
    renderHome();
  }

  _onShuffle() {
    this.assignment = Roles.makePairs(state.participants);
    this.selectedSwap = null;
    this.shuffleSpin = true;
    setTimeout(() => {
      this.shuffleSpin = false;
    }, 350);
  }

  // Tracked by exact slot ({ i: pair index, side: 'a'|'b' }), not by
  // name — a trio member sits in two different pair slots at once
  // (see roles.js's swapPairsAt), so identifying the clicked slot by
  // name alone can't tell them apart and silently corrupts the trio.
  _onSwapClick(i, side) {
    if (this.selectedSwap === null) {
      this.selectedSwap = { i, side };
      return;
    }
    if (this.selectedSwap.i === i && this.selectedSwap.side === side) {
      this.selectedSwap = null;
      return;
    }
    Roles.swapPairsAt(this.assignment.pairs, this.selectedSwap, { i, side });
    this.selectedSwap = null;
    this.assignment = { ...this.assignment };
  }

  _lockPairs() {
    this.flow.advance(2, () => {
      this.entries = buildUltimatumEntries(this.assignment);
    });
  }

  _onEntryInput(e, idx, field) {
    this.entries = patchRow(this.entries, idx, {
      [field]: parseNumberInput(e.target.value, { min: 0, max: STAKE }),
    });
    Persist.save('ultimatum', { assignment: this.assignment, entries: this.entries });
  }

  _filledCount(round) {
    const offerField = round === 1 ? 'r1_offer' : 'r2_offer';
    const minField = round === 1 ? 'r1_min' : 'r2_min';
    return countFilled(this.entries, hasFields(offerField, minField));
  }

  _showResults() {
    this.results = ultimatumResults(this.entries);

    ReportExport.register(
      'ultimatum',
      {
        subtitle: 'Люди отвергают выгодные предложения, если те кажутся нечестными.',
        meta: ReportExport.meta(this.entries.length * 2, `${this.entries.length} пар · 2 раунда`),
        explanation:
          'Классическая теория предсказывает: рациональный Отвечающий согласится на любую ненулевую сумму — в реальности люди массово отвергают «несправедливые» предложения, даже теряя деньги. Игру формализовали Güth, Schmittberger и Schwarze в статье 1982 года.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.assignment = Roles.makePairs(state.participants);
    this.selectedSwap = null;
    this.entries = buildUltimatumEntries(this.assignment);
    this.results = null;
    Persist.clear('ultimatum');
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _pairCard(p, i) {
    const selectedA = this.selectedSwap?.i === i && this.selectedSwap?.side === 'a';
    const selectedB = this.selectedSwap?.i === i && this.selectedSwap?.side === 'b';
    return html`
      <div class="role-pair-card ${p.trio ? 'role-pair-trio' : ''}">
        ${p.trio ? html`<span class="role-pair-trio-badge">${unsafeHTML(ICON_TRIO)} трио</span>` : ''}
        <div class="role-pair-side left">
          <button
            type="button"
            class="role-pair-name ${selectedA ? 'swap-selected' : ''}"
            @click=${() => this._onSwapClick(i, 'a')}
          >
            ${unsafeHTML(avatarName(p.a))}
          </button>
          <div class="role-pair-label">Предлагающий (раунд 1)</div>
        </div>
        <div class="role-pair-vs">↔</div>
        <div class="role-pair-side right">
          <button
            type="button"
            class="role-pair-name ${selectedB ? 'swap-selected' : ''}"
            @click=${() => this._onSwapClick(i, 'b')}
          >
            ${unsafeHTML(avatarName(p.b))}
          </button>
          <div class="role-pair-label">Отвечающий (раунд 1)</div>
        </div>
      </div>
    `;
  }

  _pairsHolder() {
    const { pairs, observer, trio } = this.assignment;
    return html`
      <div class="role-pairs">${pairs.map((p, i) => this._pairCard(p, i))}</div>
      <p class="note swap-hint">Нажмите на двух участников по очереди, чтобы поменять их местами.</p>
      ${
        trio
          ? html`<div class="info-tip">
            <span
              >Нечётное число участников — ${trio.join(', ')} играют трио по кругу вместо пары:
              каждый сыграет дважды, с двумя разными партнёрами, но зато без исключений.</span
            >
          </div>`
          : observer
            ? html`<div class="info-tip">
              <span
                >${observer} — нечётное число участников, в этом раунде наблюдатель: ведёт
                протокол или подыгрывает за отсутствующего.</span
              >
            </div>`
            : ''
      }
    `;
  }

  _entryCard(entry, idx, round) {
    const proposer = round === 1 ? entry.a : entry.b;
    const responder = round === 1 ? entry.b : entry.a;
    const offerField = round === 1 ? 'r1_offer' : 'r2_offer';
    const minField = round === 1 ? 'r1_min' : 'r2_min';
    return html`
      <div class="pair-entry-card wide ${entry.trio ? 'role-pair-trio' : ''}">
        ${entry.trio ? html`<span class="role-pair-trio-badge">${unsafeHTML(ICON_TRIO)} трио</span>` : ''}
        <div class="pair-entry-name"><b>${unsafeHTML(avatarName(proposer))}</b><span>Предлагающий</span></div>
        <input
          type="number"
          min="0"
          max="${STAKE}"
          inputmode="numeric"
          placeholder="Предложил"
          .value=${entry[offerField] ?? ''}
          @input=${(e) => this._onEntryInput(e, idx, offerField)}
        />
        <div class="pair-entry-connector">↔</div>
        <input
          type="number"
          min="0"
          max="${STAKE}"
          inputmode="numeric"
          placeholder="Минимум"
          .value=${entry[minField] ?? ''}
          @input=${(e) => this._onEntryInput(e, idx, minField)}
        />
        <div class="pair-entry-name"><b>${unsafeHTML(avatarName(responder))}</b><span>Отвечающий</span></div>
      </div>
    `;
  }

  render() {
    const filled1 = this._filledCount(1);
    const filled2 = this._filledCount(2);
    const r = this.results;

    return html`
      <div class="wrap-wide" style=${gameAccentStyle('ultimatum')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 10 минут</p>
          <h1>Разделите деньги на двоих — дважды</h1>
          <p class="lede">
            Мы разобьём вас на пары. Каждая пара играет два раунда, и во втором роли меняются
            местами — так оба партнёра успеют побыть в обеих ролях.
          </p>

          <div class="draft-mount">
            ${
              this.draft
                ? html`
                  <div class="draft-banner">
                    <span class="draft-text"
                      >${unsafeHTML(ICON_CLIPBOARD)} Есть незавершённая попытка (${timeAgo(this.draft.savedAt)}) — продолжить
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
                <b>Раунд 1: один — Предлагающий, другой — Отвечающий</b>
                <span
                  >Предлагающему достаётся ${STAKE} ₽, он решает, сколько предложить партнёру.
                  Отвечающий независимо называет минимальную сумму, на которую согласился бы.</span
                >
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Раунд 2: те же пары, роли наоборот</b>
                <span
                  >Кто был Отвечающим — теперь Предлагающий, и наоборот. Те же ${STAKE} ₽, то же
                  решение, только с другой стороны.</span
                >
              </div>
            </li>
          </ol>

          <p class="note">В каждом раунде оба решения в паре принимаются одновременно и независимо.</p>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.flow.advance(1)}>Распределить пары ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(0)}
        </section>

        <section class="${this.flow.roundClass(1)}" id="round-1">
          <div class="round-body">
          <p class="eyebrow">Распределение ролей</p>
          <h2>Кто с кем в паре</h2>
          <p class="lede">
            Роли на этом экране — только для раунда 1, во втором раунде они поменяются местами.
            Не нравится расклад — перемешайте.
          </p>

          <div>${this._pairsHolder()}</div>
          <button
            class="shuffle-btn ${this.shuffleSpin ? 'spin' : ''}"
            @click=${() => this._onShuffle()}
          >
            ${unsafeHTML(ICON_SHUFFLE)} Перемешать пары
          </button>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this._lockPairs()}>Дальше ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(1)}
        </section>

        <section class="${this.flow.roundClass(2)}" id="round-2">
          <div class="round-body">
          <p class="eyebrow">Раунд 1 из 2 · Сбор данных</p>
          <h2>Впишите решения каждой пары</h2>
          <p class="lede">
            Сколько предложил Предлагающий, и какой минимум назвал Отвечающий — оба из ${STAKE} ₽.
          </p>

          <div class="pair-entry-list" id="entry-body-1">
            ${this.entries.map((entry, i) => this._entryCard(entry, i, 1))}
          </div>

          <div class="fill-progress">
            Заполнено пар: <span>${filled1}</span> из <span>${this.entries.length}</span>
            <div class="track">
              <div style="width:${(filled1 / this.entries.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              id="next-btn-1"
              ?disabled=${!hasEnough(filled1, MIN_FILLED_PAIRS)}
              @click=${() => this.flow.advance(3)}
            >
              Раунд 2 — роли наоборот ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(2)}
        </section>

        <section class="${this.flow.roundClass(3)}" id="round-3">
          <div class="round-body">
          <p class="eyebrow">Раунд 2 из 2 · Роли поменялись</p>
          <h2>Те же пары, наоборот</h2>
          <p class="lede">Кто в раунде 1 отвечал — теперь предлагает, и наоборот.</p>

          <div class="pair-entry-list" id="entry-body-2">
            ${this.entries.map((entry, i) => this._entryCard(entry, i, 2))}
          </div>

          <div class="fill-progress">
            Заполнено пар: <span>${filled2}</span> из <span>${this.entries.length}</span>
            <div class="track">
              <div style="width:${(filled2 / this.entries.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(2)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              id="next-btn-2"
              ?disabled=${!hasEnough(filled2, MIN_FILLED_PAIRS)}
              @click=${() => this.flow.advance(4, () => this._showResults())}
            >
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(3)}
        </section>

        <section class="${this.flow.roundClass(4)}" id="round-4">
          <div class="round-body">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>

          ${renderReveal({ value: r ? r.dealRate : '—', ...REVEAL_COPY.ultimatum(r ? { deals: r.deals, total: r.instances.length, avgOffer: r.avgOffer, avgMin: r.avgMin } : null) })}

          <div class="group-compare">
            <div class="g low">
              <div class="t">Среднее предложение</div>
              <div class="v">${r ? `${Math.round(r.avgOffer)} ₽` : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Средний минимум для согласия</div>
              <div class="v">${r ? `${Math.round(r.avgMin)} ₽` : '—'}</div>
            </div>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Раунд</th>
                <th>Предлагающий</th>
                <th>Отвечающий</th>
                <th>Предложено</th>
                <th>Минимум</th>
                <th>Итог</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.instances.map(
                      (x) => html`
                      <tr>
                        <td>${x.round}</td>
                        <td class="name">${unsafeHTML(avatarName(x.proposer))}</td>
                        <td class="name">${unsafeHTML(avatarName(x.responder))}</td>
                        <td>${x.offer} ₽</td>
                        <td>${x.min} ₽</td>
                        <td>${isDeal(x) ? 'Сделка' : 'Отказ'}</td>
                      </tr>
                    `,
                    )
                  : ''
              }
            </tbody>
          </table>

          <div class="export-row">
            <button class="ghost" id="export-btn" @click=${(e) => ReportExport.download(e.currentTarget)}>
              ${unsafeHTML(ICON_DOWNLOAD)} Сохранить результаты
            </button>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(3)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(5)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(4)}
        </section>

        <section class="${this.flow.roundClass(5)}" id="round-5">
          <div class="round-body">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Ультиматум</h1>
          <p class="lede">
            Классическая экономическая теория предсказывает: рациональный Отвечающий согласится
            на любую ненулевую сумму. В реальности люди массово отвергают «несправедливые»
            предложения — даже теряя деньги.
          </p>

          <p>
            Игра формализована в статье Güth W., Schmittberger R., Schwarze B. (1982). An
            Experimental Analysis of Ultimatum Bargaining. <i>Journal of Economic Behavior &
            Organization</i> — одна из первых работ, экспериментально показавших, что модель
            «человека экономического» не описывает реальное поведение: люди систематически
            платят за справедливость и наказывают жадность.
          </p>

          <div class="stat-row">
            <div class="stat">
              <div class="n">40–50%</div>
              <div class="lab">типичное предложение в классических опытах</div>
            </div>
            <div class="stat">
              <div class="n">&lt;20%</div>
              <div class="lab">предложения такого размера обычно отвергают</div>
            </div>
          </div>

          <p>
            <b>Почему отказ — это тоже рациональное поведение, просто по другим правилам.</b> С
            точки зрения чистой выгоды отказ бессмыслен: Отвечающий теряет свою долю, а взамен
            ничего не получает — предлагающий тоже остаётся без денег, но это ему уже не поможет.
            Однако люди явно считают не только «сколько я получу», но и «насколько справедливо со
            мной обошлись» — а несправедливое предложение воспринимается как оскорбление, за
            которое стоит наказать, даже по цене собственных денег. Мозг обрабатывает такие
            ситуации отчасти эмоционально: сканирование мозга Отвечающих во время несправедливых
            предложений показывает активацию зон, связанных с отвращением и негативными эмоциями —
            то есть отказ ощущается не как холодный расчёт, а как что-то близкое к моральному
            возмущению.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Чувство «справедливой доли» не универсально</b
            ><span
              >Кросс-культурное исследование Henrich et al. (2001) в 15 небольших сообществах по
              всему миру показало, что средний размер «справедливого» предложения сильно
              варьируется между культурами — от ~26% до ~57%.</span
            >
          </div>
          <div class="fact">
            <b>Вы только что сыграли в обе роли</b
            ><span
              >В большинстве лабораторных версий этой игры участник — либо только Предлагающий,
              либо только Отвечающий. Сыграв оба раунда, вы могли заметить, что предложение самому
              себе «справедливым» и оценка чужого предложения как «справедливого» — не всегда одно
              и то же число.</span
            >
          </div>
          <div class="fact">
            <b>Отказ активирует те же зоны мозга, что и отвращение к еде</b
            ><span
              >Исследования на фМРТ (Sanfey et al., 2003) показали, что несправедливые предложения
              активируют островковую долю мозга — область, также отвечающую за реакцию на
              неприятные запахи и вкусы. Несправедливость буквально «противна» на нейронном
              уровне.</span
            >
          </div>
          <div class="fact">
            <b>Размер ставки почти не меняет картину</b
            ><span
              >Даже когда на кону оказываются суммы, эквивалентные нескольким месячным зарплатам
              (эксперименты проводили в странах с низким доходом, где ставки были очень весомыми
              относительно дохода участников), люди продолжают отвергать откровенно
              несправедливые предложения — хотя абсолютная цена отказа становится куда выше.</span
            >
          </div>
          <div class="fact">
            <b>Рабочая параллель</b
            ><span
              >Первое предложение на переговорах о зарплате или бюджете задаёт тон всему разговору
              — слишком низкий «якорь» может привести к отказу от сделки целиком, даже если
              условия объективно приемлемы.</span
            >
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
            <span></span>
          </div>
          </div>
          ${this.flow.lock(5)}
        </section>
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Ультиматум</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'ultimatum',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-ultimatum', RetroGameUltimatum);
