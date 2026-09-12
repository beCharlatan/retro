/* =========================================================
   GAME: Эффект фрейминга (framing)

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same declarative group-split/click-to-swap pattern as endowment.js,
   plus the first game combining copy-to-clipboard (see barnum.js)
   with a hide/reveal spoiler toggle for two independent texts. Keeps
   all original plain ids (toggle-a/b, copy-a/b, text-a/b,
   placeholder-a/b, entry-body, results-table/tbody, ...).
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderHome } from '../home.js';
import { Persist, timeAgo } from '../persist.js';
import { Print } from '../print.js';
import { Roles } from '../roles.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { copyToClipboard } from '../toast.js';

const TOTAL_SCREENS = 6;
const GROUP_LABEL = { A: 'А', B: 'Б' };

// Spoiler + copy-to-clipboard for each group's scenario text, so the
// facilitator can send the right wording privately instead of
// reading both aloud off a shared screen.
const SCENARIO_TEXT = {
  a:
    'Готовится проект, в котором участвуют 600 человек. Есть две программы действий.\n\n' +
    'Программа 1 — спасено ровно 200 человек.\n' +
    'Программа 2 — с вероятностью 1/3 спасены все 600, с вероятностью 2/3 не спасён никто.\n\n' +
    'Какую программу вы выбираете?',
  b:
    'Готовится проект, в котором участвуют 600 человек. Есть две программы действий.\n\n' +
    'Программа 1 — умрёт ровно 400 человек.\n' +
    'Программа 2 — с вероятностью 1/3 никто не умрёт, с вероятностью 2/3 умрут все 600.\n\n' +
    'Какую программу вы выбираете?',
};

function buildEntries(groups) {
  const a = groups.groupA.map((n) => ({ name: n, group: 'A', choice: null }));
  const b = groups.groupB.map((n) => ({ name: n, group: 'B', choice: null }));
  return a.concat(b);
}

export class RetroGameFraming extends LitElement {
  static styles = sharedStyles;

  static properties = {
    screenIdx: { state: true },
    groups: { state: true },
    entries: { state: true },
    draft: { state: true },
    results: { state: true },
    selectedSwapName: { state: true },
    shuffleSpin: { state: true },
    textHidden: { state: true },
  };

  constructor() {
    super();
    this.screenIdx = 0;
    this.groups = Roles.makeGroups(state.participants);
    this.entries = buildEntries(this.groups);
    this.results = null;
    this.selectedSwapName = null;
    this.shuffleSpin = false;
    this.textHidden = { a: true, b: true };

    const loaded = Persist.load('framing');
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
    this.goTo(3);
  }

  _discardDraft() {
    Persist.clear('framing');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('framing');
    renderHome();
  }

  _onShuffle() {
    this.groups = Roles.makeGroups(state.participants);
    this.entries = buildEntries(this.groups);
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

  _toggleText(key) {
    this.textHidden = { ...this.textHidden, [key]: !this.textHidden[key] };
  }

  _copyText(key, e) {
    copyToClipboard(SCENARIO_TEXT[key], e.currentTarget);
  }

  // Matches the legacy behaviour exactly: pressing "Вносить данные →"
  // always (re)builds fresh blank entries for the current groups —
  // see docs/modernization-plan.md / this file's git history if that
  // ever needs revisiting; preserved as-is here, not a new choice.
  _enterData() {
    this.entries = buildEntries(this.groups);
    this.goTo(3);
  }

  _onToggleChoice(idx, val) {
    this.entries = this.entries.map((e, i) => (i === idx ? { ...e, choice: val } : e));
    Persist.save('framing', { groups: this.groups, entries: this.entries });
  }

  _filledCount() {
    return this.entries.filter((e) => e.choice !== null).length;
  }

  _showResults() {
    const filled = this.entries.filter((e) => e.choice !== null);
    const groupAEntries = filled.filter((e) => e.group === 'A');
    const groupBEntries = filled.filter((e) => e.group === 'B');
    const riskyPct = (arr) =>
      arr.length
        ? Math.round((arr.filter((e) => e.choice === '2').length / arr.length) * 100)
        : null;
    const aRisky = riskyPct(groupAEntries);
    const bRisky = riskyPct(groupBEntries);

    let flipText = '—';
    let flipDetail =
      '<b>Доля выбравших рискованную Программу 2</b> в каждой группе — при одинаковых числах внутри дилеммы.';
    if (aRisky !== null && bRisky !== null) {
      const flipped = bRisky > aRisky;
      flipText = flipped ? 'Формулировка сработала' : 'В этот раз без переворота';
      flipDetail = `<b>Группа Б выбрала риск на ${Math.abs(bRisky - aRisky)} п.п. ${flipped ? 'чаще' : 'реже'}</b>, чем Группа А — при абсолютно одинаковых числах внутри дилеммы, разница только в словах.`;
    }

    this.results = { filled, aRisky, bRisky, flipText, flipDetail };

    Print.mount(
      'print-header-framing',
      {
        title: 'Эффект фрейминга',
        subtitle:
          'Один и тот же выбор выглядит разумным или рискованным — в зависимости от формулировки.',
        meta: Print.meta(filled.length),
        explanation:
          'Одна и та же по сути информация, поданная как выигрыш или как потеря, приводит к разным решениям — хотя математически варианты идентичны. Классический эксперимент — Tversky, Kahneman (1981), легший в основу теории перспектив, за которую Канеман получил Нобелевскую премию по экономике в 2002 году.',
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
    this.textHidden = { a: true, b: true };
    Persist.clear('framing');
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
            Группа А <span class="note" style="margin:0;">· ${groupA.length} чел.</span>
          </div>
          <div class="role-group-chips">${groupA.map(chip)}</div>
        </div>
        <div class="role-group-col role-group-b">
          <div class="role-group-title">
            Группа Б <span class="note" style="margin:0;">· ${groupB.length} чел.</span>
          </div>
          <div class="role-group-chips">${groupB.map(chip)}</div>
        </div>
      </div>
      <p class="note swap-hint">Нажмите на двух участников по очереди, чтобы поменять их местами.</p>
    `;
  }

  _spoilerCard(key, groupLabel, borderColor) {
    const hidden = this.textHidden[key];
    return html`
      <div class="quote-card spoiler-card" style=${borderColor ? `border-left-color:${borderColor};` : ''}>
        <div class="spoiler-head">
          <b>Группа ${groupLabel}</b>
          <div class="spoiler-actions">
            <button
              type="button"
              class="ghost spoiler-toggle"
              id="toggle-${key}"
              @click=${() => this._toggleText(key)}
            >
              ${hidden ? '👁 Показать' : '🙈 Скрыть'}
            </button>
            <button type="button" class="ghost" id="copy-${key}" @click=${(e) => this._copyText(key, e)}>
              📋 Скопировать
            </button>
          </div>
        </div>
        <p class="spoiler-placeholder" id="placeholder-${key}" ?hidden=${!hidden}>
          Текст скрыт — нажмите «Показать», чтобы прочитать самому, или сразу скопируйте и
          отправьте группе ${groupLabel} в чат.
        </p>
        <p class="spoiler-text" id="text-${key}" ?hidden=${hidden}>
          ${
            key === 'a'
              ? html`Программа 1 — «спасено ровно 200 человек».<br />Программа 2 — «с вероятностью
              ⅓ спасены все 600, с вероятностью ⅔ не спасён никто».`
              : html`Программа 1 — «умрёт ровно 400 человек».<br />Программа 2 — «с вероятностью ⅓
              никто не умрёт, с вероятностью ⅔ умрут все 600».`
          }
        </p>
      </div>
    `;
  }

  _entrySection(title, list, cls) {
    return html`
      <div class="team-entry-group ${cls}">
        <div class="team-entry-group-title">${title} <span class="count">· ${list.length} чел.</span></div>
        <div class="team-entry-list">
          ${list.map(
            (e) => html`
              <div class="team-entry-card wide-control">
                <div class="team-entry-name">${unsafeHTML(avatarName(e.name))}</div>
                <div class="toggle-pair">
                  <button
                    type="button"
                    data-val="1"
                    class="${e.choice === '1' ? 'on' : ''}"
                    @click=${() => this._onToggleChoice(e.idx, '1')}
                  >
                    Программа 1
                  </button>
                  <button
                    type="button"
                    data-val="2"
                    class="${e.choice === '2' ? 'on' : ''}"
                    @click=${() => this._onToggleChoice(e.idx, '2')}
                  >
                    Программа 2
                  </button>
                </div>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  render() {
    const filled = this._filledCount();
    const r = this.results;
    const withIdx = this.entries.map((e, i) => ({ ...e, idx: i }));
    const listA = withIdx.filter((e) => e.group === 'A');
    const listB = withIdx.filter((e) => e.group === 'B');

    return html`
      <div class="wrap narrow">
        <div class="game-crumb">
          <button class="back-link" @click=${this._goHome}>← Все игры</button>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">Эффект фрейминга</span>
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
          <p class="eyebrow">Командное упражнение · 7 минут</p>
          <h1>Один выбор, две формулировки</h1>
          <p class="lede">
            Мы разделим вас на две группы. Каждая услышит свою версию одной и той же дилеммы — с
            одинаковыми числами внутри.
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
                <b>Группы получат разные формулировки</b>
                <span>Числа и суть решения одинаковы для всех — отличаются только слова, которыми это описано.</span>
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Каждый выбирает одну из двух программ</b>
                <span>Программу 1 (без риска) или Программу 2 (с риском) — только свою, из формулировки для своей группы.</span>
              </div>
            </li>
          </ol>

          <p class="note">Дальше мы распределим группы и покажем каждой её текст отдельно.</p>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.goTo(1)}>Распределить группы →</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 1 ? 'active' : ''}">
          <p class="eyebrow">Распределение ролей</p>
          <h2>Кто в какой группе</h2>
          <p class="lede">Не нравится расклад — перемешайте.</p>

          <div>${this._groupsHolder()}</div>
          <button
            class="shuffle-btn ${this.shuffleSpin ? 'spin' : ''}"
            @click=${() => this._onShuffle()}
          >
            🎲 Перемешать группы
          </button>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(0)}>← Назад</button>
            <button class="primary" @click=${() => this.goTo(2)}>Дальше →</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 2 ? 'active' : ''}">
          <p class="eyebrow">Сценарий</p>
          <h2>Текст для каждой группы — по отдельности</h2>
          <p class="lede">
            Готовится проект, в котором участвуют 600 человек. Есть две программы действий.
            Тексты спрятаны — раскройте или скопируйте только тот, что нужен, и отправьте его
            своей группе в чат.
          </p>

          ${this._spoilerCard('a', 'А', null)}
          ${this._spoilerCard('b', 'Б', 'var(--rust)')}

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(1)}>← Назад</button>
            <button class="primary" @click=${() => this._enterData()}>Вносить данные →</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 3 ? 'active' : ''}">
          <p class="eyebrow">Сбор данных</p>
          <h2>Впишите выбор каждого участника</h2>
          <p class="lede">Программа 1 (без риска) или Программа 2 (с риском) — по формулировке своей группы.</p>

          <div id="entry-body">
            ${this._entrySection('Группа А', listA, 'team-a')}
            ${this._entrySection('Группа Б', listB, 'team-b')}
          </div>

          <div class="fill-progress">
            Заполнено: <span>${filled}</span> из <span>${this.entries.length}</span>
            <div class="track">
              <div style="width:${(filled / this.entries.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(2)}>← Назад</button>
            <button class="primary" ?disabled=${filled < 2} @click=${() => this._showResults()}>
              Показать результаты →
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 4 ? 'active' : ''}">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>
          <div class="print-header" id="print-header-framing"></div>

          <div class="reveal">
            <div class="n">${r ? r.flipText : '—'}</div>
            <p>
              ${
                r
                  ? unsafeHTML(r.flipDetail)
                  : html`<b>Доля выбравших рискованную Программу 2</b> в каждой группе — при
                  одинаковых числах внутри дилеммы.`
              }
            </p>
          </div>

          <div class="group-compare">
            <div class="g low">
              <div class="t">Группа А (формулировка выигрыша) · риск</div>
              <div class="v">${r && r.aRisky !== null ? r.aRisky + '%' : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Группа Б (формулировка потери) · риск</div>
              <div class="v">${r && r.bRisky !== null ? r.bRisky + '%' : '—'}</div>
            </div>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Группа</th>
                <th>Выбор</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.map(
                      (e) => html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(e.name))}</td>
                        <td>${GROUP_LABEL[e.group]}</td>
                        <td>Программа ${e.choice}</td>
                      </tr>
                    `,
                    )
                  : ''
              }
            </tbody>
          </table>

          <div class="print-footer" id="print-footer-framing"></div>

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
          <h1>Эффект фрейминга</h1>
          <p class="lede">
            Одна и та же по сути информация, поданная как «выигрыш» или как «потеря», приводит к
            разным решениям — хотя математически варианты идентичны.
          </p>

          <p>
            Это адаптация знаменитой «проблемы азиатской болезни» из статьи Tversky A., Kahneman
            D. (1981). The Framing of Decisions and the Psychology of Choice. <i>Science</i>,
            211(4481) — одного из ключевых экспериментов, лёгших в основу «теории перспектив»
            (prospect theory), за которую Канеман получил Нобелевскую премию по экономике в 2002
            году.
          </p>

          <div class="stat-row">
            <div class="stat">
              <div class="n">~72%</div>
              <div class="lab">выбирают безопасный вариант при формулировке выигрыша</div>
            </div>
            <div class="stat">
              <div class="n">~78%</div>
              <div class="lab">выбирают рискованный вариант при формулировке потери</div>
            </div>
          </div>

          <p>
            <b>Почему одинаковые числа ощущаются по-разному.</b> Согласно теории перспектив, люди
            оценивают исходы не в абсолютных величинах, а относительно точки отсчёта — и реагируют
            на выигрыши и потери несимметрично. Когда решение подано как выигрыш («спасено 200 из
            600»), мы становимся осторожными: гарантированный небольшой выигрыш кажется
            привлекательнее, чем риск потерять его в погоне за большим. Когда то же самое подано
            как потеря («умрёт 400 из 600»), психологически невыносима сама мысль о гарантированной
            потере — и мы охотнее идём на риск, лишь бы был шанс вообще не потерять ничего, даже
            если статистически шансы одинаковы. Гарантированная потеря «болит» сильнее, чем такая
            же по размеру гарантированная недополученная выгода — из-за этого одна и та же дилемма
            выглядит совершенно по-разному в зависимости от того, с какой стороны на неё
            посмотреть.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Тот же приём — в маркетинге и медицине</b
            ><span
              >«95% успешных операций» звучит убедительнее, чем «5% смертность» — хотя это одно и
              то же число, поданное через выигрыш вместо потери.</span
            >
          </div>
          <div class="fact">
            <b>Эффект устойчив даже у экспертов</b
            ><span
              >Врачи в оригинальных репликах тоже меняли рекомендации в зависимости от
              формулировки статистики выживаемости — специальные знания не отменяют эффект
              фрейминга полностью.</span
            >
          </div>
          <div class="fact">
            <b>Работает и на бытовых решениях</b
            ><span
              >Люди чаще соглашаются на небольшую скидку за оплату наличными, если её называют
              «скидкой», и заметно реже — если ровно ту же разницу в цене называют «доплатой за
              оплату картой», хотя итоговая сумма одинакова.</span
            >
          </div>
          <div class="fact">
            <b>Формулировки влияют на согласие с политикой и налогами</b
            ><span
              >В опросах поддержка одной и той же меры заметно меняется в зависимости от того,
              описана ли она как «сохранение существующих рабочих мест» или как «предотвращение
              потери рабочих мест» — хотя по сути речь о совершенно одинаковом результате.</span
            >
          </div>
          <div class="fact">
            <b>Рабочая параллель</b
            ><span
              >«Мы можем сохранить 80% бюджета» и «мы потеряем 20% бюджета» — одно и то же
              решение, но вторая формулировка обычно подталкивает команду к более рискованным
              шагам, чтобы избежать ощущаемой потери.</span
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

customElements.define('retro-game-framing', RetroGameFraming);
