/* =========================================================
   GAME: Мудрость толпы (crowd-wisdom)
   Defaults to the classic "how much does the ISS weigh?"
   question, but the facilitator can swap in their own
   fact-with-a-known-answer before collecting guesses — e.g.
   "сколько строк кода в нашем репозитории?" — so the effect
   feels like it's about this team, not an abstract quiz.

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same pattern as dictator/public-goods/anchoring. Note on test
   selectors: unlike those three, this game keeps its original plain
   `id`s (custom-q-*, cw-question-text, true-value-*, entry-body, ...)
   instead of switching to data-testid — a Shadow DOM component's ids
   live in their own namespace (no collision risk with other
   components any more), and Playwright's CSS engine pierces open
   shadow roots for id selectors exactly like it does for data-testid
   ones. data-testid was never a strict *requirement* for ids (only
   for class names, which a future CSS Modules pass would hash) — so
   test/custom-question.spec.js needs no changes at all for this game.
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ChartTip } from '../chart-tip.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_LEFT, ICON_RIGHT } from '../icons.js';
import { Persist, timeAgo } from '../persist.js';
import { Print } from '../print.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const DEFAULT_VALUE = 420; // tons — real mass of the ISS
const DEFAULT_QUESTION = 'Сколько тонн весит Международная космическая станция?';
const DEFAULT_UNIT = 'т';
const DEFAULT_ANSWER_LINE = 'Международная космическая станция весит около';
const TOTAL_SCREENS = 4;

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const n = s.length;
  const mid = Math.floor(n / 2);
  return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export class RetroGameCrowdWisdom extends LitElement {
  static styles = sharedStyles;

  static properties = {
    screenIdx: { state: true },
    data: { state: true },
    draft: { state: true },
    results: { state: true },
    question: { state: true },
    trueValue: { state: true },
    unit: { state: true },
    isCustomQuestion: { state: true },
    customPanelOpen: { state: true },
    customQStatus: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.screenIdx = 0;
    this.data = this._blankData();
    this.results = null;
    this.question = DEFAULT_QUESTION;
    this.trueValue = DEFAULT_VALUE;
    this.unit = DEFAULT_UNIT;
    this.isCustomQuestion = false;
    this.customPanelOpen = false;
    this.customQStatus = '';

    const loaded = Persist.load('crowd-wisdom');
    this.draft =
      loaded &&
      Array.isArray(loaded.payload.data) &&
      loaded.payload.data.length === this.names.length
        ? loaded
        : null;
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, guess: null }));
  }

  _fmt(v) {
    return Math.round(v) + (this.unit ? ' ' + this.unit : '');
  }

  goTo(idx) {
    this.screenIdx = idx;
  }

  _restoreDraft() {
    this.data = this.draft.payload.data;
    if (this.draft.payload.question) {
      this.question = this.draft.payload.question.text;
      this.trueValue = this.draft.payload.question.value;
      this.unit = this.draft.payload.question.unit;
      this.isCustomQuestion = true;
    }
    this.draft = null;
    this.goTo(1);
  }

  _discardDraft() {
    Persist.clear('crowd-wisdom');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('crowd-wisdom');
    renderHome();
  }

  _toggleCustomPanel() {
    this.customPanelOpen = !this.customPanelOpen;
  }

  _applyCustomQuestion() {
    const text = this.renderRoot.getElementById('custom-q-text').value.trim();
    const answerRaw = this.renderRoot.getElementById('custom-q-answer').value;
    const unit = this.renderRoot.getElementById('custom-q-unit').value.trim();
    const answer = Number(answerRaw);
    if (!text || answerRaw === '' || Number.isNaN(answer)) {
      this.customQStatus = 'Впишите текст вопроса и числовой правильный ответ.';
      return;
    }
    this.question = text;
    this.trueValue = answer;
    this.unit = unit;
    this.isCustomQuestion = true;
    this.customQStatus = '✓ Вопрос обновлён — используется при сборе данных и в результатах.';
  }

  _resetCustomQuestion() {
    this.question = DEFAULT_QUESTION;
    this.trueValue = DEFAULT_VALUE;
    this.unit = DEFAULT_UNIT;
    this.isCustomQuestion = false;
    this.customQStatus = '✓ Вернули стандартный вопрос про МКС.';
    this.renderRoot.getElementById('custom-q-text').value = '';
    this.renderRoot.getElementById('custom-q-answer').value = '';
    this.renderRoot.getElementById('custom-q-unit').value = '';
  }

  _onEntryInput(e, idx) {
    let v = e.target.value === '' ? null : Number(e.target.value);
    if (v !== null && v < 0) v = 0;
    this.data = this.data.map((row, i) => (i === idx ? { ...row, guess: v } : row));
    Persist.save('crowd-wisdom', {
      data: this.data,
      question: this.isCustomQuestion
        ? { text: this.question, value: this.trueValue, unit: this.unit }
        : null,
    });
  }

  _filledCount() {
    return this.data.filter((d) => d.guess !== null).length;
  }

  _showResults() {
    const filled = this.data.filter((d) => d.guess !== null);
    const guesses = filled.map((d) => d.guess);
    const avg = guesses.reduce((a, b) => a + b, 0) / guesses.length;
    const med = median(guesses);
    const avgErr = Math.abs(avg - this.trueValue);
    const medErr = Math.abs(med - this.trueValue);
    const worseThanAvg = filled.filter((d) => Math.abs(d.guess - this.trueValue) > avgErr).length;

    this.results = { filled, avg, med, avgErr, medErr, worseThanAvg };

    Print.mount(
      'print-header-crowd-wisdom',
      {
        title: 'Мудрость толпы',
        subtitle: this.isCustomQuestion
          ? this.question
          : 'Средняя оценка группы обходит по точности почти всех поодиночке.',
        meta: Print.meta(filled.length),
        explanation:
          'У каждого человека своя случайная ошибка в оценке, но при независимом усреднении эти ошибки частично гасят друг друга. Явление описал Фрэнсис Гальтон в 1907 году: медиана 787 независимых оценок веса быка на деревенской ярмарке разошлась с реальным весом всего на 9 фунтов — точнее большинства профессиональных скотоводов.',
      },
      this.renderRoot,
    );

    this.goTo(2);
  }

  _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('crowd-wisdom');
    this.goTo(0);
  }

  updated() {
    if (this.screenIdx === 2 && this.results) {
      this._drawChart(this.results.filled);
    }
  }

  _drawChart(filled) {
    const svg = this.renderRoot.getElementById('cw-chart');
    if (!svg) return;
    svg.innerHTML = '';
    const W = 640,
      H = 220,
      ML = 20,
      MR = 20,
      MT = 40,
      MB = 36;
    const plotW = W - ML - MR;
    const guesses = filled.map((d) => d.guess);
    const allVals = guesses.concat([this.trueValue]);
    const maxV = Math.max(...allVals) * 1.15;
    const minV = Math.min(0, Math.min(...allVals) * 0.9);

    function xOf(v) {
      return ML + ((v - minV) / (maxV - minV)) * plotW;
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

    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      const v = minV + t * (maxV - minV);
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
      lx.textContent = Math.round(v);
      svg.appendChild(lx);
    });

    const trueX = xOf(this.trueValue);
    svg.appendChild(
      ns('line', {
        x1: trueX,
        y1: 24,
        x2: trueX,
        y2: H - MB,
        stroke: '#B5502E',
        'stroke-width': 1.5,
        'stroke-dasharray': '5,4',
      }),
    );
    const trueLabel = ns('text', {
      x: trueX,
      y: 16,
      'font-size': 10.5,
      'font-family': 'IBM Plex Mono, monospace',
      fill: '#B5502E',
      'text-anchor': 'middle',
    });
    trueLabel.textContent = 'правильный ответ';
    svg.appendChild(trueLabel);

    const avg = guesses.reduce((a, b) => a + b, 0) / guesses.length;
    const avgX = xOf(avg);
    svg.appendChild(
      ns('line', {
        x1: avgX,
        y1: 24,
        x2: avgX,
        y2: H - MB,
        stroke: '#3E6E64',
        'stroke-width': 1.5,
      }),
    );
    const avgLabel = ns('text', {
      x: avgX,
      y: H - MB + 30,
      'font-size': 10.5,
      'font-family': 'IBM Plex Mono, monospace',
      fill: '#3E6E64',
      'text-anchor': 'middle',
    });
    avgLabel.textContent = 'среднее';
    svg.appendChild(avgLabel);

    const rowH = 20;
    filled.forEach((p, i) => {
      const x = xOf(p.guess);
      const y = H - MB - 14 - (i % 6) * rowH;
      const c = ns('circle', {
        cx: x,
        cy: y,
        r: 5.5,
        fill: '#3E6E64',
        'fill-opacity': 0.85,
        stroke: '#F5F3EC',
        'stroke-width': 1.3,
      });
      svg.appendChild(c);
      ChartTip.attachToPoint(
        svg,
        ns,
        x,
        y,
        () =>
          `<b>${p.name}</b><span class="tip-row"><span>Оценка</span><span>${this._fmt(p.guess)}</span></span>`,
      );
    });
  }

  _entryRow(row, idx) {
    return html`
      <div class="entry-row two-col">
        <div class="name">${unsafeHTML(avatarName(row.name))}</div>
        <input
          type="number"
          min="0"
          inputmode="numeric"
          placeholder="напр. 300"
          .value=${row.guess ?? ''}
          @input=${(e) => this._onEntryInput(e, idx)}
        />
      </div>
    `;
  }

  render() {
    const filled = this._filledCount();
    const r = this.results;

    return html`
      <div class="wrap narrow">
        <div class="game-crumb">
          <button class="back-link" @click=${this._goHome}>${unsafeHTML(ICON_LEFT)} Все игры</button>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">Мудрость толпы</span>
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
          <p class="eyebrow">Командное упражнение · 5 минут</p>
          <h1>Проверим, кто точнее — один человек или вся команда</h1>
          <p class="lede">Два коротких шага. Не гуглите — это оценка «на глаз», в этом весь смысл.</p>

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
                <b>Задайте вопрос вслух</b>
                <span id="cw-question-text"
                  >«${this.question}» Каждый молча думает над своей оценкой, не советуясь с
                  соседями.</span
                >
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Каждый называет число</b>
                <span
                  >Любое число, даже если совсем не уверены — гадать можно и нужно. Дальше вносим
                  все оценки сюда.</span
                >
              </div>
            </li>
          </ol>

          <p class="note">
            Важно: оценки должны быть независимыми — если кто-то услышит чужое число раньше
            своего, эффект не сработает.
          </p>

          <div class="custom-q-toggle-row">
            <button type="button" class="ghost" id="custom-q-toggle" @click=${() => this._toggleCustomPanel()}>
              ✏️ Задать свой вопрос вместо стандартного
            </button>
          </div>
          <div class="custom-q-panel" id="custom-q-panel" ?hidden=${!this.customPanelOpen}>
            <div class="custom-q-field">
              <label for="custom-q-text">Текст вопроса</label>
              <input
                type="text"
                id="custom-q-text"
                placeholder="Например: сколько строк кода в нашем репозитории?"
              />
            </div>
            <div class="custom-q-row">
              <div class="custom-q-field">
                <label for="custom-q-answer">Правильный ответ</label>
                <input type="number" id="custom-q-answer" placeholder="напр. 42000" />
              </div>
              <div class="custom-q-field">
                <label for="custom-q-unit">Единица (необязательно)</label>
                <input type="text" id="custom-q-unit" placeholder="напр. строк, лет, км" />
              </div>
            </div>
            <div class="custom-q-actions">
              <button type="button" class="primary" id="custom-q-apply" @click=${() => this._applyCustomQuestion()}>
                Применить свой вопрос
              </button>
              <button
                type="button"
                class="ghost"
                id="custom-q-reset"
                ?hidden=${!this.isCustomQuestion}
                @click=${() => this._resetCustomQuestion()}
              >
                ↺ Вернуть стандартный
              </button>
            </div>
            <p class="note" id="custom-q-status">${this.customQStatus}</p>
          </div>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.goTo(1)}>Вносить данные ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 1 ? 'active' : ''}">
          <p class="eyebrow">Сбор данных</p>
          <h2>Впишите оценку каждого участника</h2>
          <p class="lede">Целым числом — не страшно, если совсем «на глаз».</p>

          <div class="entry-head two-col">
            <div>Участник</div>
            <div>Оценка</div>
          </div>
          <div id="entry-body">${this.data.map((row, i) => this._entryRow(row, i))}</div>

          <div class="fill-progress">
            Заполнено: <span>${filled}</span> из <span>${this.names.length}</span>
            <div class="track">
              <div style="width:${(filled / this.names.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" ?disabled=${filled < 2} @click=${() => this._showResults()}>
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 2 ? 'active' : ''}">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>
          <div class="print-header" id="print-header-crowd-wisdom"></div>

          <div class="reveal">
            <div class="n" id="true-value-display">${this._fmt(this.trueValue)}</div>
            <p id="true-value-para">
              ${
                this.isCustomQuestion
                  ? html`<b>Правильный ответ:</b> ${this._fmt(this.trueValue)}.`
                  : html`<b>Правильный ответ:</b> ${DEFAULT_ANSWER_LINE} ${this.trueValue} тонн.`
              }
            </p>
          </div>

          <div class="stat-row">
            <div class="stat">
              <div class="n">${r ? this._fmt(r.avg) : '—'}</div>
              <div class="lab">среднее по команде · ошибка ±${r ? Math.round(r.avgErr) : '—'}</div>
            </div>
            <div class="stat">
              <div class="n">${r ? this._fmt(r.med) : '—'}</div>
              <div class="lab">
                медиана по команде · ошибка ±${r ? Math.round(r.medErr) : '—'}
              </div>
            </div>
          </div>

          <div class="chart-wrap">
            <svg id="cw-chart" viewBox="0 0 640 220" width="100%" style="display:block;"></svg>
            <div class="cap">
              Каждая точка — оценка одного человека. Пунктир — правильный ответ, сплошная линия —
              среднее команды.
            </div>
          </div>

          <p>
            ${
              r
                ? `У ${r.worseThanAvg} из ${r.filled.length} человек личная ошибка больше, чем ошибка среднего по команде — среднее оказалось точнее, чем большинство участников поодиночке.`
                : ''
            }
          </p>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Оценка</th>
                <th>Ошибка</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.map((d) => {
                      const err = Math.abs(d.guess - this.trueValue);
                      return html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                        <td>${this._fmt(d.guess)}</td>
                        <td>±${Math.round(err)}</td>
                      </tr>
                    `;
                    })
                  : ''
              }
            </tbody>
          </table>

          <div class="print-footer" id="print-footer-crowd-wisdom"></div>

          <div class="pdf-row">
            <button class="ghost" id="pdf-btn" @click=${() => Print.run()}>
              🖨️ Сохранить / отправить PDF
            </button>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.goTo(3)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 3 ? 'active' : ''}">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Мудрость толпы</h1>
          <p class="lede">
            Один человек почти всегда ошибается заметно. Но среднее по всей группе часто
            оказывается на удивление точным.
          </p>

          <p>
            В 1907 году английский учёный Фрэнсис Гальтон оказался на деревенской ярмарке в
            Плимуте, где проходил конкурс: посетители на глаз оценивали вес быка, купив билет со
            своей догадкой. Гальтон, не веривший в способности «толпы» здраво судить о числах,
            собрал и проанализировал все 787 записок после конкурса.
          </p>

          <div class="stat-row">
            <div class="stat">
              <div class="n">1197</div>
              <div class="lab">фунтов — реальный вес быка</div>
            </div>
            <div class="stat">
              <div class="n">1207</div>
              <div class="lab">фунтов — медиана всех 787 оценок</div>
            </div>
          </div>

          <p>
            Медиана толпы разошлась с реальным весом всего на 9 фунтов из ~1200 — точнее, чем
            оценки большинства профессиональных скотоводов и мясников, участвовавших в том же
            конкурсе. Гальтон, ожидавший обратного, опубликовал результат в журнале <i>Nature</i>
            под названием «Vox Populi» («Глас народа»). Идею позже популяризировал журналист Джеймс
            Шуровьецки в книге «The Wisdom of Crowds» (2004).
          </p>

          <p>
            <b>Почему это работает.</b> У каждого отдельного человека есть своя случайная ошибка —
            кто-то оценивает с запасом, кто-то занижает, у кого-то просто нет опыта в этой
            конкретной вещи. Если ошибки разных людей действительно случайны и не связаны друг с
            другом, то при усреднении они частично гасят друг друга: завышенные и заниженные
            оценки компенсируются, а остаётся общий, более устойчивый сигнал. Математически это
            работает похоже на то, как усреднение множества шумных измерений в физике даёт более
            точный результат, чем одно-единственное измерение. Ключевое условие —
            «независимость»: если люди начинают ориентироваться друг на друга, их ошибки
            становятся <i>похожими</i>, а не случайными, и усреднение перестаёт что-либо чистить.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Работает только при независимости оценок</b
            ><span
              >Если участники слышат чужие числа до того, как назвать своё, — эффект резко
              слабеет: группа начинает «сбиваться в стаю» вокруг первого прозвучавшего числа
              (привет, эффект якоря).</span
            >
          </div>
          <div class="fact">
            <b>На этом принципе построены рынки прогнозов</b
            ><span
              >Агрегаторы вроде Metaculus или биржи предсказаний собирают независимые оценки тысяч
              людей — усреднённый прогноз систематически обгоняет по точности большинство
              отдельных экспертов.</span
            >
          </div>
          <div class="fact">
            <b>Толпа хороша в оценке количества, но не в решениях</b
            ><span
              >Эффект отлично работает для числовых оценок (вес, число предметов, сроки), но плохо
              переносится на групповые решения под давлением — там, наоборот, включается
              конформность (см. эксперименты Аша).</span
            >
          </div>
          <div class="fact">
            <b>NASA и разлив нефти</b
            ><span
              >В 2010 году во время утечки нефти в Мексиканском заливе для оценки скорости разлива
              привлекали независимые расчёты множества специалистов из разных областей —
              усреднённая оценка оказалась куда надёжнее, чем любая одна экспертная модель.</span
            >
          </div>
          <div class="fact">
            <b>Чем разнообразнее толпа, тем лучше прогноз</b
            ><span
              >Исследования показывают, что группа из людей с разным опытом и точками зрения в
              среднем даёт более точный коллективный прогноз, чем группа узких специалистов одного
              профиля — разнообразие ошибок важнее среднего уровня экспертизы.</span
            >
          </div>
          <div class="fact">
            <b>Рабочая параллель</b
            ><span
              >Если перед планированием спринта каждый разработчик независимо оценивает объём
              задачи, а затем оценки усредняются — итоговая цифра обычно надёжнее, чем если один
              голос («самый громкий» или «самый опытный») сразу задаёт тон всей дискуссии.</span
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

customElements.define('retro-game-crowd-wisdom', RetroGameCrowdWisdom);
