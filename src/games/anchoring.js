/* =========================================================
   GAME: Эффект якоря (anchoring)
========================================================= */
function renderAnchoringGame() {
  const NAMES = state.participants.slice();
  const TRUE_VALUE = 28;
  let data = NAMES.map((n) => ({ name: n, anchor: null, guess: null }));
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Эффект якоря</span>
      </div>
      <div class="progress">
        <div class="dot active" data-dot="0"></div>
        <div class="dot" data-dot="1"></div>
        <div class="dot" data-dot="2"></div>
        <div class="dot" data-dot="3"></div>
      </div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 5 минут</p>
        <h1>Быстрый эксперимент для команды</h1>
        <p class="lede">Три коротких шага. Что именно здесь проверяется — расскажем в самом конце, после того как увидим результат.</p>

        <div class="draft-mount" id="draft-mount-anchoring"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Каждый молча пишет число</b>
              <span>Не показывая соседям, запишите последние две цифры своего номера телефона — число от 00 до 99.</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Задайте вопрос вслух</b>
              <span>«Как думаете, доля стран Африки среди членов ООН больше или меньше числа, которое вы записали?» Каждый отвечает про себя.</span>
            </div>
          </li>
          <li>
            <div class="step-num">3</div>
            <div class="step-body">
              <b>Каждый пишет точную оценку</b>
              <span>Теперь — конкретный процент: какая, по-вашему, доля стран ООН находится в Африке? Готово, дальше вносим оба числа сюда.</span>
            </div>
          </li>
        </ol>

        <p class="note">Шаг 1 нужно сделать до того, как прозвучит вопрос в шаге 2 — не забегайте вперёд.</p>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="anchoringGoTo(1)">Вносить данные →</button>
        </div>
      </section>

      <section class="screen" id="screen-1">
        <p class="eyebrow">Сбор данных</p>
        <h2>Впишите числа каждого участника</h2>
        <p class="lede">Спросите по очереди: число из шага 1 и оценку из шага 3.</p>

        <div class="entry-head">
          <div>Участник</div>
          <div>Число (00–99)</div>
          <div>Оценка (%)</div>
        </div>
        <div id="entry-body"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count">0</span> из <span id="fill-total">${NAMES.length}</span>
          <div class="track"><div id="fill-bar" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="anchoringGoTo(0)">← Назад</button>
          <button class="primary" id="show-results-btn" onclick="anchoringShowResults()" disabled>Показать результаты →</button>
        </div>
      </section>

      <section class="screen" id="screen-2">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-anchoring"></div>


        <div class="reveal">
          <div class="n">28%</div>
          <p><b>Правильный ответ:</b> сейчас в ООН 193 страны-члена, 54 из них — африканские. 54 / 193 = 28%. Почти никто не угадывает точно — дело не в этом.</p>
        </div>

        <div class="chart-wrap">
          <svg id="scatter" viewBox="0 0 640 380" width="100%" style="display:block;"></svg>
          <div class="cap">По горизонтали — число из шага 1 у каждого человека (00–99), по вертикали — его оценка (%). Пунктир — правильный ответ, 28%.</div>
        </div>

        <div class="group-compare">
          <div class="g low">
            <div class="t">Число из шага 1 ниже 50</div>
            <div class="v" id="low-avg">—</div>
          </div>
          <div class="g high">
            <div class="t">Число из шага 1 — 50 и выше</div>
            <div class="v" id="high-avg">—</div>
          </div>
        </div>

        <p id="corr-text"></p>

        <table class="results-table" id="results-table">
          <thead><tr><th>Участник</th><th>Число</th><th>Оценка</th></tr></thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-anchoring"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>


        <div class="nav-row">
          <button class="ghost" onclick="anchoringGoTo(1)">← Назад</button>
          <button class="primary" onclick="anchoringGoTo(3)">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-3">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Эффект якоря</h1>
        <p class="lede">То, что вы только что сделали, — короткая версия одного из самых известных экспериментов в психологии решений.</p>

        <p>В 1974 году психологи Амос Тверски и Дэниел Канеман крутили перед испытуемыми колесо фортуны с числами от 0 до 100. Колесо было подстроено: оно всегда останавливалось либо на 10, либо на 65. После этого людей спрашивали, какая доля африканских стран среди членов ООН — больше или меньше выпавшего числа, а затем просили назвать точную оценку.</p>

        <p>Число на колесе было полностью случайным и не имело никакого отношения к вопросу. Но результат оказался таким:</p>

        <div class="stat-row">
          <div class="stat"><div class="n">25%</div><div class="lab">средняя оценка у тех, кто увидел число 10</div></div>
          <div class="stat"><div class="n">45%</div><div class="lab">средняя оценка у тех, кто увидел число 65</div></div>
        </div>

        <p>Бессмысленное число со случайного колеса сдвинуло оценки почти на 20 процентных пунктов. Люди неосознанно «цеплялись» за первое увиденное число и потом недостаточно от него отходили — этот эффект назвали <b>якорением</b>. Ваш номер телефона в шаге 1 сыграл ровно ту же роль, что и колесо фортуны — только на этот раз якорь принесли вы сами. Работа легла в основу поведенческой экономики, а в 2002 году Канеман получил за неё Нобелевскую премию по экономике.</p>

        <p><b>Как это работает внутри головы.</b> Оценивая неизвестную величину, мозг редко считает «с нуля». Вместо этого он берёт первое число, которое оказалось у него под рукой — даже если оно случайное и логически ни с чем не связано — и начинает <i>подстраивать</i> ответ от этой точки. Проблема в том, что подстройка почти всегда недостаточна: мы останавливаемся слишком рано, как только ответ начинает казаться «правдоподобным», а не когда он становится точным. Это происходит быстро и неосознанно — тем самым автоматическим режимом мышления, который Канеман в книге «Thinking, Fast and Slow» назвал Системой 1, в отличие от медленной аналитической Системы 2.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>Эффект не пропадает, даже если платить за точность</b><span>В оригинальном опыте участникам предлагали вознаграждение за правильный ответ — якорение всё равно сохранялось почти в той же силе.</span></div>
        <div class="fact"><b>Дэн Ариели пошёл дальше — номер соцстрахования и аукцион</b><span>Людей просили записать две последние цифры номера соцстрахования, а затем сделать ставку на вино и шоколад на аукционе. У кого цифры были больше — в среднем ставили на 60–120% больше денег за один и тот же товар (Ariely, Loewenstein, Prelec, 2003).</span></div>
        <div class="fact"><b>Риелторы тоже подвержены эффекту</b><span>Даже профессиональные оценщики недвижимости завышают оценку дома, если им заранее показать более высокую цену листинга — при том, что сами знают: цена произвольная.</span></div>
        <div class="fact"><b>Даже судьи не защищены</b><span>В эксперименте Englich, Mussweiler и Strack (2006) опытным немецким судьям перед вынесением приговора предлагали бросить игральные кости. Кости были подстроены на маленькое или большое число — и судьи с высоким броском давали в среднем заметно более суровые сроки за одно и то же преступление, хотя прекрасно понимали, что кости никак не связаны с делом.</span></div>
        <div class="fact"><b>На этом строится вся «цена со скидкой»</b><span>Зачёркнутая старая цена рядом с новой — классический якорь: сама скидка может быть скромной, но контраст с высоким «было» заставляет новую цену казаться настоящей находкой.</span></div>
        <div class="fact"><b>А у вас это тоже есть — в Planning Poker</b><span>Если кто-то в комнате первым называет «на глаз пять сторипоинтов», оценка всей команды потом гравитирует к этому числу — даже если оно взято с потолка. Стоит обсудить на ретро, бывало ли у вас такое.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="anchoringReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('anchoring');

  Persist.offerRestore(
    'anchoring',
    'draft-mount-anchoring',
    (p) => Array.isArray(p.data) && p.data.length === NAMES.length,
    (p) => {
      data = p.data;
      buildEntryRows();
      updateFillProgress();
      anchoringGoTo(1);
    },
  );

  function buildEntryRows() {
    const body = document.getElementById('entry-body');
    body.innerHTML = '';
    data.forEach((row, i) => {
      const div = document.createElement('div');
      div.className = 'entry-row';
      div.innerHTML = `
        <div class="name">${avatarName(row.name)}</div>
        <input type="number" min="0" max="99" inputmode="numeric" placeholder="напр. 42" data-idx="${i}" data-field="anchor" value="${row.anchor ?? ''}">
        <input type="number" min="0" max="100" inputmode="numeric" placeholder="напр. 30" data-idx="${i}" data-field="guess" value="${row.guess ?? ''}">
      `;
      body.appendChild(div);
    });
    Array.from(body.querySelectorAll('input')).forEach((inp) => {
      inp.addEventListener('input', onEntryInput);
    });
  }

  function onEntryInput(e) {
    const idx = +e.target.dataset.idx;
    const field = e.target.dataset.field;
    let v = e.target.value === '' ? null : Number(e.target.value);
    if (v !== null) {
      const max = field === 'anchor' ? 99 : 100;
      if (v > max) v = max;
      if (v < 0) v = 0;
    }
    data[idx][field] = v;
    updateFillProgress();
  }

  function updateFillProgress() {
    const filled = data.filter((d) => d.anchor !== null && d.guess !== null).length;
    Screen.updateProgress('', filled, NAMES.length, 'show-results-btn', 2);
    if (hydrated) {
      Persist.save('anchoring', { data: data });
    }
  }

  window.anchoringGoTo = (screenIdx) => {
    Screen.goTo(screenIdx);
  };

  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0,
      dx2 = 0,
      dy2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx,
        dy = ys[i] - my;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    if (dx2 === 0 || dy2 === 0) return null;
    return num / Math.sqrt(dx2 * dy2);
  }

  function corrLabel(r) {
    if (r === null) return 'Недостаточно данных для оценки связи — впишите хотя бы пары значений.';
    const abs = Math.abs(r);
    let strength;
    if (abs < 0.1) strength = 'почти нет связи';
    else if (abs < 0.3) strength = 'слабая связь';
    else if (abs < 0.5) strength = 'умеренная связь';
    else if (abs < 0.7) strength = 'заметная связь';
    else strength = 'сильная связь';
    const dir = r >= 0 ? 'положительная' : 'отрицательная';
    return `Коэффициент корреляции между числом из шага 1 и оценкой: r = ${r.toFixed(2)} — ${dir}, ${strength}. Это число никак не связано с ООН — но, скорее всего, связь всё равно есть.`;
  }

  function drawScatter(points) {
    const svg = document.getElementById('scatter');
    svg.innerHTML = '';
    const W = 640,
      H = 380,
      ML = 46,
      MB = 40,
      MT = 16,
      MR = 16;
    const plotW = W - ML - MR,
      plotH = H - MT - MB;
    const xMax = 100,
      yMax = 100;

    function ns(tag, attrs) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }

    svg.appendChild(
      ns('line', {
        x1: ML,
        y1: MT,
        x2: ML,
        y2: MT + plotH,
        stroke: '#1E2A32',
        'stroke-width': 1.2,
      }),
    );
    svg.appendChild(
      ns('line', {
        x1: ML,
        y1: MT + plotH,
        x2: ML + plotW,
        y2: MT + plotH,
        stroke: '#1E2A32',
        'stroke-width': 1.2,
      }),
    );

    [0, 25, 50, 75, 100].forEach((t) => {
      const x = ML + (t / xMax) * plotW;
      const y = MT + plotH - (t / yMax) * plotH;
      svg.appendChild(
        ns('line', {
          x1: x,
          y1: MT + plotH,
          x2: x,
          y2: MT + plotH + 5,
          stroke: '#4B5B63',
          'stroke-width': 1,
        }),
      );
      const lx = ns('text', {
        x: x,
        y: MT + plotH + 18,
        'font-size': 11,
        'font-family': 'IBM Plex Mono, monospace',
        fill: '#4B5B63',
        'text-anchor': 'middle',
      });
      lx.textContent = t;
      svg.appendChild(lx);
      svg.appendChild(
        ns('line', { x1: ML - 5, y1: y, x2: ML, y2: y, stroke: '#4B5B63', 'stroke-width': 1 }),
      );
      const ly = ns('text', {
        x: ML - 10,
        y: y + 4,
        'font-size': 11,
        'font-family': 'IBM Plex Mono, monospace',
        fill: '#4B5B63',
        'text-anchor': 'end',
      });
      ly.textContent = t;
      svg.appendChild(ly);
    });

    const axx = ns('text', {
      x: ML + plotW / 2,
      y: H - 4,
      'font-size': 12,
      'font-family': 'IBM Plex Mono, monospace',
      fill: '#1E2A32',
      'text-anchor': 'middle',
    });
    axx.textContent = 'ЧИСЛО ИЗ ШАГА 1';
    svg.appendChild(axx);
    const axy = ns('text', {
      x: 14,
      y: MT + plotH / 2,
      'font-size': 12,
      'font-family': 'IBM Plex Mono, monospace',
      fill: '#1E2A32',
      'text-anchor': 'middle',
      transform: `rotate(-90 14 ${MT + plotH / 2})`,
    });
    axy.textContent = 'ОЦЕНКА';
    svg.appendChild(axy);

    const ty = MT + plotH - (TRUE_VALUE / yMax) * plotH;
    svg.appendChild(
      ns('line', {
        x1: ML,
        y1: ty,
        x2: ML + plotW,
        y2: ty,
        stroke: '#B5502E',
        'stroke-width': 1.5,
        'stroke-dasharray': '5,4',
      }),
    );
    const tl = ns('text', {
      x: ML + plotW - 4,
      y: ty - 6,
      'font-size': 11,
      'font-family': 'IBM Plex Mono, monospace',
      fill: '#B5502E',
      'text-anchor': 'end',
    });
    tl.textContent = '28% — правильный ответ';
    svg.appendChild(tl);

    points.forEach((p) => {
      const x = ML + (p.anchor / xMax) * plotW;
      const y = MT + plotH - (p.guess / yMax) * plotH;
      const c = ns('circle', {
        cx: x,
        cy: y,
        r: 6,
        fill: '#3E6E64',
        'fill-opacity': 0.85,
        stroke: '#F5F3EC',
        'stroke-width': 1.5,
      });
      svg.appendChild(c);
      const t = ns('text', {
        x: x,
        y: y - 10,
        'font-size': 10.5,
        'font-family': 'IBM Plex Sans, sans-serif',
        fill: '#1E2A32',
        'text-anchor': 'middle',
      });
      t.textContent = p.name;
      svg.appendChild(t);
      ChartTip.attachToPoint(
        svg,
        ns,
        x,
        y,
        () =>
          `<b>${p.name}</b><span class="tip-row"><span>Число из шага 1</span><span>${p.anchor}</span></span><span class="tip-row"><span>Оценка</span><span>${p.guess}%</span></span>`,
      );
    });
  }

  window.anchoringShowResults = () => {
    const filled = data.filter((d) => d.anchor !== null && d.guess !== null);
    drawScatter(filled);

    const xs = filled.map((d) => d.anchor),
      ys = filled.map((d) => d.guess);
    const r = pearson(xs, ys);
    document.getElementById('corr-text').textContent = corrLabel(r);

    const low = filled.filter((d) => d.anchor < 50);
    const high = filled.filter((d) => d.anchor >= 50);
    const avg = (arr) =>
      arr.length ? (arr.reduce((a, b) => a + b.guess, 0) / arr.length).toFixed(0) + '%' : '—';
    document.getElementById('low-avg').textContent = avg(low);
    document.getElementById('high-avg').textContent = avg(high);

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    filled.forEach((d) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${avatarName(d.name)}</td><td>${d.anchor}</td><td>${d.guess}%</td>`;
      tbody.appendChild(tr);
    });

    Print.mount('print-header-anchoring', {
      title: 'Эффект якоря',
      subtitle: 'Случайное число незаметно сдвигает вашу же числовую оценку.',
      meta: Print.meta(filled.length),
      explanation:
        'Случайное число, увиденное прямо перед оценкой, задаёт «якорь» — и итоговый ответ смещается в его сторону, даже когда число совершенно нерелевантно вопросу. Эффект открыли Амос Тверски и Дэниел Канеман в 1974 году; за работы по поведенческой экономике Канеман получил Нобелевскую премию в 2002 году.',
    });

    anchoringGoTo(2);
  };

  window.anchoringReset = () => {
    data = NAMES.map((n) => ({ name: n, anchor: null, guess: null }));
    buildEntryRows();
    updateFillProgress();
    anchoringGoTo(0);
    Persist.clear('anchoring');
  };

  buildEntryRows();
  updateFillProgress();
  hydrated = true;
}
