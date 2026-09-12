/* =========================================================
   GAME: Эвристика доступности (availability)
   4 questions instead of 1 — each a binary "what kills more"
   comparison. Same multi-question-screen pattern as
   calibration.js, but each screen is a simple toggle choice
   instead of a low/high range.
========================================================= */
function renderAvailabilityGame(){
  const NAMES = state.participants.slice();
  const QUESTIONS = [
    {
      text: 'Что, по-вашему, ежегодно убивает больше людей в мире: удары молнии или авиакатастрофы?',
      optA: 'Молния', optB: 'Авиакатастрофы', correct: 'a',
      reveal: 'Молния: по оценкам метеослужб — около 24 000 смертей в мире в год, тогда как жертвы авиакатастроф исчисляются несколькими сотнями.',
    },
    {
      text: 'Что чаще становится причиной смерти: диабет или убийство?',
      optA: 'Диабет', optB: 'Убийство', correct: 'a',
      reveal: 'Диабет: по данным ВОЗ, от него ежегодно умирает около 1,5–2 млн человек в мире — в разы больше, чем от убийств (~400 тыс.).',
    },
    {
      text: 'Кто чаще становится причиной смерти человека: москиты (через малярию и другие болезни) или акулы?',
      optA: 'Москиты', optB: 'Акулы', correct: 'a',
      reveal: 'Москиты: переносимые ими болезни убивают порядка 700 000+ человек в год — против 5–10 смертей от акул. Разрыв на пять порядков.',
    },
    {
      text: 'Что чаще убивает: автомобильные аварии или теракты?',
      optA: 'Автоаварии', optB: 'Теракты', correct: 'a',
      reveal: 'Автоаварии: около 1,2 млн смертей в мире в год (ВОЗ) — на порядки больше, чем от терактов в любой отдельно взятый год.',
    },
  ];

  let entries = NAMES.map(n => ({ name:n, answers: QUESTIONS.map(()=>null) }));
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  const TOTAL_SCREENS = 3 + QUESTIONS.length; // instructions + Qn + results + context

  function questionScreenHTML(qIdx){
    const q = QUESTIONS[qIdx];
    const isLast = qIdx === QUESTIONS.length - 1;
    const nextLabel = isLast ? 'Показать результаты →' : 'Следующий вопрос →';
    return `
      <section class="screen" id="screen-${1+qIdx}">
        <p class="eyebrow">Вопрос ${qIdx+1} из ${QUESTIONS.length}</p>
        <h2>${q.text}</h2>
        <p class="lede">Интуитивный выбор — без подсчётов.</p>

        <div class="entry-head toggle-only">
          <div>Участник</div>
          <div>Ответ</div>
        </div>
        <div id="entry-body-${qIdx}"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count-${qIdx}">0</span> из <span id="fill-total-${qIdx}">${NAMES.length}</span>
          <div class="track"><div id="fill-bar-${qIdx}" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="availGoTo(${qIdx})">← Назад</button>
          <button class="primary" id="next-btn-${qIdx}" onclick="availNext(${qIdx})" disabled>${nextLabel}</button>
        </div>
      </section>
    `;
  }

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Эвристика доступности</span>
      </div>
      <div class="progress">${Roles.dotsHTML(TOTAL_SCREENS, 0)}</div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 6 минут</p>
        <h1>Что чаще убивает?</h1>
        <p class="lede">${QUESTIONS.length} коротких вопроса. Не гуглите — это про первое ощущение, а не про факты.</p>

        <div class="draft-mount" id="draft-mount-availability"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Задайте вопрос вслух</b>
              <span>На каждом экране — новая пара причин смерти. Спрашивайте по одной.</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Каждый молча выбирает вариант</b>
              <span>Первое, что приходит в голову — без подсчётов и споров с соседями.</span>
            </div>
          </li>
        </ol>

        <p class="note">Отвечайте интуитивно — колебания и «а давайте подумаем логически» смазывают эффект.</p>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="availGoTo(1)">Начать вопросы →</button>
        </div>
      </section>

      ${QUESTIONS.map((_,i)=>questionScreenHTML(i)).join('')}

      <section class="screen" id="screen-${1+QUESTIONS.length}">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-availability"></div>


        <div class="reveal">
          <div class="n" id="correct-rate">—</div>
          <p><b>Доля интуитивно верных ответов</b> по всей команде — по всем ${QUESTIONS.length} вопросам сразу.</p>
        </div>

        <div class="stat-row" id="per-question-stats"></div>

        <div id="answers-reveal"></div>

        <table class="results-table" id="results-table">
          <thead>
            <tr>
              <th>Участник</th>
              ${QUESTIONS.map((_,i)=>`<th>В${i+1}</th>`).join('')}
              <th>Верно</th>
            </tr>
          </thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-availability"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>


        <div class="nav-row">
          <button class="ghost" onclick="availGoTo(${QUESTIONS.length})">← Назад</button>
          <button class="primary" onclick="availGoTo(${2+QUESTIONS.length})">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-${2+QUESTIONS.length}">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Эвристика доступности</h1>
        <p class="lede">Мы оцениваем вероятность события по тому, насколько легко вспоминаются примеры — а не по реальной статистике.</p>

        <p>Яркие, эмоциональные и часто освещаемые в новостях события кажутся более частыми, чем есть на самом деле. Авиакатастрофы, убийства и теракты — редкие, но заметные и подробно освещаемые трагедии, поэтому нам легко их «вспомнить» и представить. Молнии, диабет, малярия и автоаварии почти никогда не становятся сенсацией — хотя уносят значительно больше жизней.</p>

        <p>Эффект описан в статье Tversky A., Kahneman D. (1973). Availability: A Heuristic for Judging Frequency and Probability. <i>Cognitive Psychology</i>, 5(2). В той же работе показано, что люди систематически считают, будто смертей от убийств больше, чем от диабета — хотя в реальности всё наоборот, и это же самое вы, возможно, только что увидели на своей команде.</p>

        <p><b>Почему мозг так поступает.</b> Оценить точную статистику причин смерти — трудная задача, требующая доступа к данным, которых у нас обычно нет. Вместо этого мозг подменяет сложный вопрос («как часто это происходит на самом деле?») на простой и быстрый («как легко мне вспомнить примеры?») — и отвечает на него, а не на исходный. Это экономит усилия и в большинстве бытовых ситуаций работает неплохо: то, что происходит часто, мы действительно чаще видим и слышим. Но механизм ломается, когда частота упоминания и реальная частота события расходятся — а именно так работают новости: они рассказывают не о типичном, а о редком и шокирующем, потому что типичное неинтересно.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>Тот же механизм — в страхе перед перелётами</b><span>Статистически поездка на машине до аэропорта обычно опаснее самого перелёта, но полёт вызывает у многих куда больше тревоги — потому что авиакатастрофы ярче «доступны» в памяти.</span></div>
        <div class="fact"><b>Москиты — самое смертоносное животное на Земле</b><span>Ни акулы, ни змеи, ни крокодилы не убивают столько людей в год, сколько переносимые москитами болезни — но именно акулы вызывают у людей несоразмерно больше страха.</span></div>
        <div class="fact"><b>После крупных катастроф люди массово меняют поведение</b><span>После резонансных терактов или крушений самолётов число людей, выбирающих машину вместо самолёта, заметно растёт на несколько месяцев — статистически это делает поездку опаснее, а не безопаснее, потому что автомобильные аварии убивают намного больше людей на километр пути.</span></div>
        <div class="fact"><b>Эффект усиливают недавность и личный опыт</b><span>Событие, свидетелем которого вы были лично или которое произошло совсем недавно, «доступается» из памяти легче и заметнее искажает оценку вероятности, чем то же событие, о котором вы просто где-то читали давно.</span></div>
        <div class="fact"><b>Влияет на страхование и здравоохранение</b><span>Люди охотнее покупают страховку от оползней или наводнений сразу после катастрофы в новостях, чем спустя год — хотя объективная вероятность бедствия за это время не изменилась, просто пример стал не таким «доступным».</span></div>
        <div class="fact"><b>Рабочее применение</b><span>В проектах мы точно так же переоцениваем риски, о которых недавно громко говорили (последний инцидент, свежий баг в проде), и недооцениваем тихие, скучные, но более вероятные проблемы.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="availReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('availability');

  Persist.offerRestore('availability', 'draft-mount-availability',
    (p) => Array.isArray(p.entries) && p.entries.length === NAMES.length,
    (p) => {
      entries = p.entries;
      QUESTIONS.forEach((_,qi)=>{
        buildEntryRows(qi);
        updateFillProgress(qi);
      });
      availGoTo(1);
    });

  function buildEntryRows(qIdx){
    const body = document.getElementById('entry-body-' + qIdx);
    body.innerHTML = '';
    const q = QUESTIONS[qIdx];
    entries.forEach((e, i) => {
      const div = document.createElement('div');
      div.className = 'entry-row toggle-only';
      const ans = e.answers[qIdx];
      div.innerHTML = `
        <div class="name">${avatarName(e.name)}</div>
        <div class="toggle-pair" data-idx="${i}" data-q="${qIdx}">
          <button type="button" data-val="a" class="${ans==='a'?'on':''}">${q.optA}</button>
          <button type="button" data-val="b" class="${ans==='b'?'on':''}">${q.optB}</button>
        </div>
      `;
      body.appendChild(div);
    });
    Array.from(body.querySelectorAll('.toggle-pair')).forEach(wrap=>{
      Array.from(wrap.querySelectorAll('button')).forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const idx = +wrap.dataset.idx;
          const qi = +wrap.dataset.q;
          const val = btn.dataset.val;
          entries[idx].answers[qi] = val;
          Array.from(wrap.querySelectorAll('button')).forEach(b=>{
            b.classList.toggle('on', b.dataset.val === val);
          });
          updateFillProgress(qi);
        });
      });
    });
  }

  function updateFillProgress(qIdx){
    const filled = entries.filter(e => e.answers[qIdx] !== null).length;
    Screen.updateProgress('-' + qIdx, filled, NAMES.length, 'next-btn-' + qIdx, 2);
    if(hydrated){ Persist.save('availability', { entries: entries }); }
  }

  window.availGoTo = function(screenIdx){
    Screen.goTo(screenIdx);
  };

  window.availNext = function(qIdx){
    if(qIdx === QUESTIONS.length - 1){
      availShowResults();
    } else {
      availGoTo(2 + qIdx);
    }
  };

  window.availShowResults = function(){
    const correctPerQuestion = QUESTIONS.map(()=>0);
    let totalCorrect = 0, totalAnswered = 0;

    entries.forEach(e=>{
      QUESTIONS.forEach((q,qi)=>{
        const ans = e.answers[qi];
        if(ans === null) return;
        totalAnswered++;
        if(ans === q.correct){ correctPerQuestion[qi]++; totalCorrect++; }
      });
    });

    document.getElementById('correct-rate').textContent =
      totalAnswered ? Math.round(totalCorrect/totalAnswered*100) + '%' : '—';

    const statsEl = document.getElementById('per-question-stats');
    statsEl.innerHTML = QUESTIONS.map((q,qi)=>{
      const answered = entries.filter(e=>e.answers[qi]!==null).length;
      const pct = answered ? Math.round(correctPerQuestion[qi]/answered*100) : 0;
      return `<div class="stat"><div class="n">${pct}%</div><div class="lab">верно в вопросе ${qi+1}</div></div>`;
    }).join('');

    document.getElementById('answers-reveal').innerHTML = QUESTIONS.map((q,i)=>
      `<div class="fact"><b>Вопрос ${i+1}: ${q.optA} vs ${q.optB}</b><span>${q.reveal}</span></div>`
    ).join('');

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    entries.forEach(e=>{
      let hits = 0, answered = 0;
      const cells = QUESTIONS.map((q,qi)=>{
        const ans = e.answers[qi];
        if(ans === null) return '<td>—</td>';
        answered++;
        const hit = ans === q.correct;
        if(hit) hits++;
        return `<td>${hit ? '✓' : '✕'}</td>`;
      }).join('');
      const pctText = answered ? Math.round(hits/answered*100)+'%' : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${avatarName(e.name)}</td>${cells}<td>${pctText}</td>`;
      tbody.appendChild(tr);
    });

    Print.mount('print-header-availability', {
      title: 'Эвристика доступности',
      subtitle: 'Мы оцениваем риск по тому, что легче вспоминается, а не по статистике.',
      meta: Print.meta(entries.length),
      explanation: 'Мы оцениваем вероятность события по тому, насколько легко вспоминаются примеры, а не по реальной статистике — яркие, эмоциональные и часто освещаемые в новостях события кажутся значительно более частыми, чем есть на самом деле. Эффект описали Амос Тверски и Дэниел Канеман в статье 1973 года.'
    });

    availGoTo(1 + QUESTIONS.length);
  };

  window.availReset = function(){
    entries = NAMES.map(n => ({ name:n, answers: QUESTIONS.map(()=>null) }));
    QUESTIONS.forEach((_,qi)=>{
      buildEntryRows(qi);
      updateFillProgress(qi);
    });
    availGoTo(0);
    Persist.clear('availability');
  };

  QUESTIONS.forEach((_,qi)=>{
    buildEntryRows(qi);
    updateFillProgress(qi);
  });
  hydrated = true;
}
