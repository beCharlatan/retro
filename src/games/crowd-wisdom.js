/* =========================================================
   GAME: Мудрость толпы (crowd-wisdom)
   Defaults to the classic "how much does the ISS weigh?"
   question, but the facilitator can swap in their own
   fact-with-a-known-answer before collecting guesses — e.g.
   "сколько строк кода в нашем репозитории?" — so the effect
   feels like it's about this team, not an abstract quiz.
========================================================= */

import { ChartTip } from '../chart-tip.js';
import { Persist } from '../persist.js';
import { Print } from '../print.js';
import { Screen } from '../screen.js';
import { app, avatarName, state } from '../state.js';

export function renderCrowdWisdomGame() {
  const NAMES = state.participants.slice();
  const DEFAULT_VALUE = 420; // tons — real mass of the ISS
  const DEFAULT_QUESTION = 'Сколько тонн весит Международная космическая станция?';
  const DEFAULT_UNIT = 'т';
  const DEFAULT_ANSWER_LINE = 'Международная космическая станция весит около';

  let QUESTION = DEFAULT_QUESTION;
  let TRUE_VALUE = DEFAULT_VALUE;
  let UNIT = DEFAULT_UNIT;
  let isCustomQuestion = false;

  let data = NAMES.map((n) => ({ name: n, guess: null }));
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Мудрость толпы</span>
      </div>
      <div class="progress">
        <div class="dot active" data-dot="0"></div>
        <div class="dot" data-dot="1"></div>
        <div class="dot" data-dot="2"></div>
        <div class="dot" data-dot="3"></div>
      </div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 5 минут</p>
        <h1>Проверим, кто точнее — один человек или вся команда</h1>
        <p class="lede">Два коротких шага. Не гуглите — это оценка «на глаз», в этом весь смысл.</p>

        <div class="draft-mount" id="draft-mount-crowd-wisdom"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Задайте вопрос вслух</b>
              <span id="cw-question-text">«${QUESTION}» Каждый молча думает над своей оценкой, не советуясь с соседями.</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Каждый называет число</b>
              <span>Любое число, даже если совсем не уверены — гадать можно и нужно. Дальше вносим все оценки сюда.</span>
            </div>
          </li>
        </ol>

        <p class="note">Важно: оценки должны быть независимыми — если кто-то услышит чужое число раньше своего, эффект не сработает.</p>

        <div class="custom-q-toggle-row">
          <button type="button" class="ghost" id="custom-q-toggle">✏️ Задать свой вопрос вместо стандартного</button>
        </div>
        <div class="custom-q-panel" id="custom-q-panel" hidden>
          <div class="custom-q-field">
            <label for="custom-q-text">Текст вопроса</label>
            <input type="text" id="custom-q-text" placeholder="Например: сколько строк кода в нашем репозитории?">
          </div>
          <div class="custom-q-row">
            <div class="custom-q-field">
              <label for="custom-q-answer">Правильный ответ</label>
              <input type="number" id="custom-q-answer" placeholder="напр. 42000">
            </div>
            <div class="custom-q-field">
              <label for="custom-q-unit">Единица (необязательно)</label>
              <input type="text" id="custom-q-unit" placeholder="напр. строк, лет, км">
            </div>
          </div>
          <div class="custom-q-actions">
            <button type="button" class="primary" id="custom-q-apply">Применить свой вопрос</button>
            <button type="button" class="ghost" id="custom-q-reset" hidden>↺ Вернуть стандартный</button>
          </div>
          <p class="note" id="custom-q-status"></p>
        </div>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="cwGoTo(1)">Вносить данные →</button>
        </div>
      </section>

      <section class="screen" id="screen-1">
        <p class="eyebrow">Сбор данных</p>
        <h2>Впишите оценку каждого участника</h2>
        <p class="lede">Целым числом — не страшно, если совсем «на глаз».</p>

        <div class="entry-head two-col">
          <div>Участник</div>
          <div>Оценка</div>
        </div>
        <div id="entry-body"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count">0</span> из <span id="fill-total">${NAMES.length}</span>
          <div class="track"><div id="fill-bar" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="cwGoTo(0)">← Назад</button>
          <button class="primary" id="show-results-btn" onclick="cwShowResults()" disabled>Показать результаты →</button>
        </div>
      </section>

      <section class="screen" id="screen-2">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-crowd-wisdom"></div>


        <div class="reveal">
          <div class="n" id="true-value-display">${TRUE_VALUE}${UNIT ? ' ' + UNIT : ''}</div>
          <p id="true-value-para"><b>Правильный ответ:</b> ${DEFAULT_ANSWER_LINE} ${TRUE_VALUE} тонн.</p>
        </div>

        <div class="stat-row">
          <div class="stat">
            <div class="n" id="avg-value">—</div>
            <div class="lab">среднее по команде · ошибка <span id="avg-error">—</span></div>
          </div>
          <div class="stat">
            <div class="n" id="median-value">—</div>
            <div class="lab">медиана по команде · ошибка <span id="median-error">—</span></div>
          </div>
        </div>

        <div class="chart-wrap">
          <svg id="cw-chart" viewBox="0 0 640 220" width="100%" style="display:block;"></svg>
          <div class="cap">Каждая точка — оценка одного человека. Пунктир — правильный ответ, сплошная линия — среднее команды.</div>
        </div>

        <p id="cw-compare-text"></p>

        <table class="results-table" id="results-table">
          <thead><tr><th>Участник</th><th>Оценка</th><th>Ошибка</th></tr></thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-crowd-wisdom"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>


        <div class="nav-row">
          <button class="ghost" onclick="cwGoTo(1)">← Назад</button>
          <button class="primary" onclick="cwGoTo(3)">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-3">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Мудрость толпы</h1>
        <p class="lede">Один человек почти всегда ошибается заметно. Но среднее по всей группе часто оказывается на удивление точным.</p>

        <p>В 1907 году английский учёный Фрэнсис Гальтон оказался на деревенской ярмарке в Плимуте, где проходил конкурс: посетители на глаз оценивали вес быка, купив билет со своей догадкой. Гальтон, не веривший в способности «толпы» здраво судить о числах, собрал и проанализировал все 787 записок после конкурса.</p>

        <div class="stat-row">
          <div class="stat"><div class="n">1197</div><div class="lab">фунтов — реальный вес быка</div></div>
          <div class="stat"><div class="n">1207</div><div class="lab">фунтов — медиана всех 787 оценок</div></div>
        </div>

        <p>Медиана толпы разошлась с реальным весом всего на 9 фунтов из ~1200 — точнее, чем оценки большинства профессиональных скотоводов и мясников, участвовавших в том же конкурсе. Гальтон, ожидавший обратного, опубликовал результат в журнале <i>Nature</i> под названием «Vox Populi» («Глас народа»). Идею позже популяризировал журналист Джеймс Шуровьецки в книге «The Wisdom of Crowds» (2004).</p>

        <p><b>Почему это работает.</b> У каждого отдельного человека есть своя случайная ошибка — кто-то оценивает с запасом, кто-то занижает, у кого-то просто нет опыта в этой конкретной вещи. Если ошибки разных людей действительно случайны и не связаны друг с другом, то при усреднении они частично гасят друг друга: завышенные и заниженные оценки компенсируются, а остаётся общий, более устойчивый сигнал. Математически это работает похоже на то, как усреднение множества шумных измерений в физике даёт более точный результат, чем одно-единственное измерение. Ключевое условие — «независимость»: если люди начинают ориентироваться друг на друга, их ошибки становятся <i>похожими</i>, а не случайными, и усреднение перестаёт что-либо чистить.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>Работает только при независимости оценок</b><span>Если участники слышат чужие числа до того, как назвать своё, — эффект резко слабеет: группа начинает «сбиваться в стаю» вокруг первого прозвучавшего числа (привет, эффект якоря).</span></div>
        <div class="fact"><b>На этом принципе построены рынки прогнозов</b><span>Агрегаторы вроде Metaculus или биржи предсказаний собирают независимые оценки тысяч людей — усреднённый прогноз систематически обгоняет по точности большинство отдельных экспертов.</span></div>
        <div class="fact"><b>Толпа хороша в оценке количества, но не в решениях</b><span>Эффект отлично работает для числовых оценок (вес, число предметов, сроки), но плохо переносится на групповые решения под давлением — там, наоборот, включается конформность (см. эксперименты Аша).</span></div>
        <div class="fact"><b>NASA и разлив нефти</b><span>В 2010 году во время утечки нефти в Мексиканском заливе для оценки скорости разлива привлекали независимые расчёты множества специалистов из разных областей — усреднённая оценка оказалась куда надёжнее, чем любая одна экспертная модель.</span></div>
        <div class="fact"><b>Чем разнообразнее толпа, тем лучше прогноз</b><span>Исследования показывают, что группа из людей с разным опытом и точками зрения в среднем даёт более точный коллективный прогноз, чем группа узких специалистов одного профиля — разнообразие ошибок важнее среднего уровня экспертизы.</span></div>
        <div class="fact"><b>Рабочая параллель</b><span>Если перед планированием спринта каждый разработчик независимо оценивает объём задачи, а затем оценки усредняются — итоговая цифра обычно надёжнее, чем если один голос («самый громкий» или «самый опытный») сразу задаёт тон всей дискуссии.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="cwReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('crowd-wisdom');

  Persist.offerRestore(
    'crowd-wisdom',
    'draft-mount-crowd-wisdom',
    (p) => Array.isArray(p.data) && p.data.length === NAMES.length,
    (p) => {
      data = p.data;
      if (p.question) {
        QUESTION = p.question.text;
        TRUE_VALUE = p.question.value;
        UNIT = p.question.unit;
        isCustomQuestion = true;
        updateQuestionDisplay();
      }
      buildEntryRows();
      updateFillProgress();
      cwGoTo(1);
    },
  );

  function updateQuestionDisplay() {
    document.getElementById('cw-question-text').innerHTML =
      `«${QUESTION}» Каждый молча думает над своей оценкой, не советуясь с соседями.`;
  }

  document.getElementById('custom-q-toggle').addEventListener('click', () => {
    const panel = document.getElementById('custom-q-panel');
    panel.hidden = !panel.hidden;
  });

  document.getElementById('custom-q-apply').addEventListener('click', () => {
    const text = document.getElementById('custom-q-text').value.trim();
    const answerRaw = document.getElementById('custom-q-answer').value;
    const unit = document.getElementById('custom-q-unit').value.trim();
    const answer = Number(answerRaw);
    const statusEl = document.getElementById('custom-q-status');
    if (!text || answerRaw === '' || isNaN(answer)) {
      statusEl.textContent = 'Впишите текст вопроса и числовой правильный ответ.';
      return;
    }
    QUESTION = text;
    TRUE_VALUE = answer;
    UNIT = unit;
    isCustomQuestion = true;
    updateQuestionDisplay();
    statusEl.textContent = '✓ Вопрос обновлён — используется при сборе данных и в результатах.';
    document.getElementById('custom-q-reset').hidden = false;
  });

  document.getElementById('custom-q-reset').addEventListener('click', () => {
    QUESTION = DEFAULT_QUESTION;
    TRUE_VALUE = DEFAULT_VALUE;
    UNIT = DEFAULT_UNIT;
    isCustomQuestion = false;
    updateQuestionDisplay();
    document.getElementById('custom-q-text').value = '';
    document.getElementById('custom-q-answer').value = '';
    document.getElementById('custom-q-unit').value = '';
    document.getElementById('custom-q-status').textContent =
      '✓ Вернули стандартный вопрос про МКС.';
    document.getElementById('custom-q-reset').hidden = true;
  });

  function buildEntryRows() {
    const body = document.getElementById('entry-body');
    body.innerHTML = '';
    data.forEach((row, i) => {
      const div = document.createElement('div');
      div.className = 'entry-row two-col';
      div.innerHTML = `
        <div class="name">${avatarName(row.name)}</div>
        <input type="number" min="0" inputmode="numeric" placeholder="напр. 300" data-idx="${i}" value="${row.guess ?? ''}">
      `;
      body.appendChild(div);
    });
    Array.from(body.querySelectorAll('input')).forEach((inp) => {
      inp.addEventListener('input', onEntryInput);
    });
  }

  function onEntryInput(e) {
    const idx = +e.target.dataset.idx;
    let v = e.target.value === '' ? null : Number(e.target.value);
    if (v !== null && v < 0) v = 0;
    data[idx].guess = v;
    updateFillProgress();
  }

  function updateFillProgress() {
    const filled = data.filter((d) => d.guess !== null).length;
    Screen.updateProgress('', filled, NAMES.length, 'show-results-btn', 2);
    if (hydrated) {
      Persist.save('crowd-wisdom', {
        data: data,
        question: isCustomQuestion ? { text: QUESTION, value: TRUE_VALUE, unit: UNIT } : null,
      });
    }
  }

  window.cwGoTo = (screenIdx) => {
    Screen.goTo(screenIdx);
  };

  function median(arr) {
    const s = arr.slice().sort((a, b) => a - b);
    const n = s.length;
    const mid = Math.floor(n / 2);
    return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function fmt(v) {
    return Math.round(v) + (UNIT ? ' ' + UNIT : '');
  }

  function drawChart(filled) {
    const svg = document.getElementById('cw-chart');
    svg.innerHTML = '';
    const W = 640,
      H = 220,
      ML = 20,
      MR = 20,
      MT = 40,
      MB = 36;
    const plotW = W - ML - MR;
    const guesses = filled.map((d) => d.guess);
    const allVals = guesses.concat([TRUE_VALUE]);
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

    const trueX = xOf(TRUE_VALUE);
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
          `<b>${p.name}</b><span class="tip-row"><span>Оценка</span><span>${fmt(p.guess)}</span></span>`,
      );
    });
  }

  window.cwShowResults = () => {
    const filled = data.filter((d) => d.guess !== null);
    const guesses = filled.map((d) => d.guess);
    const avg = guesses.reduce((a, b) => a + b, 0) / guesses.length;
    const med = median(guesses);
    const avgErr = Math.abs(avg - TRUE_VALUE);
    const medErr = Math.abs(med - TRUE_VALUE);

    document.getElementById('true-value-display').textContent = fmt(TRUE_VALUE);
    document.getElementById('true-value-para').innerHTML = isCustomQuestion
      ? `<b>Правильный ответ:</b> ${fmt(TRUE_VALUE)}.`
      : `<b>Правильный ответ:</b> ${DEFAULT_ANSWER_LINE} ${TRUE_VALUE} тонн.`;

    document.getElementById('avg-value').textContent = fmt(avg);
    document.getElementById('avg-error').textContent = '±' + Math.round(avgErr);
    document.getElementById('median-value').textContent = fmt(med);
    document.getElementById('median-error').textContent = '±' + Math.round(medErr);

    const worseThanAvg = filled.filter((d) => Math.abs(d.guess - TRUE_VALUE) > avgErr).length;
    document.getElementById('cw-compare-text').textContent =
      `У ${worseThanAvg} из ${filled.length} человек личная ошибка больше, чем ошибка среднего по команде — среднее оказалось точнее, чем большинство участников поодиночке.`;

    drawChart(filled);

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    filled.forEach((d) => {
      const err = Math.abs(d.guess - TRUE_VALUE);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${avatarName(d.name)}</td><td>${fmt(d.guess)}</td><td>±${Math.round(err)}</td>`;
      tbody.appendChild(tr);
    });

    Print.mount('print-header-crowd-wisdom', {
      title: 'Мудрость толпы',
      subtitle: isCustomQuestion
        ? QUESTION
        : 'Средняя оценка группы обходит по точности почти всех поодиночке.',
      meta: Print.meta(filled.length),
      explanation:
        'У каждого человека своя случайная ошибка в оценке, но при независимом усреднении эти ошибки частично гасят друг друга. Явление описал Фрэнсис Гальтон в 1907 году: медиана 787 независимых оценок веса быка на деревенской ярмарке разошлась с реальным весом всего на 9 фунтов — точнее большинства профессиональных скотоводов.',
    });

    cwGoTo(2);
  };

  window.cwReset = () => {
    data = NAMES.map((n) => ({ name: n, guess: null }));
    buildEntryRows();
    updateFillProgress();
    cwGoTo(0);
    Persist.clear('crowd-wisdom');
  };

  buildEntryRows();
  updateFillProgress();
  hydrated = true;
}
