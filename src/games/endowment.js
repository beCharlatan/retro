/* =========================================================
   GAME: Эффект владения (endowment)
   Two rounds instead of one: round 1 keeps the groups as
   assigned, round 2 swaps roles — owners become buyers and
   buyers become owners, for the same mug. Everyone ends up
   giving both a WTA and a WTP price, which doubles the sample
   behind each average instead of splitting the room in half.

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   first game with a group-split/click-to-swap screen (the group
   equivalent of ultimatum.js's pairing screen; see that file's header
   comment for why Roles.groupsHTML()/bindGroupSwap() aren't reused).
   Roles.makeGroups()/swapInGroups() (pure data, no DOM) are reused as
   -is. Keeps all original plain ids.
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
  ICON_X,
} from '../icons.js';
import {
  buildEndowmentEntries,
  countFilled,
  hasEnough,
  hasFields,
  loadableDraft,
  parseNumberInput,
  patchRow,
} from '../logic/entries.js';
import { endowmentResults } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { Roles } from '../roles.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const TOTAL_SCREENS = 6;
const ROUND_TITLES = [
  'Одна кружка, две цены — и роли поменяются',
  'Кто продаёт, кто покупает — в раунде 1',
  'Впишите цену каждого участника',
  'Та же кружка, противоположная роль',
  'Что получилось у вашей команды',
  'Эффект владения',
];

// r1Role is where they start (from the groups screen); r2Role is
// always the opposite — that's the whole point of round 2.
export class RetroGameEndowment extends LitElement {
  static styles = sharedStyles;

  static properties = {
    groups: { state: true },
    entries: { state: true },
    draft: { state: true },
    results: { state: true },
    selectedSwapName: { state: true },
    shuffleSpin: { state: true },
  };

  constructor() {
    super();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.groups = Roles.makeGroups(state.participants);
    this.entries = buildEndowmentEntries(this.groups);
    this.results = null;
    this.selectedSwapName = null;
    this.shuffleSpin = false;

    this.draft = loadableDraft(Persist.load('endowment'), {
      key: 'entries',
      length: state.participants.length,
    });
  }

  _restoreDraft() {
    this.flow.advance(2, () => {
      this.groups = this.draft.payload.groups;
      this.entries = this.draft.payload.entries;
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear('endowment');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('endowment');
    renderHome();
  }

  _onShuffle() {
    this.groups = Roles.makeGroups(state.participants);
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
    Roles.swapInGroups(this.groups, this.selectedSwapName, name);
    this.selectedSwapName = null;
    this.groups = { ...this.groups };
  }

  _lockGroups() {
    this.flow.advance(2, () => {
      this.entries = buildEndowmentEntries(this.groups);
    });
  }

  _onEntryInput(e, idx, round) {
    const priceField = round === 1 ? 'r1Price' : 'r2Price';
    this.entries = patchRow(this.entries, idx, {
      [priceField]: parseNumberInput(e.target.value, { min: 0 }),
    });
    Persist.save('endowment', { groups: this.groups, entries: this.entries });
  }

  _filledCount(round) {
    const priceField = round === 1 ? 'r1Price' : 'r2Price';
    return countFilled(this.entries, hasFields(priceField));
  }

  _showResults() {
    this.results = endowmentResults(this.entries);
    const { filled } = this.results;

    ReportExport.register(
      'endowment',
      {
        subtitle: 'Та же вещь внезапно дороже для того, кто ей уже владеет.',
        meta: ReportExport.meta(filled.length, '2 раунда, роли поменялись'),
        explanation:
          'Одна и та же вещь субъективно ценнее для того, кто ею уже владеет, чем для того, кто хочет её купить, хотя рационально цена должна быть одной и той же. Знаменитый «эксперимент с кружками» описан в статье Kahneman, Knetsch, Thaler (1990) — эффект считается частным случаем неприятия потерь (loss aversion).',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.groups = Roles.makeGroups(state.participants);
    this.selectedSwapName = null;
    this.entries = buildEndowmentEntries(this.groups);
    this.results = null;
    Persist.clear('endowment');
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _groupsHolder() {
    const { groupA, groupB } = this.groups;
    const chip = (n) => html`
      <button
        type="button"
        class="role-chip ${this.selectedSwapName === n ? 'swap-selected' : ''}"
        @click=${() => this._onSwapClick(n)}
      >
        ${unsafeHTML(avatarName(n))}
      </button>
    `;
    return html`
      <div class="role-groups">
        <div class="role-group-col role-group-a">
          <div class="role-group-title">
            Владельцы (раунд 1) <span class="note" style="margin:0;">· ${groupA.length} чел.</span>
          </div>
          <div class="role-group-chips">${groupA.map(chip)}</div>
        </div>
        <div class="role-group-col role-group-b">
          <div class="role-group-title">
            Покупатели (раунд 1) <span class="note" style="margin:0;">· ${groupB.length} чел.</span>
          </div>
          <div class="role-group-chips">${groupB.map(chip)}</div>
        </div>
      </div>
      <p class="note swap-hint">Нажмите на двух участников по очереди, чтобы поменять их местами.</p>
    `;
  }

  _entrySection(title, list, cls, round) {
    const priceField = round === 1 ? 'r1Price' : 'r2Price';
    return html`
      <div class="team-entry-group ${cls}">
        <div class="team-entry-group-title">${title} <span class="count">· ${list.length} чел.</span></div>
        <div class="team-entry-list">
          ${list.map(
            (e) => html`
              <div class="team-entry-card">
                <div class="team-entry-name">${unsafeHTML(avatarName(e.name))}</div>
                <input
                  type="number"
                  min="0"
                  inputmode="numeric"
                  placeholder="₽"
                  .value=${e[priceField] ?? ''}
                  @input=${(ev) => this._onEntryInput(ev, e.idx, round)}
                />
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  _entryRound(round) {
    const roleField = round === 1 ? 'r1Role' : 'r2Role';
    const withIdx = this.entries.map((e, i) => ({ ...e, idx: i }));
    const owners = withIdx.filter((e) => e[roleField] === 'owner');
    const buyers = withIdx.filter((e) => e[roleField] === 'buyer');
    return html`
      ${this._entrySection('Владельцы · продают', owners, 'team-a', round)}
      ${this._entrySection('Покупатели · покупают', buyers, 'team-b', round)}
    `;
  }

  render() {
    const filled1 = this._filledCount(1);
    const filled2 = this._filledCount(2);
    const r = this.results;

    return html`
      <div class="wrap-wide" style=${gameAccentStyle('endowment')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 9 минут</p>
          <h1>Одна кружка, две цены — и роли поменяются</h1>
          <p class="lede">
            Два раунда. В первом одна половина продаёт, другая покупает. Во втором — наоборот, с
            той же кружкой.
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
                <b>Представьте фирменную кружку команды</b>
                <span>Обычная кружка с логотипом — ничего особенного, просто повод для решения о цене.</span>
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Раунд 1 — одна роль, раунд 2 — противоположная</b>
                <span
                  >Владельцы называют минимальную цену продажи, покупатели — максимальную цену
                  покупки. Во втором раунде каждый оказывается в противоположной роли — с той же
                  кружкой.</span
                >
              </div>
            </li>
          </ol>

          <p class="note">
            Отвечайте первым пришедшим в голову числом — это не должно занимать больше пары
            секунд раздумий.
          </p>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.flow.advance(1)}>Распределить группы ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(0)}
        </section>

        <section class="${this.flow.roundClass(1)}" id="round-1">
          <div class="round-body">
          <p class="eyebrow">Распределение ролей</p>
          <h2>Кто продаёт, кто покупает — в раунде 1</h2>
          <p class="lede">Во втором раунде роли поменяются местами автоматически. Не нравится расклад — перемешайте.</p>

          <div>${this._groupsHolder()}</div>
          <button
            class="shuffle-btn ${this.shuffleSpin ? 'spin' : ''}"
            @click=${() => this._onShuffle()}
          >
            ${unsafeHTML(ICON_SHUFFLE)} Перемешать группы
          </button>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this._lockGroups()}>Дальше ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(1)}
        </section>

        <section class="${this.flow.roundClass(2)}" id="round-2">
          <div class="round-body">
          <p class="eyebrow">Раунд 1 из 2</p>
          <h2>Впишите цену каждого участника</h2>
          <p class="lede">Владельцы называют минимальную цену продажи, покупатели — максимальную цену покупки.</p>

          <div id="entry-body-1">${this._entryRound(1)}</div>

          <div class="fill-progress">
            Заполнено: <span>${filled1}</span> из <span>${this.entries.length}</span>
            <div class="track">
              <div style="width:${(filled1 / this.entries.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              id="next-btn-1"
              ?disabled=${!hasEnough(filled1)}
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
          <h2>Та же кружка, противоположная роль</h2>
          <p class="lede">Кто в раунде 1 продавал — теперь покупает, и наоборот.</p>

          <div id="entry-body-2">${this._entryRound(2)}</div>

          <div class="fill-progress">
            Заполнено: <span>${filled2}</span> из <span>${this.entries.length}</span>
            <div class="track">
              <div style="width:${(filled2 / this.entries.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(2)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              id="next-btn-2"
              ?disabled=${!hasEnough(filled2)}
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

          ${renderReveal({ value: r && r.ratio !== null ? `${r.ratio}×` : '—', ...REVEAL_COPY.endowment(r ? { avgWTA: r.avgWTA, avgWTP: r.avgWTP, ratio: r.ratio === null ? null : Number(r.ratio) } : null) })}

          <div class="group-compare">
            <div class="g low team-a">
              <div class="t">Средняя цена продажи (в роли владельца)</div>
              <div class="v">${r && r.avgWTA !== null ? `${Math.round(r.avgWTA)} ₽` : '—'}</div>
            </div>
            <div class="g high team-b">
              <div class="t">Средняя цена покупки (в роли покупателя)</div>
              <div class="v">${r && r.avgWTP !== null ? `${Math.round(r.avgWTP)} ₽` : '—'}</div>
            </div>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Как владелец</th>
                <th>Как покупатель</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.map(
                      (e) => html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(e.name))}</td>
                        <td>${r.wtaOf(e)} ₽</td>
                        <td>${r.wtpOf(e)} ₽</td>
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
          <h1>Эффект владения</h1>
          <p class="lede">
            Одна и та же вещь субъективно ценнее для того, кто ею уже «владеет», чем для того,
            кто хочет её купить — хотя рационально цена должна быть одна и та же.
          </p>

          <p>
            Знаменитый «эксперимент с кружками» описан в статье Kahneman D., Knetsch J. L.,
            Thaler R. H. (1990). Experimental Tests of the Endowment Effect and the Coase
            Theorem. <i>Journal of Political Economy</i>. Половине студентов раздали кружки и
            предложили их продать, другой половине предложили купить такую же кружку. Средняя
            цена продажи оказалась примерно вдвое выше средней цены покупки.
          </p>

          <p>
            По теореме Коуза, при нулевых транзакционных издержках итоговое распределение не
            должно зависеть от того, кому изначально досталось владение — цена продажи и цена
            покупки должны сходиться. На практике они систематически расходятся.
          </p>

          <p>
            <b>Почему владение меняет ощущение ценности.</b> Пока вещь ещё не ваша, вы оцениваете
            её просто как один из вариантов — «сколько я готов заплатить за эту кружку среди
            прочих способов потратить эти деньги». Но как только вещь становится вашей, точка
            отсчёта смещается: теперь вы думаете не «сколько это стоит», а «что я потеряю, если
            отдам её».
          </p>

          <p>
            <b>Зачем нужен именно второй раунд.</b> В классическом дизайне WTA и WTP называют
            РАЗНЫЕ люди — а значит, разницу можно списать на то, что одни от природы просто более
            прижимистые продавцы, а другие — более расчётливые покупатели. Когда роли меняются
            местами, каждый называет обе цены за одну и ту же кружку — и разница между «моя цена
            продажи» и «моя цена покупки» становится чисто личным эффектом, а не различием между
            двумя разными группами людей.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Не для всех вещей одинаково сильно</b
            ><span
              >Эффект слабее выражен для вещей, купленных «для перепродажи» — трейдеры не
              успевают привязаться к товару — и заметно сильнее для вещей с личной или
              эмоциональной ценностью.</span
            >
          </div>
          <div class="fact">
            <b>Это не совсем ошибка, а часть психологии потери</b
            ><span
              >Эффект владения — частный случай неприятия потерь (loss aversion): расставание с
              вещью ощущается как потеря, а потери переживаются острее, чем эквивалентные по
              размеру приобретения.</span
            >
          </div>
          <div class="fact">
            <b>Достаточно нескольких секунд владения</b
            ><span
              >В экспериментах эффект проявляется даже тогда, когда предмет побывал в руках
              участника буквально пару минут перед «продажей» — для его возникновения не нужны
              недели привязанности.</span
            >
          </div>
          <div class="fact">
            <b>Влияет на реальные рынки жилья</b
            ><span
              >Владельцы недвижимости во время падения цен систематически выставляют квартиры
              дороже рыночной стоимости и дольше не соглашаются на снижение — им психологически
              труднее «признать» уменьшение ценности того, что уже принадлежит им.</span
            >
          </div>
          <div class="fact">
            <b>Пробные периоды используют этот же механизм</b
            ><span
              >«30 дней бесплатно, потом можно отказаться» работает лучше простой продажи именно
              потому, что после пробного периода товар или подписка уже ощущаются как «свои» —
              отказаться от них труднее, чем изначально не подписываться.</span
            >
          </div>
          <div class="fact">
            <b>Рабочая параллель</b
            ><span
              >Команда обычно переоценивает ценность своего же кода, процесса или архитектурного
              решения именно потому, что уже «владеет» им — сторонний взгляд почти всегда
              оценивает то же самое дешевле.</span
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
            <div class="game-rail-title">Эффект владения</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'endowment',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-endowment', RetroGameEndowment);
