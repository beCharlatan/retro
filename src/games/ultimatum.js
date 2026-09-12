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
   conversions. Roles.makePairs()/swapInPairs() (pure data functions,
   no DOM) are reused as-is. Keeps all original plain ids
   (entry-body-1/2, next-btn-1/2, results-table/tbody, ...).
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderHome } from '../home.js';
import { Persist, timeAgo } from '../persist.js';
import { Print } from '../print.js';
import { Roles } from '../roles.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const STAKE = 1000;
const TOTAL_SCREENS = 6;

function buildEntries(assignment) {
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

export class RetroGameUltimatum extends LitElement {
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

    const loaded = Persist.load('ultimatum');
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
    Persist.clear('ultimatum');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('ultimatum');
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

  _onEntryInput(e, idx, field) {
    let v = e.target.value === '' ? null : Number(e.target.value);
    if (v !== null) {
      if (v < 0) v = 0;
      if (v > STAKE) v = STAKE;
    }
    this.entries = this.entries.map((entry, i) => (i === idx ? { ...entry, [field]: v } : entry));
    Persist.save('ultimatum', { assignment: this.assignment, entries: this.entries });
  }

  _filledCount(round) {
    const offerField = round === 1 ? 'r1_offer' : 'r2_offer';
    const minField = round === 1 ? 'r1_min' : 'r2_min';
    return this.entries.filter((e) => e[offerField] !== null && e[minField] !== null).length;
  }

  _showResults() {
    const instances = [];
    this.entries.forEach((e) => {
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
    const dealRate = instances.length ? Math.round((deals / instances.length) * 100) + '%' : '—';
    const avgOffer = instances.reduce((a, b) => a + b.offer, 0) / instances.length;
    const avgMin = instances.reduce((a, b) => a + b.min, 0) / instances.length;

    this.results = { instances, dealRate, avgOffer, avgMin };

    Print.mount(
      'print-header-ultimatum',
      {
        title: 'Ультиматум',
        subtitle: 'Люди отвергают выгодные предложения, если те кажутся нечестными.',
        meta: Print.meta(this.entries.length * 2, `${this.entries.length} пар · 2 раунда`),
        explanation:
          'Классическая теория предсказывает: рациональный Отвечающий согласится на любую ненулевую сумму — в реальности люди массово отвергают «несправедливые» предложения, даже теряя деньги. Игру формализовали Güth, Schmittberger и Schwarze в статье 1982 года.',
      },
      this.renderRoot,
    );

    this.goTo(4);
  }

  _reset() {
    this.assignment = Roles.makePairs(state.participants);
    this.selectedSwapName = null;
    this.entries = buildEntries(this.assignment);
    this.results = null;
    Persist.clear('ultimatum');
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
          <div class="role-pair-label">Предлагающий (раунд 1)</div>
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
          <div class="role-pair-label">Отвечающий (раунд 1)</div>
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

  _entryCard(entry, idx, round) {
    const proposer = round === 1 ? entry.a : entry.b;
    const responder = round === 1 ? entry.b : entry.a;
    const offerField = round === 1 ? 'r1_offer' : 'r2_offer';
    const minField = round === 1 ? 'r1_min' : 'r2_min';
    return html`
      <div class="pair-entry-card wide ${entry.trio ? 'role-pair-trio' : ''}">
        ${entry.trio ? html`<span class="role-pair-trio-badge">🔺 трио</span>` : ''}
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
      <div class="wrap narrow">
        <div class="game-crumb">
          <button class="back-link" @click=${this._goHome}>← Все игры</button>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">Ультиматум</span>
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
            <button class="primary" @click=${() => this.goTo(1)}>Распределить пары →</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 1 ? 'active' : ''}">
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
            🎲 Перемешать пары
          </button>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(0)}>← Назад</button>
            <button class="primary" @click=${() => this._lockPairs()}>Дальше →</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 2 ? 'active' : ''}">
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
            <button class="ghost" @click=${() => this.goTo(1)}>← Назад</button>
            <button
              class="primary"
              id="next-btn-1"
              ?disabled=${filled1 < 1}
              @click=${() => this.goTo(3)}
            >
              Раунд 2 — роли наоборот →
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 3 ? 'active' : ''}">
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
            <button class="ghost" @click=${() => this.goTo(2)}>← Назад</button>
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

        <section class="screen ${this.screenIdx === 4 ? 'active' : ''}">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>
          <div class="print-header" id="print-header-ultimatum"></div>

          <div class="reveal">
            <div class="n">${r ? r.dealRate : '—'}</div>
            <p>
              <b>Доля сделок, которые состоялись</b> — по обоим раундам сразу, то есть по всем
              случаям, когда кто-то был Предлагающим.
            </p>
          </div>

          <div class="group-compare">
            <div class="g low">
              <div class="t">Среднее предложение</div>
              <div class="v">${r ? Math.round(r.avgOffer) + ' ₽' : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Средний минимум для согласия</div>
              <div class="v">${r ? Math.round(r.avgMin) + ' ₽' : '—'}</div>
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
                        <td>${x.offer >= x.min ? 'Сделка' : 'Отказ'}</td>
                      </tr>
                    `,
                    )
                  : ''
              }
            </tbody>
          </table>

          <div class="print-footer" id="print-footer-ultimatum"></div>

          <div class="pdf-row">
            <button class="ghost" id="pdf-btn" @click=${() => Print.run()}>
              🖨️ Сохранить / отправить PDF
            </button>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(3)}>← Назад</button>
            <button class="primary" @click=${() => this.goTo(5)}>Что это было? →</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 5 ? 'active' : ''}">
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
        </section>
      </div>
    `;
  }
}

customElements.define('retro-game-ultimatum', RetroGameUltimatum);
