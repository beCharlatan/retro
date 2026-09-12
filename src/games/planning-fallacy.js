/* =========================================================
   GAME: Ошибка планирования (planning-fallacy)
========================================================= */
function renderPlanningFallacyGame(){
  const NAMES = state.participants.slice();
  let data = NAMES.map(n => ({ name:n, best:null, actual:null }));
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Ошибка планирования</span>
      </div>
      <div class="progress">
        <div class="dot active" data-dot="0"></div>
        <div class="dot" data-dot="1"></div>
        <div class="dot" data-dot="2"></div>
        <div class="dot" data-dot="3"></div>
      </div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 6 минут</p>
        <h1>Сколько времени это на самом деле занимает?</h1>
        <p class="lede">Два числа на человека. Отвечайте по-честному, вспоминая реальные задачи, а не идеальный сценарий.</p>

        <div class="draft-mount" id="draft-mount-planning-fallacy"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Вспомните типичную рабочую задачу</b>
              <span>Что-то на «примерно один день» по вашей же собственной оценке — тикет, фича, отчёт, что угодно рутинное.</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Назовите два числа в часах</b>
              <span>Сколько эта задача занимает <b>в лучшем случае</b>, если всё идёт по плану — и сколько занимает <b>по факту в среднем</b>, если вспомнить последние похожие задачи.</span>
            </div>
          </li>
        </ol>

        <p class="note">Первым называйте «лучший случай» — не подглядывайте вперёд на «по факту».</p>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="pfGoTo(1)">Вносить данные →</button>
        </div>
      </section>

      <section class="screen" id="screen-1">
        <p class="eyebrow">Сбор данных</p>
        <h2>Впишите оценки каждого участника</h2>
        <p class="lede">В часах: «лучший случай» и «по факту в среднем».</p>

        <div class="entry-head">
          <div>Участник</div>
          <div>Лучший случай, ч</div>
          <div>По факту, ч</div>
        </div>
        <div id="entry-body"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count">0</span> из <span id="fill-total">${NAMES.length}</span>
          <div class="track"><div id="fill-bar" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="pfGoTo(0)">← Назад</button>
          <button class="primary" id="show-results-btn" onclick="pfShowResults()" disabled>Показать результаты →</button>
        </div>
      </section>

      <section class="screen" id="screen-2">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-planning-fallacy"></div>


        <div class="reveal">
          <div class="n" id="avg-ratio">—</div>
          <p><b>В среднем по команде</b> факт превышает «лучший случай» именно во столько раз — и это никого не должно удивлять, так работает почти у всех.</p>
        </div>

        <div class="group-compare">
          <div class="g low">
            <div class="t">Превышение меньше чем в 1.3 раза</div>
            <div class="v" id="accurate-count">—</div>
          </div>
          <div class="g high">
            <div class="t">Превышение больше чем в 1.5 раза</div>
            <div class="v" id="overrun-count">—</div>
          </div>
        </div>

        <table class="results-table" id="results-table">
          <thead><tr><th>Участник</th><th>Лучший случай</th><th>По факту</th><th>Во сколько раз</th></tr></thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-planning-fallacy"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>


        <div class="nav-row">
          <button class="ghost" onclick="pfGoTo(1)">← Назад</button>
          <button class="primary" onclick="pfGoTo(3)">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-3">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Ошибка планирования</h1>
        <p class="lede">Люди систематически недооценивают, сколько времени займёт задача — даже прекрасно помня, что прошлые похожие задачи тоже заняли больше, чем планировалось.</p>

        <p>Термин ввели Дэниел Канеман и Амос Тверски в 1977–1979 годах. Классический экспериментальный разбор — исследование Roger Buehler, Dale Griffin и Michael Ross (1994): студентов, пишущих дипломную работу, попросили дать реалистичный прогноз срока сдачи и отдельно — «наихудший сценарий, если вдруг всё пойдёт не так». У большинства студентов фактическое время превысило даже их собственный наихудший прогноз.</p>

        <p>Работа опубликована как Buehler R., Griffin D., Ross M. (1994). Exploring the "Planning Fallacy": Why People Underestimate Their Task Completion Times. <i>Journal of Personality and Social Psychology</i>.</p>

        <p><b>Почему «лучший случай» обманывает даже опытных людей.</b> Когда мы планируем задачу, мозг мысленно проигрывает сценарий «всё идёт по плану»: открыл задачу, сделал, закрыл — без учёта того, что может пойти не так. Канеман называл это «внутренним взглядом» (inside view) — мы фокусируемся на конкретном плане перед глазами, а не на статистике всех похожих задач, которые нам приходилось делать раньше («внешний взгляд», outside view). Проблема в том, что реальные задачи почти всегда включают непредвиденные мелочи — не потому что мы плохо планируем именно этот случай, а потому что «что-то пойдёт не так» в принципе статистически вероятно почти всегда, просто каждый раз по-своему. Мозг учитывает конкретные препятствия, которые может представить заранее, но не умеет заранее представить препятствие, о существовании которого пока не знает.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>Знание об ошибке не спасает от неё</b><span>«Inside view» — попытка представить именно эту задачу заново — почти всегда побеждает статистику прошлых похожих задач, даже когда сам человек прекрасно знает об этом искажении.</span></div>
        <div class="fact"><b>Единственное, что реально помогает — reference class forecasting</b><span>Сознательно смотреть не «сколько эта задача займёт», а «сколько в среднем занимали похожие задачи раньше» — и планировать от этого числа, а не от воображаемого идеального сценария.</span></div>
        <div class="fact"><b>Крупные проекты страдают систематически</b><span>Исследования масштабных инфраструктурных проектов (авторства экономиста Бента Фливбьорга) показывают, что реальные сроки и бюджеты крупных строек — от туннелей до олимпийских объектов — систематически превышают первоначальные оценки, причём разброс превышения десятилетиями остаётся примерно одинаковым.</span></div>
        <div class="fact"><b>Дробление задачи снижает искажение</b><span>Если разбить крупную задачу на мелкие подзадачи и оценивать каждую отдельно, суммарная оценка обычно получается точнее, чем одна общая оценка «на глаз» — мелкие шаги труднее мысленно представить как безупречные.</span></div>
        <div class="fact"><b>Оптимизм и социальное давление усиливают эффект</b><span>Люди дают более оптимистичные (то есть более неточные) прогнозы, когда знают, что оценку увидят коллеги или начальство — называть большую цифру социально «неудобно», даже если она честнее.</span></div>
        <div class="fact"><b>Прямая параллель со спринтами</b><span>Оценка в story points или часах на глаз почти всегда описывает «лучший случай» — отсюда системное расхождение между оценкой в начале спринта и тем, что происходит на самом деле.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="pfReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('planning-fallacy');

  Persist.offerRestore('planning-fallacy', 'draft-mount-planning-fallacy',
    (p) => Array.isArray(p.data) && p.data.length === NAMES.length,
    (p) => {
      data = p.data;
      buildEntryRows();
      updateFillProgress();
      pfGoTo(1);
    });

  function buildEntryRows(){
    const body = document.getElementById('entry-body');
    body.innerHTML = '';
    data.forEach((row, i) => {
      const div = document.createElement('div');
      div.className = 'entry-row';
      div.innerHTML = `
        <div class="name">${avatarName(row.name)}</div>
        <input type="number" min="0" step="0.5" inputmode="decimal" placeholder="напр. 4" data-idx="${i}" data-field="best" value="${row.best ?? ''}">
        <input type="number" min="0" step="0.5" inputmode="decimal" placeholder="напр. 9" data-idx="${i}" data-field="actual" value="${row.actual ?? ''}">
      `;
      body.appendChild(div);
    });
    Array.from(body.querySelectorAll('input')).forEach(inp=>{
      inp.addEventListener('input', onEntryInput);
    });
  }

  function onEntryInput(e){
    const idx = +e.target.dataset.idx;
    const field = e.target.dataset.field;
    let v = e.target.value === '' ? null : Number(e.target.value);
    if(v !== null && v < 0) v = 0;
    data[idx][field] = v;
    updateFillProgress();
  }

  function updateFillProgress(){
    const filled = data.filter(d => d.best !== null && d.actual !== null && d.best > 0).length;
    Screen.updateProgress('', filled, NAMES.length, 'show-results-btn', 2);
    if(hydrated){ Persist.save('planning-fallacy', { data: data }); }
  }

  window.pfGoTo = function(screenIdx){
    Screen.goTo(screenIdx);
  };

  window.pfShowResults = function(){
    const filled = data.filter(d => d.best !== null && d.actual !== null && d.best > 0);
    const ratios = filled.map(d => d.actual / d.best);
    const avgRatio = ratios.reduce((a,b)=>a+b,0)/ratios.length;

    document.getElementById('avg-ratio').textContent = avgRatio.toFixed(2) + '×';
    document.getElementById('accurate-count').textContent = ratios.filter(r=>r<1.3).length + ' из ' + ratios.length;
    document.getElementById('overrun-count').textContent = ratios.filter(r=>r>1.5).length + ' из ' + ratios.length;

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    filled.forEach(d=>{
      const ratio = d.actual/d.best;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${avatarName(d.name)}</td><td>${d.best} ч</td><td>${d.actual} ч</td><td>${ratio.toFixed(2)}×</td>`;
      tbody.appendChild(tr);
    });

    Print.mount('print-header-planning-fallacy', {
      title: 'Ошибка планирования',
      subtitle: '«В лучшем случае» и «по факту» — почти никогда не одно и то же число.',
      meta: Print.meta(filled.length),
      explanation: 'Люди систематически недооценивают, сколько времени займёт задача, даже прекрасно помня, что прошлые похожие задачи тоже заняли больше запланированного. Термин ввели Дэниел Канеман и Амос Тверски в 1977–1979 годах; классический разбор — исследование Roger Buehler, Dale Griffin и Michael Ross (1994) о студентах и сроках дипломных работ.'
    });

    pfGoTo(2);
  };

  window.pfReset = function(){
    data = NAMES.map(n => ({ name:n, best:null, actual:null }));
    buildEntryRows();
    updateFillProgress();
    pfGoTo(0);
    Persist.clear('planning-fallacy');
  };

  buildEntryRows();
  updateFillProgress();
  hydrated = true;
}
