/* =========================================================
   GAME: Игра диктатора (dictator)
   Two rounds instead of one: round 1 is fully anonymous (as
   before), round 2 tells people their name will be attached
   to the decision — directly testing the "observability
   changes generosity" finding instead of just describing it
   in the facts afterwards. Same pool of people both times, no
   pairing needed — this is the simplest game to extend with a
   second data point per person.

   ---------------------------------------------------------
   PILOT for the Lit/Shadow DOM migration (see
   docs/modernization-plan.md Phase 2) — the first game rewritten
   as a real Web Component instead of an `app.innerHTML = \`...\`
   string template + document.getElementById wiring. Notable
   departures from the other 12 (still-legacy) games, now that
   rendering is declarative and DOM-scoped to this element's own
   shadow root instead of the global `document`:

   - Screens are all rendered at once; which one is visible is a
     `screenIdx` reactive property (`.active` class computed per
     `<section>` in the template) — no Screen.goTo() DOM toggling.
   - The draft-restore banner is rendered declaratively from `this.draft`
     instead of Persist.banner()'s imperative
     `document.getElementById(mountId).innerHTML = ...` (which can't see
     into a shadow root anyway) — `timeAgo` is imported standalone from
     persist.js for that. Persist.save/load/clear (pure sessionStorage,
     no DOM) are unchanged.
   - Print.mount() gained an optional `root` parameter for exactly this
     case — pass `this.renderRoot` so it finds `#print-header-dictator`
     inside the shadow root rather than searching `document`.
   - The PDF button uses a real `@click` binding instead of an inline
     onclick="Print.run()" string — inline handler attributes run in
     global scope and can't see anything module-scoped, which is why
     print.js also exports `window.Print` as a bridge for the other 12
     games that still use onclick="..." (not needed here).
   - The SVG chart is still hand-built imperatively (ChartTip's hover
     wiring doesn't lend itself to a declarative rewrite) — just scoped
     to `this.renderRoot` instead of `document`.
   - The whole app design system (src/styles.css) is included via
     `sharedStyles` — see src/styles/shared-styles.js for why the whole
     file rather than a hand-picked subset.
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ChartTip } from '../chart-tip.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_LEFT, ICON_PRINT, ICON_RIGHT } from '../icons.js';
import { Persist, timeAgo } from '../persist.js';
import { Print } from '../print.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const POT = 1000;
const TOTAL_SCREENS = 5;

export class RetroGameDictator extends LitElement {
  static styles = sharedStyles;

  static properties = {
    screenIdx: { state: true },
    data: { state: true },
    draft: { state: true },
    results: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.screenIdx = 0;
    this.data = this._blankData();
    this.results = null;

    const loaded = Persist.load('dictator');
    this.draft =
      loaded &&
      Array.isArray(loaded.payload.data) &&
      loaded.payload.data.length === this.names.length
        ? loaded
        : null;
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, r1: null, r2: null }));
  }

  goTo(idx) {
    this.screenIdx = idx;
  }

  _restoreDraft() {
    this.data = this.draft.payload.data;
    this.draft = null;
    this.goTo(1);
  }

  _discardDraft() {
    Persist.clear('dictator');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('dictator');
    renderHome();
  }

  _onEntryInput(e, idx, field) {
    let v = e.target.value === '' ? null : Number(e.target.value);
    if (v !== null) {
      if (v < 0) v = 0;
      if (v > POT) v = POT;
    }
    this.data = this.data.map((row, i) => (i === idx ? { ...row, [field]: v } : row));
    Persist.save('dictator', { data: this.data });
  }

  _filledCount(field) {
    return this.data.filter((d) => d[field] !== null).length;
  }

  _showResults() {
    const filled = this.data.filter((d) => d.r1 !== null && d.r2 !== null);
    const avgR1 = filled.reduce((a, b) => a + b.r1, 0) / filled.length;
    const avgR2 = filled.reduce((a, b) => a + b.r2, 0) / filled.length;
    this.results = { filled, avgR1, avgR2, delta: avgR2 - avgR1 };

    Print.mount(
      'print-header-dictator',
      {
        title: 'Игра диктатора',
        subtitle:
          'Никто не заставляет делиться — но почти все делятся, и ещё больше, если их видят.',
        meta: Print.meta(filled.length, '2 раунда'),
        explanation:
          'Классическая экономическая теория предсказывает, что рациональный и эгоистичный человек отдаст 0 — в реальности почти никто так не делает, а стоит убрать анонимность, отдают ещё больше. Дизайн формализован в статье Forsythe, Horowitz, Savin, Sefton (1994) как «очищенный» от переговорной стратегии тест альтруизма.',
      },
      this.renderRoot,
    );

    this.goTo(3);
  }

  _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('dictator');
    this.goTo(0);
  }

  updated() {
    if (this.screenIdx === 3 && this.results) {
      this._drawChart(this.results.filled);
    }
  }

  _drawChart(filled) {
    const svg = this.renderRoot.getElementById('dict-chart');
    if (!svg) return;
    svg.innerHTML = '';
    const W = 640,
      H = 220,
      ML = 20,
      MR = 20,
      MT = 30,
      MB = 36;
    const plotW = W - ML - MR;

    function xOf(v) {
      return ML + (v / POT) * plotW;
    }
    function ns(tag, attrs) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }

    svg.appendChild(
      ns('line', {
        x1: ML,
        y1: H - MB,
        x2: ML + plotW,
        y2: H - MB,
        stroke: '#1E2A32',
        'stroke-width': 1.2,
      }),
    );
    [0, 250, 500, 750, 1000].forEach((v) => {
      const x = xOf(v);
      svg.appendChild(
        ns('line', {
          x1: x,
          y1: H - MB,
          x2: x,
          y2: H - MB + 5,
          stroke: '#4B5B63',
          'stroke-width': 1,
        }),
      );
      const lx = ns('text', {
        x: x,
        y: H - MB + 18,
        'font-size': 10.5,
        'font-family': 'IBM Plex Mono, monospace',
        fill: '#4B5B63',
        'text-anchor': 'middle',
      });
      lx.textContent = v;
      svg.appendChild(lx);
    });

    const halfX = xOf(POT / 2);
    svg.appendChild(
      ns('line', {
        x1: halfX,
        y1: MT,
        x2: halfX,
        y2: H - MB,
        stroke: '#9A7B3F',
        'stroke-width': 1.5,
        'stroke-dasharray': '5,4',
      }),
    );
    const halfLabel = ns('text', {
      x: halfX,
      y: MT - 8,
      'font-size': 10.5,
      'font-family': 'IBM Plex Mono, monospace',
      fill: '#9A7B3F',
      'text-anchor': 'middle',
    });
    halfLabel.textContent = 'поровну';
    svg.appendChild(halfLabel);

    const rowH = 16;
    filled.forEach((p, i) => {
      const y1 = H - MB - 14 - (i % 6) * rowH;
      const y2 = y1 - 8;
      const c1 = ns('circle', {
        cx: xOf(p.r1),
        cy: y1,
        r: 5,
        fill: '#3E6E64',
        'fill-opacity': 0.85,
        stroke: '#F5F3EC',
        'stroke-width': 1.2,
      });
      svg.appendChild(c1);
      ChartTip.attachToPoint(
        svg,
        ns,
        xOf(p.r1),
        y1,
        () =>
          `<b>${p.name}</b><span class="tip-row"><span>Раунд 1 · анонимно</span><span>${p.r1} ₽</span></span>`,
        8,
      );
      const c2 = ns('circle', {
        cx: xOf(p.r2),
        cy: y2,
        r: 5,
        fill: '#A8482A',
        'fill-opacity': 0.85,
        stroke: '#F5F3EC',
        'stroke-width': 1.2,
      });
      svg.appendChild(c2);
      ChartTip.attachToPoint(
        svg,
        ns,
        xOf(p.r2),
        y2,
        () =>
          `<b>${p.name}</b><span class="tip-row"><span>Раунд 2 · не анонимно</span><span>${p.r2} ₽</span></span>`,
        8,
      );
    });
  }

  _entryRow(row, idx, field) {
    return html`
      <div class="entry-row two-col">
        <div class="name">${unsafeHTML(avatarName(row.name))}</div>
        <input
          type="number"
          min="0"
          max="${POT}"
          inputmode="numeric"
          placeholder="0–${POT}"
          .value=${row[field] ?? ''}
          @input=${(e) => this._onEntryInput(e, idx, field)}
        />
      </div>
    `;
  }

  render() {
    const filled1 = this._filledCount('r1');
    const filled2 = this._filledCount('r2');
    const r = this.results;

    return html`
      <div class="wrap narrow">
        <div class="game-crumb">
          <button class="back-link" @click=${this._goHome}>${unsafeHTML(ICON_LEFT)} Все игры</button>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">Игра диктатора</span>
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
          <h1>Быстрое решение про деньги — дважды</h1>
          <p class="lede">
            Два раунда с одним и тем же выбором. Меняется только одна деталь — а вместе с ней,
            скорее всего, и суммы.
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
                <b>Раунд 1 — решение анонимное</b>
                <span
                  >«Вам дали ${POT} ₽. Можно оставить их себе полностью или поделиться любой частью
                  с анонимным коллегой из другой команды. Никто не узнает, кто сколько
                  отдал».</span
                >
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Раунд 2 — та же сумма, но вас увидят</b>
                <span
                  >Теперь коллега узнает, кто именно принял решение — ваше имя будет рядом с
                  суммой. Решайте заново, как будто это происходит на самом деле.</span
                >
              </div>
            </li>
          </ol>

          <p class="note">
            Отвечайте на первый раунд, ещё не зная формулировки второго — не забегайте вперёд.
          </p>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.goTo(1)}>Раунд 1 ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 1 ? 'active' : ''}">
          <p class="eyebrow">Раунд 1 из 2 · Анонимно</p>
          <h2>Сколько каждый отдал — не зная, что решат остальные</h2>
          <p class="lede">Никто не узнает, кто сколько написал.</p>

          <div class="entry-head two-col">
            <div>Участник</div>
            <div>Отдал, ₽</div>
          </div>
          <div data-testid="entry-body-1">
            ${this.data.map((row, i) => this._entryRow(row, i, 'r1'))}
          </div>

          <div class="fill-progress">
            Заполнено: <span>${filled1}</span> из <span>${this.names.length}</span>
            <div class="track">
              <div style="width:${(filled1 / this.names.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              data-testid="next-btn-1"
              ?disabled=${filled1 < 2}
              @click=${() => this.goTo(2)}
            >
              Раунд 2 ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 2 ? 'active' : ''}">
          <p class="eyebrow">Раунд 2 из 2 · Вас увидят</p>
          <h2>То же решение, но уже не анонимно</h2>
          <p class="lede">Коллега узнает, кто именно принял это решение.</p>

          <div class="entry-head two-col">
            <div>Участник</div>
            <div>Отдал, ₽</div>
          </div>
          <div data-testid="entry-body-2">
            ${this.data.map((row, i) => this._entryRow(row, i, 'r2'))}
          </div>

          <div class="fill-progress">
            Заполнено: <span>${filled2}</span> из <span>${this.names.length}</span>
            <div class="track">
              <div style="width:${(filled2 / this.names.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              data-testid="next-btn-2"
              ?disabled=${filled2 < 2}
              @click=${() => this._showResults()}
            >
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 3 ? 'active' : ''}">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>
          <div class="print-header" id="print-header-dictator"></div>

          <div class="reveal">
            <div class="n">${r ? (r.delta >= 0 ? '+' : '') + Math.round(r.delta) + ' ₽' : '—'}</div>
            <p>
              <b>Насколько изменилась средняя сумма</b>, когда решение перестало быть анонимным —
              раунд 2 минус раунд 1.
            </p>
          </div>

          <div class="group-compare">
            <div class="g low">
              <div class="t">Раунд 1 · анонимно, в среднем</div>
              <div class="v">${r ? Math.round(r.avgR1) + ' ₽' : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Раунд 2 · не анонимно, в среднем</div>
              <div class="v">${r ? Math.round(r.avgR2) + ' ₽' : '—'}</div>
            </div>
          </div>

          <div class="chart-wrap">
            <svg id="dict-chart" viewBox="0 0 640 220" width="100%" style="display:block;"></svg>
            <div class="cap">
              Шалфейные точки — раунд 1 (анонимно), рыжие — раунд 2 (не анонимно). Каждая пара
              точек — один человек.
            </div>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Раунд 1</th>
                <th>Раунд 2</th>
                <th>Изменение</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.map((d) => {
                      const diff = d.r2 - d.r1;
                      const diffText = (diff >= 0 ? '+' : '') + diff + ' ₽';
                      return html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                        <td>${d.r1} ₽</td>
                        <td>${d.r2} ₽</td>
                        <td>${diffText}</td>
                      </tr>
                    `;
                    })
                  : ''
              }
            </tbody>
          </table>

          <div class="print-footer" id="print-footer-dictator"></div>

          <div class="pdf-row">
            <button class="ghost" id="pdf-btn" @click=${() => Print.run()}>
              ${unsafeHTML(ICON_PRINT)} Сохранить / отправить PDF
            </button>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(2)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.goTo(4)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 4 ? 'active' : ''}">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Игра диктатора</h1>
          <p class="lede">
            Классическая экономическая теория предсказывает: рациональный и эгоистичный человек
            отдаст 0. В реальности почти никто так не делает — а стоит убрать анонимность, отдают
            ещё больше.
          </p>

          <p>
            «Игра диктатора» — упрощённая версия «Ультиматума»: один человек единолично решает,
            как разделить сумму, а второй участник вообще не может ни отказаться, ни как-либо
            повлиять на решение. Дизайн намеренно «очищает» эксперимент от стратегии и страха
            отказа — остаётся только чистая готовность делиться, когда экономически выгоднее не
            делиться вовсе.
          </p>

          <p>
            Дизайн формализован в статье Forsythe R., Horowitz J., Savin N., Sefton M. (1994).
            Fairness in Simple Bargaining Experiments. <i>Games and Economic Behavior</i> — как
            «очищенный» тест альтруизма, отделённый от переговорной стратегии игры «Ультиматум».
          </p>

          <div class="stat-row">
            <div class="stat">
              <div class="n">20–30%</div>
              <div class="lab">типичная доля, которую отдают анонимно в мета-анализах</div>
            </div>
            <div class="stat">
              <div class="n">↑</div>
              <div class="lab">сумма обычно растёт, когда решение становится видимым</div>
            </div>
          </div>

          <p>
            <b>Зачем нужен именно второй раунд.</b> Первый раунд «очищен» от давления чужого
            мнения — это чистая базовая щедрость. Второй раунд специально возвращает то самое
            социальное давление: теперь решение видно, а значит, включается забота о репутации.
            Разница между раундами — это, по сути, размер эффекта «наблюдаемости»: сколько
            щедрости в нас добавляет не мораль, а желание хорошо выглядеть в чужих глазах. Оба
            мотива реальны и оба человеческие — игра просто разводит их по разным раундам, чтобы
            увидеть каждый по отдельности.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Анонимность сильно меняет результат</b
            ><span
              >Вы только что могли увидеть это на своей же команде: если участники думают, что
              кто-то увидит их решение, сумма, которую они отдают, заметно растёт — щедрость во
              многом зависит от «наблюдаемости», а не только от внутренних убеждений.</span
            >
          </div>
          <div class="fact">
            <b>50/50 — устойчивая «фокальная точка»</b
            ><span
              >Заметная доля людей делит сумму ровно пополам — не потому что посчитали оптимальную
              стратегию, а потому что «поровну» интуитивно ощущается как самый безопасный, самый
              честный вариант.</span
            >
          </div>
          <div class="fact">
            <b>Результат зависит от того, кто на другом конце</b
            ><span
              >Люди отдают заметно меньше, если получателем назначают благотворительный фонд с
              плохой репутацией, и заметно больше — если получателя описывают как «такого же
              участника эксперимента, как и вы».</span
            >
          </div>
          <div class="fact">
            <b>Даже дети делятся не из выгоды</b
            ><span
              >Похожие опыты с детьми 3–7 лет (Fehr, Bernhard, Rockenbach, 2008) показывают, что
              готовность делиться с незнакомцем без всякой возможности наказания появляется рано и
              растёт с возрастом — просоциальное поведение формируется до того, как ребёнок
              способен просчитывать стратегию.</span
            >
          </div>
          <div class="fact">
            <b>Возраст и культура смещают щедрость по-разному</b
            ><span
              >В кросс-культурных повторах итоговая доля «отдал больше нуля» и средний размер
              пожертвования заметно различаются между странами — единого «естественного» уровня
              альтруизма не существует, он формируется социальной средой.</span
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

customElements.define('retro-game-dictator', RetroGameDictator);
