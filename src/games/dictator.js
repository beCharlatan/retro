/* =========================================================
   GAME: Игра диктатора (dictator)
   Two rounds instead of one: round 1 is fully anonymous (as
   before), round 2 tells people their name will be attached
   to the decision — directly testing the "observability
   changes generosity" finding instead of just describing it
   in the facts afterwards. Same pool of people both times, no
   pairing needed — this is the simplest game to extend with a
   second data point per person.
========================================================= */
function renderDictatorGame(){
  const NAMES = state.participants.slice();
  const POT = 1000;
  let data = NAMES.map(n => ({ name:n, r1:null, r2:null }));
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Игра диктатора</span>
      </div>
      <div class="progress">${Roles.dotsHTML(5, 0)}</div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 7 минут</p>
        <h1>Быстрое решение про деньги — дважды</h1>
        <p class="lede">Два раунда с одним и тем же выбором. Меняется только одна деталь — а вместе с ней, скорее всего, и суммы.</p>

        <div class="draft-mount" id="draft-mount-dictator"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Раунд 1 — решение анонимное</b>
              <span>«Вам дали ${POT} ₽. Можно оставить их себе полностью или поделиться любой частью с анонимным коллегой из другой команды. Никто не узнает, кто сколько отдал».</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Раунд 2 — та же сумма, но вас увидят</b>
              <span>Теперь коллега узнает, кто именно принял решение — ваше имя будет рядом с суммой. Решайте заново, как будто это происходит на самом деле.</span>
            </div>
          </li>
        </ol>

        <p class="note">Отвечайте на первый раунд, ещё не зная формулировки второго — не забегайте вперёд.</p>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="dictGoTo(1)">Раунд 1 →</button>
        </div>
      </section>

      <section class="screen" id="screen-1">
        <p class="eyebrow">Раунд 1 из 2 · Анонимно</p>
        <h2>Сколько каждый отдал — не зная, что решат остальные</h2>
        <p class="lede">Никто не узнает, кто сколько написал.</p>

        <div class="entry-head two-col">
          <div>Участник</div>
          <div>Отдал, ₽</div>
        </div>
        <div id="entry-body-1"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count-1">0</span> из <span id="fill-total-1">${NAMES.length}</span>
          <div class="track"><div id="fill-bar-1" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="dictGoTo(0)">← Назад</button>
          <button class="primary" id="next-btn-1" onclick="dictGoTo(2)" disabled>Раунд 2 →</button>
        </div>
      </section>

      <section class="screen" id="screen-2">
        <p class="eyebrow">Раунд 2 из 2 · Вас увидят</p>
        <h2>То же решение, но уже не анонимно</h2>
        <p class="lede">Коллега узнает, кто именно принял это решение.</p>

        <div class="entry-head two-col">
          <div>Участник</div>
          <div>Отдал, ₽</div>
        </div>
        <div id="entry-body-2"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count-2">0</span> из <span id="fill-total-2">${NAMES.length}</span>
          <div class="track"><div id="fill-bar-2" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="dictGoTo(1)">← Назад</button>
          <button class="primary" id="next-btn-2" onclick="dictShowResults()" disabled>Показать результаты →</button>
        </div>
      </section>

      <section class="screen" id="screen-3">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-dictator"></div>

        <div class="reveal">
          <div class="n" id="delta-share">—</div>
          <p><b>Насколько изменилась средняя сумма</b>, когда решение перестало быть анонимным — раунд 2 минус раунд 1.</p>
        </div>

        <div class="group-compare">
          <div class="g low">
            <div class="t">Раунд 1 · анонимно, в среднем</div>
            <div class="v" id="avg-r1">—</div>
          </div>
          <div class="g high">
            <div class="t">Раунд 2 · не анонимно, в среднем</div>
            <div class="v" id="avg-r2">—</div>
          </div>
        </div>

        <div class="chart-wrap">
          <svg id="dict-chart" viewBox="0 0 640 220" width="100%" style="display:block;"></svg>
          <div class="cap">Шалфейные точки — раунд 1 (анонимно), рыжие — раунд 2 (не анонимно). Каждая пара точек — один человек.</div>
        </div>

        <table class="results-table" id="results-table">
          <thead><tr><th>Участник</th><th>Раунд 1</th><th>Раунд 2</th><th>Изменение</th></tr></thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-dictator"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="dictGoTo(2)">← Назад</button>
          <button class="primary" onclick="dictGoTo(4)">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-4">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Игра диктатора</h1>
        <p class="lede">Классическая экономическая теория предсказывает: рациональный и эгоистичный человек отдаст 0. В реальности почти никто так не делает — а стоит убрать анонимность, отдают ещё больше.</p>

        <p>«Игра диктатора» — упрощённая версия «Ультиматума»: один человек единолично решает, как разделить сумму, а второй участник вообще не может ни отказаться, ни как-либо повлиять на решение. Дизайн намеренно «очищает» эксперимент от стратегии и страха отказа — остаётся только чистая готовность делиться, когда экономически выгоднее не делиться вовсе.</p>

        <p>Дизайн формализован в статье Forsythe R., Horowitz J., Savin N., Sefton M. (1994). Fairness in Simple Bargaining Experiments. <i>Games and Economic Behavior</i> — как «очищенный» тест альтруизма, отделённый от переговорной стратегии игры «Ультиматум».</p>

        <div class="stat-row">
          <div class="stat"><div class="n">20–30%</div><div class="lab">типичная доля, которую отдают анонимно в мета-анализах</div></div>
          <div class="stat"><div class="n">↑</div><div class="lab">сумма обычно растёт, когда решение становится видимым</div></div>
        </div>

        <p><b>Зачем нужен именно второй раунд.</b> Первый раунд «очищен» от давления чужого мнения — это чистая базовая щедрость. Второй раунд специально возвращает то самое социальное давление: теперь решение видно, а значит, включается забота о репутации. Разница между раундами — это, по сути, размер эффекта «наблюдаемости»: сколько щедрости в нас добавляет не мораль, а желание хорошо выглядеть в чужих глазах. Оба мотива реальны и оба человеческие — игра просто разводит их по разным раундам, чтобы увидеть каждый по отдельности.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>Анонимность сильно меняет результат</b><span>Вы только что могли увидеть это на своей же команде: если участники думают, что кто-то увидит их решение, сумма, которую они отдают, заметно растёт — щедрость во многом зависит от «наблюдаемости», а не только от внутренних убеждений.</span></div>
        <div class="fact"><b>50/50 — устойчивая «фокальная точка»</b><span>Заметная доля людей делит сумму ровно пополам — не потому что посчитали оптимальную стратегию, а потому что «поровну» интуитивно ощущается как самый безопасный, самый честный вариант.</span></div>
        <div class="fact"><b>Результат зависит от того, кто на другом конце</b><span>Люди отдают заметно меньше, если получателем назначают благотворительный фонд с плохой репутацией, и заметно больше — если получателя описывают как «такого же участника эксперимента, как и вы».</span></div>
        <div class="fact"><b>Даже дети делятся не из выгоды</b><span>Похожие опыты с детьми 3–7 лет (Fehr, Bernhard, Rockenbach, 2008) показывают, что готовность делиться с незнакомцем без всякой возможности наказания появляется рано и растёт с возрастом — просоциальное поведение формируется до того, как ребёнок способен просчитывать стратегию.</span></div>
        <div class="fact"><b>Возраст и культура смещают щедрость по-разному</b><span>В кросс-культурных повторах итоговая доля «отдал больше нуля» и средний размер пожертвования заметно различаются между странами — единого «естественного» уровня альтруизма не существует, он формируется социальной средой.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="dictReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('dictator');

  Persist.offerRestore('dictator', 'draft-mount-dictator',
    (p) => Array.isArray(p.data) && p.data.length === NAMES.length,
    (p) => {
      data = p.data;
      buildEntryRows(1);
      buildEntryRows(2);
      updateFillProgress(1);
      updateFillProgress(2);
      dictGoTo(1);
    });

  function buildEntryRows(round){
    const body = document.getElementById('entry-body-' + round);
    body.innerHTML = '';
    const field = round === 1 ? 'r1' : 'r2';
    data.forEach((row, i) => {
      const div = document.createElement('div');
      div.className = 'entry-row two-col';
      div.innerHTML = `
        <div class="name">${avatarName(row.name)}</div>
        <input type="number" min="0" max="${POT}" inputmode="numeric" placeholder="0–${POT}" data-idx="${i}" data-round="${round}" value="${row[field] ?? ''}">
      `;
      body.appendChild(div);
    });
    Array.from(body.querySelectorAll('input')).forEach(inp=>{
      inp.addEventListener('input', onEntryInput);
    });
  }

  function onEntryInput(e){
    const idx = +e.target.dataset.idx;
    const round = +e.target.dataset.round;
    const field = round === 1 ? 'r1' : 'r2';
    let v = e.target.value === '' ? null : Number(e.target.value);
    if(v !== null){ if(v<0) v=0; if(v>POT) v=POT; }
    data[idx][field] = v;
    updateFillProgress(round);
  }

  function updateFillProgress(round){
    const field = round === 1 ? 'r1' : 'r2';
    const filled = data.filter(d => d[field] !== null).length;
    Screen.updateProgress('-' + round, filled, NAMES.length, 'next-btn-' + round, 2);
    if(hydrated){ Persist.save('dictator', { data: data }); }
  }

  window.dictGoTo = function(screenIdx){
    Screen.goTo(screenIdx);
  };

  function drawChart(filled){
    const svg = document.getElementById('dict-chart');
    svg.innerHTML = '';
    const W=640,H=220, ML=20, MR=20, MT=30, MB=36;
    const plotW = W-ML-MR;

    function xOf(v){ return ML + (v/POT) * plotW; }
    function ns(tag, attrs){
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for(const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }

    svg.appendChild(ns('line',{x1:ML,y1:H-MB,x2:ML+plotW,y2:H-MB,stroke:'#1E2A32','stroke-width':1.2}));
    [0,250,500,750,1000].forEach(v=>{
      const x = xOf(v);
      svg.appendChild(ns('line',{x1:x,y1:H-MB,x2:x,y2:H-MB+5,stroke:'#4B5B63','stroke-width':1}));
      const lx = ns('text',{x:x,y:H-MB+18,'font-size':10.5,'font-family':'IBM Plex Mono, monospace',fill:'#4B5B63','text-anchor':'middle'});
      lx.textContent = v; svg.appendChild(lx);
    });

    const halfX = xOf(POT/2);
    svg.appendChild(ns('line',{x1:halfX,y1:MT,x2:halfX,y2:H-MB,stroke:'#9A7B3F','stroke-width':1.5,'stroke-dasharray':'5,4'}));
    const halfLabel = ns('text',{x:halfX,y:MT-8,'font-size':10.5,'font-family':'IBM Plex Mono, monospace',fill:'#9A7B3F','text-anchor':'middle'});
    halfLabel.textContent = 'поровну'; svg.appendChild(halfLabel);

    const rowH = 16;
    filled.forEach((p,i)=>{
      const y1 = H-MB-14-((i%6)*rowH);
      const y2 = y1 - 8;
      const c1 = ns('circle',{cx:xOf(p.r1),cy:y1,r:5,fill:'#3E6E64','fill-opacity':0.85,stroke:'#F5F3EC','stroke-width':1.2});
      svg.appendChild(c1);
      ChartTip.attachToPoint(svg, ns, xOf(p.r1), y1, () => `<b>${p.name}</b><span class="tip-row"><span>Раунд 1 · анонимно</span><span>${p.r1} ₽</span></span>`, 8);
      const c2 = ns('circle',{cx:xOf(p.r2),cy:y2,r:5,fill:'#A8482A','fill-opacity':0.85,stroke:'#F5F3EC','stroke-width':1.2});
      svg.appendChild(c2);
      ChartTip.attachToPoint(svg, ns, xOf(p.r2), y2, () => `<b>${p.name}</b><span class="tip-row"><span>Раунд 2 · не анонимно</span><span>${p.r2} ₽</span></span>`, 8);
    });
  }

  window.dictShowResults = function(){
    const filled = data.filter(d => d.r1 !== null && d.r2 !== null);
    const avgR1 = filled.reduce((a,b)=>a+b.r1,0)/filled.length;
    const avgR2 = filled.reduce((a,b)=>a+b.r2,0)/filled.length;
    const delta = avgR2 - avgR1;

    document.getElementById('delta-share').textContent = (delta>=0?'+':'') + Math.round(delta) + ' ₽';
    document.getElementById('avg-r1').textContent = Math.round(avgR1) + ' ₽';
    document.getElementById('avg-r2').textContent = Math.round(avgR2) + ' ₽';

    drawChart(filled);

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    filled.forEach(d=>{
      const diff = d.r2 - d.r1;
      const diffText = (diff>=0?'+':'') + diff + ' ₽';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${avatarName(d.name)}</td><td>${d.r1} ₽</td><td>${d.r2} ₽</td><td>${diffText}</td>`;
      tbody.appendChild(tr);
    });

    Print.mount('print-header-dictator', {
      title: 'Игра диктатора',
      subtitle: 'Никто не заставляет делиться — но почти все делятся, и ещё больше, если их видят.',
      meta: Print.meta(filled.length, '2 раунда'),
      explanation: 'Классическая экономическая теория предсказывает, что рациональный и эгоистичный человек отдаст 0 — в реальности почти никто так не делает, а стоит убрать анонимность, отдают ещё больше. Дизайн формализован в статье Forsythe, Horowitz, Savin, Sefton (1994) как «очищенный» от переговорной стратегии тест альтруизма.'
    });

    dictGoTo(3);
  };

  window.dictReset = function(){
    data = NAMES.map(n => ({ name:n, r1:null, r2:null }));
    buildEntryRows(1);
    buildEntryRows(2);
    updateFillProgress(1);
    updateFillProgress(2);
    dictGoTo(0);
    Persist.clear('dictator');
  };

  buildEntryRows(1);
  buildEntryRows(2);
  updateFillProgress(1);
  updateFillProgress(2);
  hydrated = true;
}
