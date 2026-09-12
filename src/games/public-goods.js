/* =========================================================
   GAME: Общественное благо (public-goods)
   Two rounds instead of one: same pool, same rules, fresh
   100 фишек each time. Classic finding in the literature is
   that contributions decline when the exact same group plays
   more than once — round 2 lets the team test that directly
   on themselves instead of just reading about it in the facts.
========================================================= */

import { Persist } from '../persist.js';
import { Print } from '../print.js';
import { Roles } from '../roles.js';
import { Screen } from '../screen.js';
import { app, avatarName, state } from '../state.js';

export function renderPublicGoodsGame() {
  const NAMES = state.participants.slice();
  const STAKE = 100;
  let data = NAMES.map((n) => ({ name: n, r1: null, r2: null }));
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Общественное благо</span>
      </div>
      <div class="progress">${Roles.dotsHTML(5, 0)}</div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 10 минут</p>
        <h1>Общий котёл — дважды подряд</h1>
        <p class="lede">Два раунда с одной и той же группой. Правила не меняются — интересно как раз то, изменится ли поведение.</p>

        <div class="draft-mount" id="draft-mount-public-goods"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Прочитайте вслух правила</b>
              <span>«У каждого есть ${STAKE} фишек. Можно вложить любую часть в общий котёл — остальное останется себе. Сумма всех вкладов удвоится и разделится поровну между ВСЕМИ участниками, независимо от того, кто сколько вложил».</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Сыграйте два раунда подряд</b>
              <span>В каждом раунде — заново ${STAKE} фишек и тот же общий котёл с теми же людьми. Решайте оба раза независимо, не оглядываясь на то, что писали в первый раз.</span>
            </div>
          </li>
        </ol>

        <p class="note">Решение анонимное и ни на что не влияет по-настоящему — но отвечайте так, будто фишки настоящие.</p>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="pgGoTo(1)">Раунд 1 →</button>
        </div>
      </section>

      <section class="screen" id="screen-1">
        <p class="eyebrow">Раунд 1 из 2</p>
        <h2>Впишите вклад каждого участника</h2>
        <p class="lede">Сколько из ${STAKE} фишек каждый вложил в общий котёл.</p>

        <div class="entry-head two-col">
          <div>Участник</div>
          <div>Вклад (0–${STAKE})</div>
        </div>
        <div id="entry-body-1"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count-1">0</span> из <span id="fill-total-1">${NAMES.length}</span>
          <div class="track"><div id="fill-bar-1" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="pgGoTo(0)">← Назад</button>
          <button class="primary" id="next-btn-1" onclick="pgGoTo(2)" disabled>Раунд 2 →</button>
        </div>
      </section>

      <section class="screen" id="screen-2">
        <p class="eyebrow">Раунд 2 из 2</p>
        <h2>Снова ${STAKE} фишек, тот же котёл</h2>
        <p class="lede">Те же правила, новая попытка — с теми же людьми.</p>

        <div class="entry-head two-col">
          <div>Участник</div>
          <div>Вклад (0–${STAKE})</div>
        </div>
        <div id="entry-body-2"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count-2">0</span> из <span id="fill-total-2">${NAMES.length}</span>
          <div class="track"><div id="fill-bar-2" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="pgGoTo(1)">← Назад</button>
          <button class="primary" id="next-btn-2" onclick="pgShowResults()" disabled>Показать результаты →</button>
        </div>
      </section>

      <section class="screen" id="screen-3">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-public-goods"></div>

        <div class="reveal">
          <div class="n" id="delta-contrib">—</div>
          <p><b>Насколько изменился средний вклад</b> между раундами — раунд 2 минус раунд 1, в фишках.</p>
        </div>

        <div class="group-compare">
          <div class="g low">
            <div class="t">Раунд 1 · средний вклад</div>
            <div class="v" id="avg-r1">—</div>
          </div>
          <div class="g high">
            <div class="t">Раунд 2 · средний вклад</div>
            <div class="v" id="avg-r2">—</div>
          </div>
        </div>

        <div class="stat-row">
          <div class="stat"><div class="n" id="payoff-r1">—</div><div class="lab">общая выгода группы, раунд 1</div></div>
          <div class="stat"><div class="n" id="payoff-r2">—</div><div class="lab">общая выгода группы, раунд 2</div></div>
        </div>

        <table class="results-table" id="results-table">
          <thead><tr><th>Участник</th><th>Раунд 1</th><th>Раунд 2</th><th>Изменение</th></tr></thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-public-goods"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="pgGoTo(2)">← Назад</button>
          <button class="primary" onclick="pgGoTo(4)">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-4">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Общественное благо</h1>
        <p class="lede">Группе выгоднее, если все вкладываются в общий котёл — но каждому по отдельности выгоднее не вкладываться, а пользоваться вкладом остальных.</p>

        <p>Это классическая иллюстрация «проблемы безбилетника» (free-rider problem). Ваш собственный вклад приносит вам обратно лишь часть от удвоенной доли — то есть вкладывать невыгодно лично вам, даже если это выгодно группе в целом. Рациональная с точки зрения группы стратегия («вложить всё») и рациональная с точки зрения отдельного игрока стратегия («вложить 0») прямо противоречат друг другу.</p>

        <p>Один из первых систематических экспериментов — Marwell G., Ames R. E. (1979). Experiments on the Provision of Public Goods. <i>American Journal of Sociology</i>. В статье было ироничное подназвание «...does anyone else?» — единственной группой в их выборке, которая вела себя близко к модели «рационального эгоиста», оказались студенты экономических факультетов.</p>

        <p><b>Почему математика тянет в разные стороны.</b> Каждый рубль, который вы оставляете себе, достаётся вам полностью. Каждый рубль, который вы вкладываете в котёл, удваивается — но делится на всех поровну, а значит, лично вам от него возвращается меньше рубля (если участников больше двух). Получается, что с точки зрения личной выгоды вкладывать невыгодно <i>вообще всегда</i>, независимо от того, что делают остальные. Но если разные люди задумываются об этом одинаково и все выбирают «не вкладывать», проигрывают все сразу — общий пирог получается меньше, чем мог бы быть.</p>

        <p><b>Зачем нужен именно второй раунд.</b> В однораундовой версии легко списать щедрость на растерянность или желание «сыграть по-честному с первого раза». Второй раунд с теми же людьми убирает эту неопределённость: теперь у каждого уже есть опыт первого раунда за плечами. Если вклад упал — это, скорее всего, разочарование или недоверие к чужой щедрости. Если вклад вырос или остался прежним — это уже не случайность, а устойчивая склонность к сотрудничеству именно в этой группе.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>При повторении игры вклады обычно падают</b><span>Это именно то, что вы, возможно, только что проверили на своей команде: если сыграть несколько раундов подряд с одной и той же группой, средний вклад со временем снижается — даже у тех, кто начинал щедро, доверие постепенно иссякает.</span></div>
        <div class="fact"><b>Спор «яйца или курица» с экономическим образованием</b><span>Устойчивый результат в литературе: студенты-экономисты вкладывают в общий котёл заметно меньше, чем студенты других специальностей. Открытый вопрос — учат ли на экономфаке эгоизму, или эгоистичные люди чаще выбирают экономику.</span></div>
        <div class="fact"><b>Наказание возвращает кооперацию</b><span>Fehr и Gächter (2002) показали: если участникам дать возможность платить небольшую сумму, чтобы штрафовать тех, кто вкладывает мало, средний вклад в группе резко и устойчиво растёт — люди готовы наказывать «безбилетников» даже себе в убыток.</span></div>
        <div class="fact"><b>Это модель климата и рыболовства в миниатюре</b><span>Экономисты используют ровно эту логику для описания «трагедии общин» — от чрезмерного вылова рыбы в общих водах до выбросов CO₂: индивидуально выгодно продолжать как прежде, а коллективно это разрушает ресурс для всех.</span></div>
        <div class="fact"><b>Прямая рабочая параллель</b><span>Документация, код-ревью, помощь новичкам — тоже «общий котёл»: каждому по отдельности выгоднее переложить это на других, но если так решат все — хуже будет всей команде.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="pgReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('public-goods');

  Persist.offerRestore(
    'public-goods',
    'draft-mount-public-goods',
    (p) => Array.isArray(p.data) && p.data.length === NAMES.length,
    (p) => {
      data = p.data;
      buildEntryRows(1);
      buildEntryRows(2);
      updateFillProgress(1);
      updateFillProgress(2);
      pgGoTo(1);
    },
  );

  function buildEntryRows(round) {
    const body = document.getElementById('entry-body-' + round);
    body.innerHTML = '';
    const field = round === 1 ? 'r1' : 'r2';
    data.forEach((row, i) => {
      const div = document.createElement('div');
      div.className = 'entry-row two-col';
      div.innerHTML = `
        <div class="name">${avatarName(row.name)}</div>
        <input type="number" min="0" max="${STAKE}" inputmode="numeric" placeholder="0–${STAKE}" data-idx="${i}" data-round="${round}" value="${row[field] ?? ''}">
      `;
      body.appendChild(div);
    });
    Array.from(body.querySelectorAll('input')).forEach((inp) => {
      inp.addEventListener('input', onEntryInput);
    });
  }

  function onEntryInput(e) {
    const idx = +e.target.dataset.idx;
    const round = +e.target.dataset.round;
    const field = round === 1 ? 'r1' : 'r2';
    let v = e.target.value === '' ? null : Number(e.target.value);
    if (v !== null) {
      if (v < 0) v = 0;
      if (v > STAKE) v = STAKE;
    }
    data[idx][field] = v;
    updateFillProgress(round);
  }

  function updateFillProgress(round) {
    const field = round === 1 ? 'r1' : 'r2';
    const filled = data.filter((d) => d[field] !== null).length;
    Screen.updateProgress('-' + round, filled, NAMES.length, 'next-btn-' + round, 2);
    if (hydrated) {
      Persist.save('public-goods', { data: data });
    }
  }

  window.pgGoTo = (screenIdx) => {
    Screen.goTo(screenIdx);
  };

  function roundStats(filled, field) {
    const n = filled.length;
    const sumContrib = filled.reduce((a, b) => a + b[field], 0);
    const pot = sumContrib * 2;
    const totalPayoff = Math.round(n * STAKE - sumContrib + pot);
    const avg = sumContrib / n;
    return { avg, totalPayoff };
  }

  window.pgShowResults = () => {
    const filled = data.filter((d) => d.r1 !== null && d.r2 !== null);
    const s1 = roundStats(filled, 'r1');
    const s2 = roundStats(filled, 'r2');
    const delta = s2.avg - s1.avg;

    document.getElementById('delta-contrib').textContent =
      (delta >= 0 ? '+' : '') + delta.toFixed(1);
    document.getElementById('avg-r1').textContent = s1.avg.toFixed(1);
    document.getElementById('avg-r2').textContent = s2.avg.toFixed(1);
    document.getElementById('payoff-r1').textContent = s1.totalPayoff;
    document.getElementById('payoff-r2').textContent = s2.totalPayoff;

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    filled.forEach((d) => {
      const diff = d.r2 - d.r1;
      const diffText = (diff >= 0 ? '+' : '') + diff;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${avatarName(d.name)}</td><td>${d.r1}</td><td>${d.r2}</td><td>${diffText}</td>`;
      tbody.appendChild(tr);
    });

    Print.mount('print-header-public-goods', {
      title: 'Общественное благо',
      subtitle:
        'Группе выгодно вкладываться всем — каждому по отдельности выгоднее не вкладываться.',
      meta: Print.meta(filled.length, '2 раунда'),
      explanation:
        'Группе выгодно, если вкладываются все, но каждому по отдельности выгоднее не вкладываться, а пользоваться чужим вкладом — классическая «проблема безбилетника». Один из первых систематических экспериментов — Marwell G., Ames R. (1979); устойчивый результат в литературе — вклады обычно снижаются при повторении игры с одной и той же группой.',
    });

    pgGoTo(3);
  };

  window.pgReset = () => {
    data = NAMES.map((n) => ({ name: n, r1: null, r2: null }));
    buildEntryRows(1);
    buildEntryRows(2);
    updateFillProgress(1);
    updateFillProgress(2);
    pgGoTo(0);
    Persist.clear('public-goods');
  };

  buildEntryRows(1);
  buildEntryRows(2);
  updateFillProgress(1);
  updateFillProgress(2);
  hydrated = true;
}
