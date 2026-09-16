/* =========================================================
   GAME: Эффект якоря (anchoring)

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same pattern as src/games/dictator.js (Phase 2 pilot). Single entry
   screen (not two rounds) with two number fields per row, a scatter
   chart (imperative, scoped to this.renderRoot) instead of a
   two-round line chart, plus a correlation readout and a low/high
   group-compare split.

   One-continuous-scroll деталка (docs/modernization-plan.md — "деталка
   продолжает карту") — see framing.js for the full write-up of this
   layout and game-shell.js for the shared navigation helpers every
   game now uses: every round always in the DOM as <section
   class="round">, forward movement gated to a round's own button
   (_advance()), a big sticky vertical game-trail.js rail in
   .game-rail, and a × in the corner (.game-exit) that confirms before
   leaving instead of the old .game-crumb back-link.
========================================================= */
import * as d3 from 'd3';
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ChartTip } from '../chart-tip.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_DOWNLOAD, ICON_LEFT, ICON_RIGHT, ICON_X } from '../icons.js';
import {
  countFilled,
  hasEnough,
  hasFields,
  loadableDraft,
  parseNumberInput,
  patchRow,
} from '../logic/entries.js';
import { anchoringResults } from '../logic/results.js';
import { linearRegression } from '../logic/stats.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const TRUE_VALUE = 28;
const TOTAL_SCREENS = 4;
const ROUND_TITLES = [
  'Быстрый эксперимент для команды',
  'Впишите числа каждого участника',
  'Что получилось у вашей команды',
  'Эффект якоря',
];

export class RetroGameAnchoring extends LitElement {
  static styles = sharedStyles;

