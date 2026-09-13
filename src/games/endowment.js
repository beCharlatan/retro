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
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_LEFT, ICON_RIGHT } from '../icons.js';
import { Persist, timeAgo } from '../persist.js';
import { Print } from '../print.js';
import { Roles } from '../roles.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const TOTAL_SCREENS = 6;

// r1Role is where they start (from the groups screen); r2Role is
// always the opposite — that's the whole point of round 2.
function buildEntries(groups) {
  const owners = groups.groupA.map((n) => ({
    name: n,
    r1Role: 'owner',
    r2Role: 'buyer',
    r1Price: null,
    r2Price: null,
  }));
  const buyers = groups.groupB.map((n) => ({
    name: n,
    r1Role: 'buyer',
    r2Role: 'owner',
    r1Price: null,
    r2Price: null,
  }));
  return owners.concat(buyers);
}

export class RetroGameEndowment extends LitElement {
  static styles = sharedStyles;

  static properties = {
    screenIdx: { state: true },
    groups: { state: true },
    entries: { state: true },
    draft: { state: true },
    results: { state: true },
    selectedSwapName: { state: true },
    shuffleSpin: { state: true },
  };

  constructor() {
    super();
    this.screenIdx = 0;
    this.groups = Roles.makeGroups(state.participants);
    this.entries = buildEntries(this.groups);
    this.results = null;
    this.selectedSwapName = null;
    this.shuffleSpin = false;

    const loaded = Persist.load('endowment');
    this.draft =
      loaded &&
      Array.isArray(loaded.payload.entries) &&
      loaded.payload.entries.length === state.participants.length
        ? loaded
        : null;
  }

  goTo(idx) {
    this.screenIdx = idx;
  }

  _restoreDraft() {
    this.groups = this.draft.payload.groups;
    this.entries = this.draft.payload.entries;
    this.draft = null;
    this.goTo(2);
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
    this.entries = buildEntries(this.groups);
    this.goTo(2);
  }

  _onEntryInput(e, idx, round) {
    const priceField = round === 1 ? 'r1Price' : 'r2Price';
    let v = e.target.value === '' ? null : Number(e.target.value);
    if (v !== null && v < 0) v = 0;
    this.entries = this.entries.map((entry, i) =>
      i === idx ? { ...entry, [priceField]: v } : entry,
    );
    Persist.save('endowment', { groups: this.groups, entries: this.entries });
  }

  _filledCount(round) {
    const priceField = round === 1 ? 'r1Price' : 'r2Price';
    return this.entries.filter((e) => e[priceField] !== null).length;
  }

  _showResults() {
    const filled = this.entries.filter((e) => e.r1Price !== null && e.r2Price !== null);

    // Everyone gave one WTA (as owner) and one WTP (as buyer) — pick the
    // right value from whichever round they held each role in.
    const wtaOf = (e) => (e.r1Role === 'owner' ? e.r1Price : e.r2Price);
    const wtpOf = (e) => (e.r1Role === 'buyer' ? e.r1Price : e.r2Price);
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const avgWTA = avg(filled.map(wtaOf));
    const avgWTP = avg(filled.map(wtpOf));
    const ratio =
      avgWTA !== null && avgWTP !== null && avgWTP > 0 ? (avgWTA / avgWTP).toFixed(1) : null;

    this.results = { filled, avgWTA, avgWTP, ratio, wtaOf, wtpOf };

    Print.mount(
      'print-header-endowment',
      {
        title: 'Эффект владения',
        subtitle: 'Та же вещь внезапно дороже для того, кто ей уже владеет.',
        meta: Print.meta(filled.length, '2 раунда, роли поменялись'),
        explanation:
          'Одна и та же вещь субъективно ценнее для того, кто ею уже владеет, чем для того, кто хочет её купить, хотя рационально цена должна быть одной и той же. Знаменитый «эксперимент с кружками» описан в статье Kahneman, Knetsch, Thaler (1990) — эффект считается частным случаем неприятия потерь (loss aversion).',
      },
      this.renderRoot,
    );

    this.goTo(4);
  }

  _reset() {
    this.groups = Roles.makeGroups(state.participants);
    this.selectedSwapName = null;
    this.entries = buildEntries(this.groups);
    this.results = null;
    Persist.clear('endowment');
    this.goTo(0);
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
      <div class="wrap narrow">
        <div class="game-crumb">
          <button class="back-link" @click=${this._goHome}>${unsafeHTML(ICON_LEFT)} Все игры</button>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">Эффект владения</span>
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
            <button class="primary" @click=${() => this.goTo(1)}>Распределить группы ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 1 ? 'active' : ''}">
          <p class="eyebrow">Распределение ролей</p>
          <h2>Кто продаёт, кто покупает — в раунде 1</h2>
          <p class="lede">Во втором раунде роли поменяются местами автоматически. Не нравится расклад — перемешайте.</p>

          <div>${this._groupsHolder()}</div>
          <button
            class="shuffle-btn ${this.shuffleSpin ? 'spin' : ''}"
            @click=${() => this._onShuffle()}
          >
            🎲 Перемешать группы
          </button>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this._lockGroups()}>Дальше ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 2 ? 'active' : ''}">
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
            <button class="ghost" @click=${() => this.goTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              id="next-btn-1"
              ?disabled=${filled1 < 2}
              @click=${() => this.goTo(3)}
            >
              Раунд 2 — роли наоборот ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 3 ? 'active' : ''}">
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
            <button class="ghost" @click=${() => this.goTo(2)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              id="next-btn-2"
              ?disabled=${filled2 < 2}
              @click=${() => this._showResults()}
            >
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 4 ? 'active' : ''}">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>
          <div class="print-header" id="print-header-endowment"></div>

          <div class="reveal">
            <div class="n">${r && r.ratio !== null ? r.ratio + '×' : '—'}</div>
            <p>
              <b>Во столько раз</b> средняя цена продажи оказалась выше средней цены покупки — по
              всем ${this.entries.length} людям сразу, ведь каждый побывал в обеих ролях.
            </p>
          </div>

          <div class="group-compare">
            <div class="g low">
              <div class="t">Средняя цена продажи (в роли владельца)</div>
              <div class="v">${r && r.avgWTA !== null ? Math.round(r.avgWTA) + ' ₽' : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Средняя цена покупки (в роли покупателя)</div>
              <div class="v">${r && r.avgWTP !== null ? Math.round(r.avgWTP) + ' ₽' : '—'}</div>
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

          <div class="print-footer" id="print-footer-endowment"></div>

          <div class="pdf-row">
            <button class="ghost" id="pdf-btn" @click=${() => Print.run()}>
              🖨️ Сохранить / отправить PDF
            </button>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(3)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.goTo(5)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 5 ? 'active' : ''}">
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
        </section>
      </div>
    `;
  }
}

customElements.define('retro-game-endowment', RetroGameEndowment);
