/* =========================================================
   GAME: Калибровка уверенности (calibration)
   The heaviest data-entry pattern in the catalog: instead of
   one value per person, we need a low/high range per person
   PER QUESTION. Rather than cramming every question onto one
   screen, each question gets its own entry screen (reusing
   the plain 3-column entry-row/entry-head pattern already used
   by anchoring.js) — simpler to fill in live, one question at
   a time, same rhythm as reading questions aloud.
========================================================= */
function renderCalibrationGame(){
  const NAMES = state.participants.slice();
  const DEFAULT_QUESTIONS = [
    { q: 'В каком году была основана компания Google?', answer: 1998, unit: '' },
    { q: 'Какова высота горы Килиманджаро, в метрах?', answer: 5895, unit: ' м' },
    { q: 'Какова длина реки Волга, в километрах?', answer: 3530, unit: ' км' },
  ];
  let QUESTIONS = DEFAULT_QUESTIONS.map(q => ({ ...q }));
  let entries = NAMES.map(n => ({ name:n, ranges: QUESTIONS.map(()=>({low:null, high:null})) }));
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  const TOTAL_SCREENS = 3 + QUESTIONS.length; // instructions + Qn + results + context

  function questionScreenHTML(qIdx){
    const isLast = qIdx === QUESTIONS.length - 1;
    const nextLabel = isLast ? 'Показать результаты →' : 'Следующий вопрос →';
    return `
      <section class="screen" id="screen-${1+qIdx}">
        <p class="eyebrow">Вопрос ${qIdx+1} из ${QUESTIONS.length}</p>
        <h2 id="q-heading-${qIdx}">${QUESTIONS[qIdx].q}</h2>
        <p class="lede">Для каждого — диапазон, в который он уверен на 90%, что попадёт правильный ответ.</p>

        <div class="entry-head">
          <div>Участник</div>
          <div>Нижняя граница</div>
          <div>Верхняя граница</div>
        </div>
        <div id="entry-body-${qIdx}"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count-${qIdx}">0</span> из <span id="fill-total-${qIdx}">${NAMES.length}</span>
          <div class="track"><div id="fill-bar-${qIdx}" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="calGoTo(${qIdx})">← Назад</button>
          <button class="primary" id="next-btn-${qIdx}" onclick="calNext(${qIdx})" disabled>${nextLabel}</button>
        </div>
      </section>
    `;
  }

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Калибровка уверенности</span>
      </div>
      <div class="progress">${Roles.dotsHTML(TOTAL_SCREENS, 0)}</div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 10 минут</p>
        <h1>Насколько вы на самом деле уверены?</h1>
        <p class="lede">${QUESTIONS.length} коротких вопроса. На каждый — не точный ответ, а диапазон.</p>

        <div class="draft-mount" id="draft-mount-calibration"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Задайте вопрос вслух</b>
              <span>Каждый вопрос — про число: год, высоту, длину. Не гуглите.</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Каждый называет диапазон, а не число</b>
              <span>Нижнюю и верхнюю границу, внутри которых, по ощущению, находится правильный ответ с вероятностью 90%. Если не уверены — берите диапазон шире, а не угадывайте точное число.</span>
            </div>
          </li>
        </ol>

        <p class="note">Задача — не угадать точно, а честно оценить границы своей уверенности.</p>

        <div class="custom-q-toggle-row">
          <button type="button" class="ghost" id="custom-q-toggle">✏️ Задать свои вопросы вместо стандартных</button>
        </div>
        <div class="custom-q-panel" id="custom-q-panel" hidden>
          <p class="note" style="margin:0 0 14px;">Можно заменить любой из трёх вопросов — оставьте поле пустым, чтобы оставить стандартный.</p>
          ${QUESTIONS.map((q,i)=>`
            <div class="custom-q-block">
              <div class="custom-q-block-title">Вопрос ${i+1} <span class="custom-q-default-hint">по умолчанию: «${q.q}», ответ ${q.answer}${q.unit}</span></div>
              <div class="custom-q-field">
                <label for="custom-q-text-${i}">Текст вопроса</label>
                <input type="text" id="custom-q-text-${i}" placeholder="${q.q}">
              </div>
              <div class="custom-q-row">
                <div class="custom-q-field">
                  <label for="custom-q-answer-${i}">Правильный ответ</label>
                  <input type="number" id="custom-q-answer-${i}" placeholder="напр. ${q.answer}">
                </div>
                <div class="custom-q-field">
                  <label for="custom-q-unit-${i}">Единица (необязательно)</label>
                  <input type="text" id="custom-q-unit-${i}" placeholder="напр. ${q.unit.trim() || 'лет'}">
                </div>
              </div>
            </div>
          `).join('')}
          <div class="custom-q-actions">
            <button type="button" class="primary" id="custom-q-apply">Применить</button>
            <button type="button" class="ghost" id="custom-q-reset" hidden>↺ Вернуть все стандартные</button>
          </div>
          <p class="note" id="custom-q-status"></p>
        </div>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="calGoTo(1)">Начать вопросы →</button>
        </div>
      </section>

      ${QUESTIONS.map((_,i)=>questionScreenHTML(i)).join('')}

      <section class="screen" id="screen-${1+QUESTIONS.length}">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-calibration"></div>


        <div class="reveal">
          <div class="n" id="hit-rate">—</div>
          <p><b>Реальное попадание в свои же 90%-е диапазоны</b> — у идеально откалиброванного человека здесь должно быть около 90%.</p>
        </div>

        <div class="stat-row" id="per-question-stats"></div>

        <p class="note" id="answers-reveal"></p>

        <table class="results-table" id="results-table">
          <thead>
            <tr>
              <th>Участник</th>
              ${QUESTIONS.map((_,i)=>`<th>В${i+1}</th>`).join('')}
              <th>Попаданий</th>
            </tr>
          </thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-calibration"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>


        <div class="nav-row">
          <button class="ghost" onclick="calGoTo(${QUESTIONS.length})">← Назад</button>
          <button class="primary" onclick="calGoTo(${2+QUESTIONS.length})">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-${2+QUESTIONS.length}">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Калибровка уверенности</h1>
        <p class="lede">Люди систематически переоценивают точность собственных знаний: когда просят дать 90%-й диапазон, правильный ответ попадает в него куда реже, чем в 90% случаев.</p>

        <p>Классическая работа — Alpert M., Raiffa H. (1982). A Progress Report on the Training of Probability Assessors, глава в книге Kahneman D., Slovic P., Tversky A. (ред.) <i>Judgment Under Uncertainty: Heuristics and Biases</i>. Cambridge University Press.</p>

        <div class="stat-row">
          <div class="stat"><div class="n">90%</div><div class="lab">заявленная уверенность</div></div>
          <div class="stat"><div class="n">~40–60%</div><div class="lab">реальное попадание у большинства людей в классических опытах</div></div>
        </div>

        <p>Люди называют куда более узкие интервалы, чем оправдано их реальными знаниями — «уверенность» и «точность» оказываются разными вещами.</p>

        <p><b>Что именно тут измеряется.</b> Калибровка — это не про то, знаете вы факт или нет, а про то, насколько ваше <i>ощущение</i> уверенности соответствует <i>реальной</i> вероятности быть правым. Идеально откалиброванный человек, называя диапазон «на 90%», должен угадывать примерно 9 раз из 10 — не больше и не меньше. Если реальное попадание заметно ниже 90%, значит, интервалы были названы слишком узкими — человек почувствовал больше уверенности, чем позволяли его фактические знания. Любопытно, что решение — не «знать больше», а именно шире раскрывать границы неопределённости: если сомневаетесь, разумнее взять запас с обеих сторон, чем угадывать точное число.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>Калибровка — тренируемый навык</b><span>Профессиональные прогнозисты и букмекеры откалиброваны заметно лучше среднего человека — за счёт постоянной обратной связи между прогнозом и реальным исходом.</span></div>
        <div class="fact"><b>Более узкий диапазон ощущается как более компетентный</b><span>Люди часто сужают интервал не потому, что действительно так уверены, а потому что широкий диапазон подсознательно кажется признанием некомпетентности — хотя честная широта тут и есть компетентность.</span></div>
        <div class="fact"><b>Эффект Даннинга — Крюгера здесь рядом, но не то же самое</b><span>Плохая калибровка касается всех уровней знаний, а не только новичков — эксперты тоже систематически называют слишком узкие интервалы в своей области, просто с виду это не так заметно, как у новичка.</span></div>
        <div class="fact"><b>В медицине это вопрос жизни и смерти</b><span>Исследования показывают, что врачи, давая прогнозы («сколько времени осталось» или «какова вероятность осложнения»), тоже подвержены плохой калибровке — что делает обучение специалистов честной оценке неопределённости отдельной важной задачей в медицинском образовании.</span></div>
        <div class="fact"><b>Суперпрогнозисты откалиброваны заметно лучше</b><span>В проекте Филипа Тетлока «Good Judgment Project» отдельная небольшая группа непрофессиональных прогнозистов систематически обгоняла даже аналитиков спецслужб по точности вероятностных прогнозов — во многом благодаря именно привычке регулярно проверять и пересматривать степень своей уверенности.</span></div>
        <div class="fact"><b>Прямая рабочая параллель</b><span>Оценка сроков и рисков проекта «с вероятностью 90%» на практике почти никогда не выполняется с такой частотой — те же узкие, самоуверенные интервалы, что и в этой игре.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="calReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('calibration');

  Persist.offerRestore('calibration', 'draft-mount-calibration',
    (p) => Array.isArray(p.entries) && p.entries.length === NAMES.length,
    (p) => {
      entries = p.entries;
      if(p.questions){
        QUESTIONS = p.questions;
        isCustomQuestions = true;
        updateQuestionDisplay();
      }
      QUESTIONS.forEach((_,qi)=>{
        buildEntryRows(qi);
        updateFillProgress(qi);
      });
      calGoTo(1);
    });

  let isCustomQuestions = false;

  function updateQuestionDisplay(){
    QUESTIONS.forEach((q,i)=>{
      const el = document.getElementById('q-heading-' + i);
      if(el) el.textContent = q.q;
    });
  }

  document.getElementById('custom-q-toggle').addEventListener('click', ()=>{
    const panel = document.getElementById('custom-q-panel');
    panel.hidden = !panel.hidden;
  });

  document.getElementById('custom-q-apply').addEventListener('click', ()=>{
    const statusEl = document.getElementById('custom-q-status');
    const next = DEFAULT_QUESTIONS.map((def, i) => {
      const text = document.getElementById('custom-q-text-' + i).value.trim();
      const answerRaw = document.getElementById('custom-q-answer-' + i).value;
      const unit = document.getElementById('custom-q-unit-' + i).value.trim();
      if(!text && answerRaw === '') return { ...def }; // slot left blank — keep default
      const answer = Number(answerRaw);
      if(!text || answerRaw === '' || isNaN(answer)) return null; // invalid partial fill
      return { q: text, answer: answer, unit: unit ? ' ' + unit : '' };
    });
    if(next.some(q => q === null)){
      statusEl.textContent = 'Для каждого заполненного вопроса нужен и текст, и числовой ответ — либо оставьте оба поля пустыми.';
      return;
    }
    QUESTIONS = next;
    isCustomQuestions = next.some((q,i) => q.q !== DEFAULT_QUESTIONS[i].q || q.answer !== DEFAULT_QUESTIONS[i].answer);
    updateQuestionDisplay();
    statusEl.textContent = '✓ Вопросы обновлены — используются при сборе данных и в результатах.';
    document.getElementById('custom-q-reset').hidden = false;
  });

  document.getElementById('custom-q-reset').addEventListener('click', ()=>{
    QUESTIONS = DEFAULT_QUESTIONS.map(q => ({ ...q }));
    isCustomQuestions = false;
    updateQuestionDisplay();
    DEFAULT_QUESTIONS.forEach((_,i)=>{
      document.getElementById('custom-q-text-' + i).value = '';
      document.getElementById('custom-q-answer-' + i).value = '';
      document.getElementById('custom-q-unit-' + i).value = '';
    });
    document.getElementById('custom-q-status').textContent = '✓ Вернули все три стандартных вопроса.';
    document.getElementById('custom-q-reset').hidden = true;
  });

  function buildEntryRows(qIdx){
    const body = document.getElementById('entry-body-' + qIdx);
    body.innerHTML = '';
    entries.forEach((e, i) => {
      const div = document.createElement('div');
      div.className = 'entry-row';
      const r = e.ranges[qIdx];
      div.innerHTML = `
        <div class="name">${avatarName(e.name)}</div>
        <input type="number" inputmode="numeric" placeholder="мин." data-idx="${i}" data-q="${qIdx}" data-field="low" value="${r.low ?? ''}">
        <input type="number" inputmode="numeric" placeholder="макс." data-idx="${i}" data-q="${qIdx}" data-field="high" value="${r.high ?? ''}">
      `;
      body.appendChild(div);
    });
    Array.from(body.querySelectorAll('input')).forEach(inp=>{
      inp.addEventListener('input', onEntryInput);
    });
  }

  function onEntryInput(e){
    const idx = +e.target.dataset.idx;
    const qIdx = +e.target.dataset.q;
    const field = e.target.dataset.field;
    const v = e.target.value === '' ? null : Number(e.target.value);
    entries[idx].ranges[qIdx][field] = v;
    updateFillProgress(qIdx);
  }

  function updateFillProgress(qIdx){
    const filled = entries.filter(e => {
      const r = e.ranges[qIdx];
      return r.low !== null && r.high !== null;
    }).length;
    Screen.updateProgress('-' + qIdx, filled, NAMES.length, 'next-btn-' + qIdx, 2);
    if(hydrated){
      Persist.save('calibration', {
        entries: entries,
        questions: isCustomQuestions ? QUESTIONS : null
      });
    }
  }

  window.calGoTo = function(screenIdx){
    Screen.goTo(screenIdx);
  };

  window.calNext = function(qIdx){
    if(qIdx === QUESTIONS.length - 1){
      calShowResults();
    } else {
      calGoTo(2 + qIdx);
    }
  };

  window.calShowResults = function(){
    const hitsPerQuestion = QUESTIONS.map(()=>0);
    let totalHits = 0, totalAnswered = 0;

    entries.forEach(e=>{
      QUESTIONS.forEach((q,qi)=>{
        const r = e.ranges[qi];
        if(r.low === null || r.high === null) return;
        const lo = Math.min(r.low, r.high), hi = Math.max(r.low, r.high);
        const hit = q.answer >= lo && q.answer <= hi;
        if(hit){ hitsPerQuestion[qi]++; totalHits++; }
        totalAnswered++;
      });
    });

    document.getElementById('hit-rate').textContent =
      totalAnswered ? Math.round(totalHits/totalAnswered*100) + '%' : '—';

    const statsEl = document.getElementById('per-question-stats');
    statsEl.innerHTML = QUESTIONS.map((q,qi)=>{
      const answered = entries.filter(e=>e.ranges[qi].low!==null && e.ranges[qi].high!==null).length;
      const pct = answered ? Math.round(hitsPerQuestion[qi]/answered*100) : 0;
      return `<div class="stat"><div class="n">${pct}%</div><div class="lab">попаданий в вопросе ${qi+1}</div></div>`;
    }).join('');

    document.getElementById('answers-reveal').textContent =
      'Правильные ответы: ' + QUESTIONS.map((q,i)=>`(${i+1}) ${q.answer}${q.unit}`).join(' · ');

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    entries.forEach(e=>{
      let hits = 0, answered = 0;
      const cells = QUESTIONS.map((q,qi)=>{
        const r = e.ranges[qi];
        if(r.low === null || r.high === null) return '<td>—</td>';
        answered++;
        const lo = Math.min(r.low, r.high), hi = Math.max(r.low, r.high);
        const hit = q.answer >= lo && q.answer <= hi;
        if(hit) hits++;
        return `<td>${hit ? '✓' : '✕'}</td>`;
      }).join('');
      const pctText = answered ? Math.round(hits/answered*100)+'%' : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${avatarName(e.name)}</td>${cells}<td>${pctText}</td>`;
      tbody.appendChild(tr);
    });

    Print.mount('print-header-calibration', {
      title: 'Калибровка уверенности',
      subtitle: 'Уверены на 90%? Реальное попадание обычно куда ниже.',
      meta: Print.meta(entries.length),
      explanation: 'Люди систематически переоценивают точность собственных знаний: если попросить 90%-й доверительный интервал, правильный ответ на деле попадает в него заметно реже, чем в 90% случаев. Классическая работа — Alpert M., Raiffa H. (1982) в сборнике Kahneman, Slovic, Tversky «Judgment Under Uncertainty».'
    });

    calGoTo(1 + QUESTIONS.length);
  };

  window.calReset = function(){
    entries = NAMES.map(n => ({ name:n, ranges: QUESTIONS.map(()=>({low:null, high:null})) }));
    QUESTIONS.forEach((_,qi)=>{
      buildEntryRows(qi);
      updateFillProgress(qi);
    });
    calGoTo(0);
    Persist.clear('calibration');
  };

  QUESTIONS.forEach((_,qi)=>{
    buildEntryRows(qi);
    updateFillProgress(qi);
  });
  hydrated = true;
}
