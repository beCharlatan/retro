/* =========================================================
   GAME: Эффект ложного консенсуса (false-consensus)
========================================================= */
function renderFalseConsensusGame() {
  const NAMES = state.participants.slice();
  const DEFAULT_QUESTION =
    'Готовы ли вы прямо сейчас, без подготовки, провести 5-минутную презентацию перед всей командой?';
  let QUESTION = DEFAULT_QUESTION;
  let isCustomQuestion = false;
  let data = NAMES.map((n) => ({ name: n, own: null, estimate: null }));
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Ложный консенсус</span>
      </div>
      <div class="progress">
        <div class="dot active" data-dot="0"></div>
        <div class="dot" data-dot="1"></div>
        <div class="dot" data-dot="2"></div>
        <div class="dot" data-dot="3"></div>
      </div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 6 минут</p>
        <h1>Один вопрос про вас — и про всех остальных</h1>
        <p class="lede">Два быстрых ответа на человека. Отвечайте честно, не подглядывая на соседей.</p>

        <div class="draft-mount" id="draft-mount-false-consensus"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Задайте вопрос вслух</b>
              <span id="fc-question-text">«${QUESTION}» Каждый отвечает про себя: да или нет.</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Каждый оценивает команду</b>
              <span>Теперь — какой процент всей команды, по-вашему, тоже ответит «да»? Число от 0 до 100.</span>
            </div>
          </li>
        </ol>

        <p class="note">Отвечайте на первый вопрос до того, как думать над вторым — не пересчитывайте назад.</p>

        <div class="custom-q-toggle-row">
          <button type="button" class="ghost" id="custom-q-toggle">✏️ Задать свой вопрос вместо стандартного</button>
        </div>
        <div class="custom-q-panel" id="custom-q-panel" hidden>
          <div class="custom-q-field">
            <label for="custom-q-text">Текст вопроса (да/нет)</label>
            <input type="text" id="custom-q-text" placeholder="Например: готовы ли вы прямо сейчас взяться за тикет без документации?">
          </div>
          <div class="custom-q-actions">
            <button type="button" class="primary" id="custom-q-apply">Применить свой вопрос</button>
            <button type="button" class="ghost" id="custom-q-reset" hidden>↺ Вернуть стандартный</button>
          </div>
          <p class="note" id="custom-q-status"></p>
        </div>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="fcGoTo(1)">Вносить данные →</button>
        </div>
      </section>

      <section class="screen" id="screen-1">
        <p class="eyebrow">Сбор данных</p>
        <h2>Впишите ответы каждого участника</h2>
        <p class="lede">Свой ответ (да/нет) и оценку, какой % команды тоже скажет «да».</p>

        <div class="entry-head toggle-col">
          <div>Участник</div>
          <div>Свой ответ</div>
          <div>% команды «да»</div>
        </div>
        <div id="entry-body"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count">0</span> из <span id="fill-total">${NAMES.length}</span>
          <div class="track"><div id="fill-bar" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="fcGoTo(0)">← Назад</button>
          <button class="primary" id="show-results-btn" onclick="fcShowResults()" disabled>Показать результаты →</button>
        </div>
      </section>

      <section class="screen" id="screen-2">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-false-consensus"></div>


        <div class="reveal">
          <div class="n" id="real-yes">—</div>
          <p><b>Реальная доля ответивших «да»</b> в вашей команде — именно с этим числом сейчас сравним чужие прогнозы.</p>
        </div>

        <div class="group-compare">
          <div class="g low">
            <div class="t">Средний прогноз у тех, кто сам сказал «да»</div>
            <div class="v" id="yes-side-avg">—</div>
          </div>
          <div class="g high">
            <div class="t">Средний прогноз у тех, кто сам сказал «нет»</div>
            <div class="v" id="no-side-avg">—</div>
          </div>
        </div>

        <p id="fc-compare-text"></p>

        <table class="results-table" id="results-table">
          <thead><tr><th>Участник</th><th>Свой ответ</th><th>Прогноз, % «да»</th></tr></thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-false-consensus"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>


        <div class="nav-row">
          <button class="ghost" onclick="fcGoTo(1)">← Назад</button>
          <button class="primary" onclick="fcGoTo(3)">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-3">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Эффект ложного консенсуса</h1>
        <p class="lede">Мы систематически переоцениваем, насколько остальные разделяют наше собственное мнение или поведение.</p>

        <p>В 1977 году психологи Ли Росс, Дэвид Грин и Памела Хаус провели серию опытов в Стэнфорде. В одном из них студентам предлагали (по желанию) походить по кампусу с рекламным щитом «Ешьте в Joe's» — и заранее спрашивали, какой процент других студентов, по их мнению, тоже на это согласится.</p>

        <div class="stat-row">
          <div class="stat"><div class="n">~62%</div><div class="lab">ожидаемая согласившимися доля студентов, которые тоже согласятся</div></div>
          <div class="stat"><div class="n">~33%</div><div class="lab">ожидаемая отказавшимися доля студентов, которые согласятся</div></div>
        </div>

        <p>Обе группы студентов были уверены, что большинство поступит так же, как они сами — просто в разные стороны. Работа опубликована как Ross L., Greene D., House P. (1977). The False Consensus Effect: An Egocentric Bias in Social Perception and Attribution Processes. <i>Journal of Experimental Social Psychology</i>.</p>

        <p><b>Откуда берётся искажение.</b> Когда мы прогнозируем чужое мнение, у нас нет доступа к головам других людей — единственная реальная точка отсчёта, которая есть под рукой, это наше собственное мнение. Мозг использует его как черновой шаблон: «раз я так думаю, и мои причины кажутся мне разумными, то и другие, скорее всего, придут к тому же выводу». Это быстрый и в целом полезный способ прогноза — в большинстве повседневных ситуаций люди вокруг нас действительно часто думают похоже. Проблема в том, что мозг не делает скидку на то, что сам является участником оценки: собственная позиция используется не как один из голосов, а как эталон, вокруг которого мысленно строится вся остальная популяция.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>Отчасти это не иллюзия, а реальность локального пузыря</b><span>Мы дружим и работаем с похожими на себя людьми — поэтому в нашем непосредственном окружении консенсус вокруг нашего мнения зачастую и правда выше среднего по популяции, что делает искажение ещё труднее заметить.</span></div>
        <div class="fact"><b>Эффект усиливается для морально окрашенных вопросов</b><span>Чем сильнее мы уверены, что наша позиция «единственно правильная», тем выше мы склонны переоценивать долю согласных с нами — эффект слабее для нейтральных фактических вопросов.</span></div>
        <div class="fact"><b>Работает и в обратную сторону — для меньшинств</b><span>Люди с редкими привычками или взглядами иногда, наоборот, недооценивают, сколько единомышленников у них есть — потому что молчаливое большинство вокруг создаёт впечатление, что «таких, как я, почти нет».</span></div>
        <div class="fact"><b>Соцсети усиливают эффект</b><span>Алгоритмические ленты показывают нам контент, похожий на то, что мы уже поддерживаем — из-за этого ощущение «все согласны со мной» может расти даже без реального роста согласия в обществе.</span></div>
        <div class="fact"><b>Прямое приложение к работе</b><span>«Всем же очевидно, что нужно делать именно так» — одна из самых частых форм ложного консенсуса в рабочих спорах; стоит явно спросить мнение команды, а не полагаться на ощущение всеобщего согласия.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="fcReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('false-consensus');

  Persist.offerRestore(
    'false-consensus',
    'draft-mount-false-consensus',
    (p) => Array.isArray(p.data) && p.data.length === NAMES.length,
    (p) => {
      data = p.data;
      if (p.question) {
        QUESTION = p.question;
        isCustomQuestion = true;
        updateQuestionDisplay();
      }
      buildEntryRows();
      updateFillProgress();
      fcGoTo(1);
    },
  );

  function updateQuestionDisplay() {
    document.getElementById('fc-question-text').innerHTML =
      `«${QUESTION}» Каждый отвечает про себя: да или нет.`;
  }

  document.getElementById('custom-q-toggle').addEventListener('click', () => {
    const panel = document.getElementById('custom-q-panel');
    panel.hidden = !panel.hidden;
  });

  document.getElementById('custom-q-apply').addEventListener('click', () => {
    const text = document.getElementById('custom-q-text').value.trim();
    const statusEl = document.getElementById('custom-q-status');
    if (!text) {
      statusEl.textContent = 'Впишите текст вопроса.';
      return;
    }
    QUESTION = text;
    isCustomQuestion = true;
    updateQuestionDisplay();
    statusEl.textContent = '✓ Вопрос обновлён.';
    document.getElementById('custom-q-reset').hidden = false;
  });

  document.getElementById('custom-q-reset').addEventListener('click', () => {
    QUESTION = DEFAULT_QUESTION;
    isCustomQuestion = false;
    updateQuestionDisplay();
    document.getElementById('custom-q-text').value = '';
    document.getElementById('custom-q-status').textContent = '✓ Вернули стандартный вопрос.';
    document.getElementById('custom-q-reset').hidden = true;
  });

  function buildEntryRows() {
    const body = document.getElementById('entry-body');
    body.innerHTML = '';
    data.forEach((row, i) => {
      const div = document.createElement('div');
      div.className = 'entry-row toggle-col';
      div.innerHTML = `
        <div class="name">${avatarName(row.name)}</div>
        <div class="toggle-pair" data-idx="${i}">
          <button type="button" data-val="yes" class="${row.own === 'yes' ? 'on' : ''}">Да</button>
          <button type="button" data-val="no" class="${row.own === 'no' ? 'on' : ''}">Нет</button>
        </div>
        <input type="number" min="0" max="100" inputmode="numeric" placeholder="0–100" data-idx="${i}" data-field="estimate" value="${row.estimate ?? ''}">
      `;
      body.appendChild(div);
    });
    Array.from(body.querySelectorAll('.toggle-pair button')).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const wrap = e.currentTarget.closest('.toggle-pair');
        const idx = +wrap.dataset.idx;
        const val = e.currentTarget.dataset.val;
        data[idx].own = val;
        Array.from(wrap.querySelectorAll('button')).forEach((b) => {
          b.classList.toggle('on', b.dataset.val === val);
        });
        updateFillProgress();
      });
    });
    Array.from(body.querySelectorAll('input')).forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const idx = +e.target.dataset.idx;
        let v = e.target.value === '' ? null : Number(e.target.value);
        if (v !== null) {
          if (v < 0) v = 0;
          if (v > 100) v = 100;
        }
        data[idx].estimate = v;
        updateFillProgress();
      });
    });
  }

  function updateFillProgress() {
    const filled = data.filter((d) => d.own !== null && d.estimate !== null).length;
    Screen.updateProgress('', filled, NAMES.length, 'show-results-btn', 2);
    if (hydrated) {
      Persist.save('false-consensus', {
        data: data,
        question: isCustomQuestion ? QUESTION : null,
      });
    }
  }

  window.fcGoTo = (screenIdx) => {
    Screen.goTo(screenIdx);
  };

  window.fcShowResults = () => {
    const filled = data.filter((d) => d.own !== null && d.estimate !== null);
    const yesCount = filled.filter((d) => d.own === 'yes').length;
    const realYesPct = Math.round((yesCount / filled.length) * 100);
    document.getElementById('real-yes').textContent = realYesPct + '%';

    const yesSide = filled.filter((d) => d.own === 'yes');
    const noSide = filled.filter((d) => d.own === 'no');
    const avg = (arr) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b.estimate, 0) / arr.length) : null;
    const yesAvg = avg(yesSide),
      noAvg = avg(noSide);

    document.getElementById('yes-side-avg').textContent = yesAvg === null ? '—' : yesAvg + '%';
    document.getElementById('no-side-avg').textContent = noAvg === null ? '—' : noAvg + '%';

    let compareText = `Реально ответили «да» ${realYesPct}% команды.`;
    if (yesAvg !== null && noAvg !== null) {
      compareText += ` Те, кто сам сказал «да», в среднем ожидали ${yesAvg}% согласных — те, кто сказал «нет», ожидали только ${noAvg}%. Каждая группа тянет прогноз в свою сторону.`;
    }
    document.getElementById('fc-compare-text').textContent = compareText;

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    filled.forEach((d) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${avatarName(d.name)}</td><td>${d.own === 'yes' ? 'Да' : 'Нет'}</td><td>${d.estimate}%</td>`;
      tbody.appendChild(tr);
    });

    Print.mount('print-header-false-consensus', {
      title: 'Ложный консенсус',
      subtitle: isCustomQuestion
        ? QUESTION
        : 'Мы уверены, что наше мнение разделяют куда больше людей, чем на самом деле.',
      meta: Print.meta(filled.length),
      explanation:
        'Мы систематически переоцениваем, насколько остальные разделяют наше собственное мнение или поведение — потому что единственная реальная точка отсчёта, которая у нас есть, это мы сами. Эффект описали психологи Ли Росс, Дэвид Грин и Памела Хаус в серии экспериментов в Стэнфорде в 1977 году.',
    });

    fcGoTo(2);
  };

  window.fcReset = () => {
    data = NAMES.map((n) => ({ name: n, own: null, estimate: null }));
    buildEntryRows();
    updateFillProgress();
    fcGoTo(0);
    Persist.clear('false-consensus');
  };

  buildEntryRows();
  updateFillProgress();
  hydrated = true;
}