  static properties = {
    data: { state: true },
    draft: { state: true },
    results: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.data = this._blankData();
    this.results = null;

    this.draft = loadableDraft(Persist.load('anchoring'), {
      key: 'data',
      length: this.names.length,
    });
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, anchor: null, guess: null }));
  }

  _restoreDraft() {
    this.flow.advance(1, () => {
      this.data = this.draft.payload.data;
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear('anchoring');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('anchoring');
    renderHome();
  }

  _onEntryInput(e, idx, field) {
    const max = field === 'anchor' ? 99 : 100;
    this.data = patchRow(this.data, idx, {
      [field]: parseNumberInput(e.target.value, { min: 0, max }),
    });
    Persist.save('anchoring', { data: this.data });
  }

  _filledCount() {
    return countFilled(this.data, hasFields('anchor', 'guess'));
  }

  _showResults() {
    this.results = anchoringResults(this.data);
    const { filled } = this.results;

    ReportExport.register(
      'anchoring',
      {
        subtitle: 'Случайное число незаметно сдвигает вашу же числовую оценку.',
        meta: ReportExport.meta(filled.length),
        explanation:
          'Случайное число, увиденное прямо перед оценкой, задаёт «якорь» — и итоговый ответ смещается в его сторону, даже когда число совершенно нерелевантно вопросу. Эффект открыли Амос Тверски и Дэниел Канеман в 1974 году; за работы по поведенческой экономике Канеман получил Нобелевскую премию в 2002 году.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('anchoring');
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  updated() {
    // No longer gated on screenIdx===2 — every round (including this
    // one) is always in the DOM now, so "do we have results yet" is
    // the only thing that matters for whether the scatter should draw.
    if (this.results) {
      this._drawScatter(this.results.filled);
    }
  }

  _drawScatter(points) {
    const svg = this.renderRoot.getElementById('scatter');
    if (!svg) return;
    svg.innerHTML = '';
    if (!points.length) return;

    const cs = getComputedStyle(this.renderRoot.querySelector('.wrap-wide'));
    const accent = cs.getPropertyValue('--game-accent').trim() || '#4E7FFF';
    const accentDeep = cs.getPropertyValue('--game-accent-deep').trim() || accent;
    const gold = cs.getPropertyValue('--gold').trim() || '#b87503';

    const W = 640,
      H = 380,
      ML = 46,
      MB = 40,
      MT = 16,
      MR = 16;
    const plotW = W - ML - MR,
      plotH = H - MT - MB;

    const x = d3
      .scaleLinear()
      .domain([0, 100])
      .range([ML, ML + plotW]);
    const y = d3
      .scaleLinear()
      .domain([0, 100])
      .range([MT + plotH, MT]);

    const svgSel = d3
      .select(svg)
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    svgSel
      .append('line')
      .attr('x1', ML)
      .attr('y1', MT)
      .attr('x2', ML)
      .attr('y2', MT + plotH)
      .style('stroke', 'var(--ink)')
      .style('stroke-width', 1.2);
    svgSel
      .append('line')
      .attr('x1', ML)
      .attr('y1', MT + plotH)
      .attr('x2', ML + plotW)
      .attr('y2', MT + plotH)
      .style('stroke', 'var(--ink)')
      .style('stroke-width', 1.2);

    [0, 25, 50, 75, 100].forEach((t) => {
      const tx = x(t);
      const ty2 = y(t);
      svgSel
        .append('line')
        .attr('x1', tx)
        .attr('y1', MT + plotH)
        .attr('x2', tx)
        .attr('y2', MT + plotH + 5)
        .style('stroke', 'var(--ink-faint)');
      svgSel
        .append('text')
        .attr('x', tx)
        .attr('y', MT + plotH + 18)
        .attr('text-anchor', 'middle')
        .style('font-size', '11px')
        .style('font-family', 'IBM Plex Mono, monospace')
        .style('fill', 'var(--ink-faint)')
        .text(t);
      svgSel
        .append('line')
        .attr('x1', ML - 5)
        .attr('y1', ty2)
        .attr('x2', ML)
        .attr('y2', ty2)
        .style('stroke', 'var(--ink-faint)');
      svgSel
        .append('text')
        .attr('x', ML - 10)
        .attr('y', ty2 + 4)
        .attr('text-anchor', 'end')
        .style('font-size', '11px')
        .style('font-family', 'IBM Plex Mono, monospace')
        .style('fill', 'var(--ink-faint)')
        .text(t);
    });

    svgSel
      .append('text')
      .attr('x', ML + plotW / 2)
      .attr('y', H - 4)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-family', 'IBM Plex Mono, monospace')
      .style('fill', 'var(--ink)')
      .text('ЧИСЛО ИЗ ШАГА 1');
    svgSel
      .append('text')
      .attr('x', 14)
      .attr('y', MT + plotH / 2)
      .attr('text-anchor', 'middle')
      .attr('transform', `rotate(-90 14 ${MT + plotH / 2})`)
      .style('font-size', '12px')
      .style('font-family', 'IBM Plex Mono, monospace')
      .style('fill', 'var(--ink)')
      .text('ОЦЕНКА');

    // Least-squares trend line — the same "the number pulls the guess
    // toward it" story the correlation readout tells in words, drawn
    // through the cloud of dots instead of asking the reader to
    // eyeball the trend themselves.
    const reg = linearRegression(
      points.map((p) => p.anchor),
      points.map((p) => p.guess),
    );
    if (reg) {
      const y0 = Math.max(0, Math.min(100, reg.intercept));
      const y100 = Math.max(0, Math.min(100, reg.slope * 100 + reg.intercept));
      svgSel
        .append('line')
        .attr('x1', x(0))
        .attr('y1', y(y0))
        .attr('x2', x(100))
        .attr('y2', y(y100))
        .style('stroke', accentDeep)
        .style('stroke-width', 2)
        .style('stroke-linecap', 'round')
        .style('opacity', 0.55);
    }

    const ty = y(TRUE_VALUE);
    svgSel
      .append('line')
      .attr('x1', ML)
      .attr('y1', ty)
      .attr('x2', ML + plotW)
      .attr('y2', ty)
      .style('stroke', gold)
      .style('stroke-width', 1.5)
      .style('stroke-dasharray', '5,4');
    svgSel
      .append('text')
      .attr('x', ML + plotW - 4)
      .attr('y', ty - 6)
      .attr('text-anchor', 'end')
      .style('font-size', '11px')
      .style('font-weight', 700)
      .style('font-family', 'IBM Plex Mono, monospace')
      .style('fill', gold)
      .text('28% — правильный ответ');

    const dotR = 6;
    const dots = svgSel
      .selectAll('circle.answer-dot')
      .data(points)
      .join('circle')
      .attr('class', 'answer-dot')
      .attr('cx', (p) => x(p.anchor))
      .attr('cy', (p) => y(p.guess))
      .attr('r', 0)
      .style('fill', accent)
      .style('fill-opacity', 0.88)
      .style('stroke', 'var(--white)')
      .style('stroke-width', 1.5);

    dots
      .transition()
      .delay((_, i) => i * 24)
      .duration(400)
      .ease(d3.easeBackOut.overshoot(1.7))
      .attr('r', dotR);

    svgSel
      .selectAll('text.answer-label')
      .data(points)
      .join('text')
      .attr('class', 'answer-label')
      .attr('x', (p) => x(p.anchor))
      .attr('y', (p) => y(p.guess) - 10)
      .attr('text-anchor', 'middle')
      .style('font-size', '10.5px')
      .style('font-family', 'IBM Plex Sans, sans-serif')
      .style('fill', 'var(--ink)')
      .style('opacity', 0)
      .text((p) => p.name)
      .transition()
      .delay((_, i) => i * 24 + 200)
      .duration(300)
      .style('opacity', 1);

    function ns(tag, attrs) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }
    // Hit circle inserted right after its own dot — keeps the DOM a
    // plain [visible, hit, visible, hit, ...] sequence (see
    // crowd-wisdom.js's _drawChart() for why that ordering matters).
    const dotNodes = dots.nodes();
    points.forEach((p, i) => {
      const hit = ns('circle', {
        cx: x(p.anchor),
        cy: y(p.guess),
        r: dotR + 6,
        fill: 'transparent',
        'pointer-events': 'all',
      });
      dotNodes[i].after(hit);
      ChartTip.attach(
        hit,
        () =>
          `<b>${p.name}</b><span class="tip-row"><span>Число из шага 1</span><span>${p.anchor}</span></span><span class="tip-row"><span>Оценка</span><span>${p.guess}%</span></span>`,
      );
      hit.addEventListener('mouseenter', () => {
        d3.select(dotNodes[i])
          .style('fill-opacity', 1)
          .attr('r', dotR * 1.25);
      });
      hit.addEventListener('mouseleave', () => {
        d3.select(dotNodes[i]).style('fill-opacity', 0.88).attr('r', dotR);
      });
    });
  }

  _entryRow(row, idx) {
    return html`
      <div class="entry-row">
        <div class="name">${unsafeHTML(avatarName(row.name))}</div>
        <input
          type="number"
          min="0"
          max="99"
          inputmode="numeric"
          placeholder="напр. 42"
          .value=${row.anchor ?? ''}
          @input=${(e) => this._onEntryInput(e, idx, 'anchor')}
        />
        <input
          type="number"
          min="0"
          max="100"
          inputmode="numeric"
          placeholder="напр. 30"
          .value=${row.guess ?? ''}
          @input=${(e) => this._onEntryInput(e, idx, 'guess')}
        />
      </div>
    `;
  }

  render() {
    const filled = this._filledCount();
    const r = this.results;

    return html`
      <div class="wrap-wide" style=${gameAccentStyle('anchoring')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 5 минут</p>
          <h1>Быстрый эксперимент для команды</h1>
          <p class="lede">
            Три коротких шага. Что именно здесь проверяется — расскажем в самом конце, после того
            как увидим результат.
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
                <b>Каждый молча пишет число</b>
                <span
                  >Не показывая соседям, запишите последние две цифры своего номера телефона —
                  число от 00 до 99.</span
                >
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Задайте вопрос вслух</b>
                <span
                  >«Как думаете, доля стран Африки среди членов ООН больше или меньше числа,
                  которое вы записали?» Каждый отвечает про себя.</span
                >
              </div>
            </li>
            <li>
              <div class="step-num">3</div>
              <div class="step-body">
                <b>Каждый пишет точную оценку</b>
                <span
                  >Теперь — конкретный процент: какая, по-вашему, доля стран ООН находится в
                  Африке? Готово, дальше вносим оба числа сюда.</span
                >
              </div>
            </li>
          </ol>

          <p class="note">
            Шаг 1 нужно сделать до того, как прозвучит вопрос в шаге 2 — не забегайте вперёд.
          </p>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.flow.advance(1)}>Вносить данные ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(0)}
        </section>

        <section class="${this.flow.roundClass(1)}" id="round-1">
          <div class="round-body">
          <p class="eyebrow">Сбор данных</p>
          <h2>Впишите числа каждого участника</h2>
          <p class="lede">Спросите по очереди: число из шага 1 и оценку из шага 3.</p>

          <div class="entry-head">
            <div>Участник</div>
            <div>Число (00–99)</div>
            <div>Оценка (%)</div>
          </div>
          <div data-testid="entry-body">${this.data.map((row, i) => this._entryRow(row, i))}</div>

          <div class="fill-progress">
            Заполнено: <span>${filled}</span> из <span>${this.names.length}</span>
            <div class="track">
              <div style="width:${(filled / this.names.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" ?disabled=${!hasEnough(filled)} @click=${() => this.flow.advance(2, () => this._showResults())}>
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(1)}
        </section>

        <section class="${this.flow.roundClass(2)}" id="round-2">
          <div class="round-body">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>

          ${renderReveal({ value: '28%', ...REVEAL_COPY.anchoring(r ? { lowAvg: r.lowAvgN, highAvg: r.highAvgN } : null) })}

          <div class="chart-wrap">
            <svg id="scatter" class="d3-chart-svg" viewBox="0 0 640 380"></svg>
            <div class="cap">
              По горизонтали — число из шага 1 у каждого человека (00–99), по вертикали — его
              оценка (%). Пунктир — правильный ответ, 28%. Сплошная линия — тренд по всем точкам:
              её наклон и есть эффект якоря.
            </div>
          </div>

          <div class="group-compare">
            <div class="g low">
              <div class="t">Число из шага 1 ниже 50</div>
              <div class="v">${r ? r.lowAvg : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Число из шага 1 — 50 и выше</div>
              <div class="v">${r ? r.highAvg : '—'}</div>
            </div>
          </div>

          <p>${r ? r.corrText : ''}</p>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Число</th>
                <th>Оценка</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.map(
                      (d) => html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                        <td>${d.anchor}</td>
                        <td>${d.guess}%</td>
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
            <button class="ghost" @click=${() => this.flow.scrollTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(3)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(2)}
        </section>

        <section class="${this.flow.roundClass(3)}" id="round-3">
          <div class="round-body">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Эффект якоря</h1>
          <p class="lede">
            То, что вы только что сделали, — короткая версия одного из самых известных
            экспериментов в психологии решений.
          </p>

          <p>
            В 1974 году психологи Амос Тверски и Дэниел Канеман крутили перед испытуемыми колесо
            фортуны с числами от 0 до 100. Колесо было подстроено: оно всегда останавливалось либо
            на 10, либо на 65. После этого людей спрашивали, какая доля африканских стран среди
            членов ООН — больше или меньше выпавшего числа, а затем просили назвать точную оценку.
          </p>

          <p>Число на колесе было полностью случайным и не имело никакого отношения к вопросу. Но результат оказался таким:</p>

          <div class="stat-row">
            <div class="stat">
              <div class="n">25%</div>
              <div class="lab">средняя оценка у тех, кто увидел число 10</div>
            </div>
            <div class="stat">
              <div class="n">45%</div>
              <div class="lab">средняя оценка у тех, кто увидел число 65</div>
            </div>
          </div>

          <p>
            Бессмысленное число со случайного колеса сдвинуло оценки почти на 20 процентных
            пунктов. Люди неосознанно «цеплялись» за первое увиденное число и потом недостаточно
            от него отходили — этот эффект назвали <b>якорением</b>. Ваш номер телефона в шаге 1
            сыграл ровно ту же роль, что и колесо фортуны — только на этот раз якорь принесли вы
            сами. Работа легла в основу поведенческой экономики, а в 2002 году Канеман получил за
            неё Нобелевскую премию по экономике.
          </p>

          <p>
            <b>Как это работает внутри головы.</b> Оценивая неизвестную величину, мозг редко
            считает «с нуля». Вместо этого он берёт первое число, которое оказалось у него под
            рукой — даже если оно случайное и логически ни с чем не связано — и начинает
            <i>подстраивать</i> ответ от этой точки. Проблема в том, что подстройка почти всегда
            недостаточна: мы останавливаемся слишком рано, как только ответ начинает казаться
            «правдоподобным», а не когда он становится точным. Это происходит быстро и неосознанно
            — тем самым автоматическим режимом мышления, который Канеман в книге «Thinking, Fast
            and Slow» назвал Системой 1, в отличие от медленной аналитической Системы 2.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Эффект не пропадает, даже если платить за точность</b
            ><span
              >В оригинальном опыте участникам предлагали вознаграждение за правильный ответ —
              якорение всё равно сохранялось почти в той же силе.</span
            >
          </div>
          <div class="fact">
            <b>Дэн Ариели пошёл дальше — номер соцстрахования и аукцион</b
            ><span
              >Людей просили записать две последние цифры номера соцстрахования, а затем сделать
              ставку на вино и шоколад на аукционе. У кого цифры были больше — в среднем ставили на
              60–120% больше денег за один и тот же товар (Ariely, Loewenstein, Prelec, 2003).</span
            >
          </div>
          <div class="fact">
            <b>Риелторы тоже подвержены эффекту</b
            ><span
              >Даже профессиональные оценщики недвижимости завышают оценку дома, если им заранее
              показать более высокую цену листинга — при том, что сами знают: цена
              произвольная.</span
            >
          </div>
          <div class="fact">
            <b>Даже судьи не защищены</b
            ><span
              >В эксперименте Englich, Mussweiler и Strack (2006) опытным немецким судьям перед
              вынесением приговора предлагали бросить игральные кости. Кости были подстроены на
              маленькое или большое число — и судьи с высоким броском давали в среднем заметно
              более суровые сроки за одно и то же преступление, хотя прекрасно понимали, что кости
              никак не связаны с делом.</span
            >
          </div>
          <div class="fact">
            <b>На этом строится вся «цена со скидкой»</b
            ><span
              >Зачёркнутая старая цена рядом с новой — классический якорь: сама скидка может быть
              скромной, но контраст с высоким «было» заставляет новую цену казаться настоящей
              находкой.</span
            >
          </div>
          <div class="fact">
            <b>А у вас это тоже есть — в Planning Poker</b
            ><span
              >Если кто-то в комнате первым называет «на глаз пять сторипоинтов», оценка всей
              команды потом гравитирует к этому числу — даже если оно взято с потолка. Стоит
              обсудить на ретро, бывало ли у вас такое.</span
            >
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
            <span></span>
          </div>
          </div>
          ${this.flow.lock(3)}
        </section>
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Эффект якоря</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'anchoring',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-anchoring', RetroGameAnchoring);
