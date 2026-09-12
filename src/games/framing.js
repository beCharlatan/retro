/* =========================================================
   GAME: Эффект фрейминга (framing)
========================================================= */

import { Persist } from '../persist.js';
import { Print } from '../print.js';
import { Roles } from '../roles.js';
import { Screen } from '../screen.js';
import { app, avatarName, state } from '../state.js';
import { copyToClipboard } from '../toast.js';

export function renderFramingGame() {
  let groups = Roles.makeGroups(state.participants);
  let entries = buildEntries();
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  const TOTAL_SCREENS = 6;

  const GROUP_LABEL = { A: 'А', B: 'Б' };

  function buildEntries() {
    const a = groups.groupA.map((n) => ({ name: n, group: 'A', choice: null }));
    const b = groups.groupB.map((n) => ({ name: n, group: 'B', choice: null }));
    return a.concat(b);
  }

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Эффект фрейминга</span>
      </div>
      <div class="progress">${Roles.dotsHTML(TOTAL_SCREENS, 0)}</div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 7 минут</p>
        <h1>Один выбор, две формулировки</h1>
        <p class="lede">Мы разделим вас на две группы. Каждая услышит свою версию одной и той же дилеммы — с одинаковыми числами внутри.</p>

        <div class="draft-mount" id="draft-mount-framing"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Группы получат разные формулировки</b>
              <span>Числа и суть решения одинаковы для всех — отличаются только слова, которыми это описано.</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Каждый выбирает одну из двух программ</b>
              <span>Программу 1 (без риска) или Программу 2 (с риском) — только свою, из формулировки для своей группы.</span>
            </div>
          </li>
        </ol>

        <p class="note">Дальше мы распределим группы и покажем каждой её текст отдельно.</p>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="frGoTo(1)">Распределить группы →</button>
        </div>
      </section>

      <section class="screen" id="screen-1">
        <p class="eyebrow">Распределение ролей</p>
        <h2>Кто в какой группе</h2>
        <p class="lede">Не нравится расклад — перемешайте.</p>

        <div id="groups-holder"></div>
        <button class="shuffle-btn" id="shuffle-btn">🎲 Перемешать группы</button>

        <div class="nav-row">
          <button class="ghost" onclick="frGoTo(0)">← Назад</button>
          <button class="primary" onclick="frGoTo(2)">Дальше →</button>
        </div>
      </section>

      <section class="screen" id="screen-2">
        <p class="eyebrow">Сценарий</p>
        <h2>Текст для каждой группы — по отдельности</h2>
        <p class="lede">Готовится проект, в котором участвуют 600 человек. Есть две программы действий. Тексты спрятаны — раскройте или скопируйте только тот, что нужен, и отправьте его своей группе в чат.</p>

        <div class="quote-card spoiler-card">
          <div class="spoiler-head">
            <b>Группа А</b>
            <div class="spoiler-actions">
              <button type="button" class="ghost spoiler-toggle" id="toggle-a">👁 Показать</button>
              <button type="button" class="ghost" id="copy-a">📋 Скопировать</button>
            </div>
          </div>
          <p class="spoiler-placeholder" id="placeholder-a">Текст скрыт — нажмите «Показать», чтобы прочитать самому, или сразу скопируйте и отправьте группе А в чат.</p>
          <p class="spoiler-text" id="text-a" hidden>Программа 1 — «спасено ровно 200 человек».<br>Программа 2 — «с вероятностью ⅓ спасены все 600, с вероятностью ⅔ не спасён никто».</p>
        </div>

        <div class="quote-card spoiler-card" style="border-left-color:var(--rust);">
          <div class="spoiler-head">
            <b>Группа Б</b>
            <div class="spoiler-actions">
              <button type="button" class="ghost spoiler-toggle" id="toggle-b">👁 Показать</button>
              <button type="button" class="ghost" id="copy-b">📋 Скопировать</button>
            </div>
          </div>
          <p class="spoiler-placeholder" id="placeholder-b">Текст скрыт — нажмите «Показать», чтобы прочитать самому, или сразу скопируйте и отправьте группе Б в чат.</p>
          <p class="spoiler-text" id="text-b" hidden>Программа 1 — «умрёт ровно 400 человек».<br>Программа 2 — «с вероятностью ⅓ никто не умрёт, с вероятностью ⅔ умрут все 600».</p>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="frGoTo(1)">← Назад</button>
          <button class="primary" onclick="frEnterData()">Вносить данные →</button>
        </div>
      </section>

      <section class="screen" id="screen-3">
        <p class="eyebrow">Сбор данных</p>
        <h2>Впишите выбор каждого участника</h2>
        <p class="lede">Программа 1 (без риска) или Программа 2 (с риском) — по формулировке своей группы.</p>

        <div id="entry-body"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count">0</span> из <span id="fill-total">${entries.length}</span>
          <div class="track"><div id="fill-bar" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="frGoTo(2)">← Назад</button>
          <button class="primary" id="show-results-btn" onclick="frShowResults()" disabled>Показать результаты →</button>
        </div>
      </section>

      <section class="screen" id="screen-4">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-framing"></div>


        <div class="reveal">
          <div class="n" id="flip-text">—</div>
          <p id="flip-detail"><b>Доля выбравших рискованную Программу 2</b> в каждой группе — при одинаковых числах внутри дилеммы.</p>
        </div>

        <div class="group-compare">
          <div class="g low">
            <div class="t">Группа А (формулировка выигрыша) · риск</div>
            <div class="v" id="a-risky">—</div>
          </div>
          <div class="g high">
            <div class="t">Группа Б (формулировка потери) · риск</div>
            <div class="v" id="b-risky">—</div>
          </div>
        </div>

        <table class="results-table" id="results-table">
          <thead><tr><th>Участник</th><th>Группа</th><th>Выбор</th></tr></thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-framing"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>


        <div class="nav-row">
          <button class="ghost" onclick="frGoTo(3)">← Назад</button>
          <button class="primary" onclick="frGoTo(5)">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-5">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Эффект фрейминга</h1>
        <p class="lede">Одна и та же по сути информация, поданная как «выигрыш» или как «потеря», приводит к разным решениям — хотя математически варианты идентичны.</p>

        <p>Это адаптация знаменитой «проблемы азиатской болезни» из статьи Tversky A., Kahneman D. (1981). The Framing of Decisions and the Psychology of Choice. <i>Science</i>, 211(4481) — одного из ключевых экспериментов, лёгших в основу «теории перспектив» (prospect theory), за которую Канеман получил Нобелевскую премию по экономике в 2002 году.</p>

        <div class="stat-row">
          <div class="stat"><div class="n">~72%</div><div class="lab">выбирают безопасный вариант при формулировке выигрыша</div></div>
          <div class="stat"><div class="n">~78%</div><div class="lab">выбирают рискованный вариант при формулировке потери</div></div>
        </div>

        <p><b>Почему одинаковые числа ощущаются по-разному.</b> Согласно теории перспектив, люди оценивают исходы не в абсолютных величинах, а относительно точки отсчёта — и реагируют на выигрыши и потери несимметрично. Когда решение подано как выигрыш («спасено 200 из 600»), мы становимся осторожными: гарантированный небольшой выигрыш кажется привлекательнее, чем риск потерять его в погоне за большим. Когда то же самое подано как потеря («умрёт 400 из 600»), психологически невыносима сама мысль о гарантированной потере — и мы охотнее идём на риск, лишь бы был шанс вообще не потерять ничего, даже если статистически шансы одинаковы. Гарантированная потеря «болит» сильнее, чем такая же по размеру гарантированная недополученная выгода — из-за этого одна и та же дилемма выглядит совершенно по-разному в зависимости от того, с какой стороны на неё посмотреть.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>Тот же приём — в маркетинге и медицине</b><span>«95% успешных операций» звучит убедительнее, чем «5% смертность» — хотя это одно и то же число, поданное через выигрыш вместо потери.</span></div>
        <div class="fact"><b>Эффект устойчив даже у экспертов</b><span>Врачи в оригинальных репликах тоже меняли рекомендации в зависимости от формулировки статистики выживаемости — специальные знания не отменяют эффект фрейминга полностью.</span></div>
        <div class="fact"><b>Работает и на бытовых решениях</b><span>Люди чаще соглашаются на небольшую скидку за оплату наличными, если её называют «скидкой», и заметно реже — если ровно ту же разницу в цене называют «доплатой за оплату картой», хотя итоговая сумма одинакова.</span></div>
        <div class="fact"><b>Формулировки влияют на согласие с политикой и налогами</b><span>В опросах поддержка одной и той же меры заметно меняется в зависимости от того, описана ли она как «сохранение существующих рабочих мест» или как «предотвращение потери рабочих мест» — хотя по сути речь о совершенно одинаковом результате.</span></div>
        <div class="fact"><b>Рабочая параллель</b><span>«Мы можем сохранить 80% бюджета» и «мы потеряем 20% бюджета» — одно и то же решение, но вторая формулировка обычно подталкивает команду к более рискованным шагам, чтобы избежать ощущаемой потери.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="frReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('framing');

  Persist.offerRestore(
    'framing',
    'draft-mount-framing',
    (p) => Array.isArray(p.entries) && p.entries.length === state.participants.length,
    (p) => {
      groups = p.groups;
      entries = p.entries;
      renderGroupsHolder();
      renderEntryRows();
      updateFillProgress();
      frGoTo(3);
    },
  );

  // Spoiler + copy-to-clipboard for each group's scenario text, so the
  // facilitator can send the right wording privately instead of
  // reading both aloud off a shared screen.
  const SCENARIO_TEXT = {
    a:
      'Готовится проект, в котором участвуют 600 человек. Есть две программы действий.\n\n' +
      'Программа 1 — спасено ровно 200 человек.\n' +
      'Программа 2 — с вероятностью 1/3 спасены все 600, с вероятностью 2/3 не спасён никто.\n\n' +
      'Какую программу вы выбираете?',
    b:
      'Готовится проект, в котором участвуют 600 человек. Есть две программы действий.\n\n' +
      'Программа 1 — умрёт ровно 400 человек.\n' +
      'Программа 2 — с вероятностью 1/3 никто не умрёт, с вероятностью 2/3 умрут все 600.\n\n' +
      'Какую программу вы выбираете?',
  };
  ['a', 'b'].forEach((key) => {
    const toggleBtn = document.getElementById('toggle-' + key);
    const copyBtn = document.getElementById('copy-' + key);
    const textEl = document.getElementById('text-' + key);
    const placeholderEl = document.getElementById('placeholder-' + key);
    toggleBtn.addEventListener('click', () => {
      const nowHidden = !textEl.hidden;
      textEl.hidden = nowHidden;
      placeholderEl.hidden = !nowHidden;
      toggleBtn.textContent = nowHidden ? '👁 Показать' : '🙈 Скрыть';
    });
    copyBtn.addEventListener('click', () => {
      copyToClipboard(SCENARIO_TEXT[key], copyBtn);
    });
  });

  function renderGroupsHolder() {
    const el = document.getElementById('groups-holder');
    el.innerHTML = Roles.groupsHTML(groups.groupA, groups.groupB, {
      labelA: 'Группа А',
      labelB: 'Группа Б',
    });
    Roles.bindGroupSwap(el, () => groups, renderGroupsHolder);
  }
  renderGroupsHolder();
  Roles.bindShuffle(document.getElementById('shuffle-btn'), () => {
    groups = Roles.makeGroups(state.participants);
    renderGroupsHolder();
    entries = buildEntries();
  });

  window.frEnterData = () => {
    buildEntryRows();
    frGoTo(3);
  };

  function renderEntryRows() {
    const body = document.getElementById('entry-body');
    document.getElementById('fill-total').textContent = entries.length;

    const withIdx = entries.map((e, i) => ({ ...e, idx: i }));
    const listA = withIdx.filter((e) => e.group === 'A');
    const listB = withIdx.filter((e) => e.group === 'B');

    function section(title, list, cls) {
      const cards = list
        .map(
          (e) => `
        <div class="team-entry-card wide-control">
          <div class="team-entry-name">${avatarName(e.name)}</div>
          <div class="toggle-pair" data-idx="${e.idx}">
            <button type="button" data-val="1" class="${e.choice === '1' ? 'on' : ''}">Программа 1</button>
            <button type="button" data-val="2" class="${e.choice === '2' ? 'on' : ''}">Программа 2</button>
          </div>
        </div>`,
        )
        .join('');
      return `
        <div class="team-entry-group ${cls}">
          <div class="team-entry-group-title">${title} <span class="count">· ${list.length} чел.</span></div>
          <div class="team-entry-list">${cards}</div>
        </div>`;
    }

    body.innerHTML = section('Группа А', listA, 'team-a') + section('Группа Б', listB, 'team-b');

    Array.from(body.querySelectorAll('.toggle-pair button')).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const wrap = e.currentTarget.closest('.toggle-pair');
        const idx = +wrap.dataset.idx;
        const val = e.currentTarget.dataset.val;
        entries[idx].choice = val;
        Array.from(wrap.querySelectorAll('button')).forEach((b) => {
          b.classList.toggle('on', b.dataset.val === val);
        });
        updateFillProgress();
      });
    });
  }

  function buildEntryRows() {
    entries = buildEntries();
    renderEntryRows();
  }

  function updateFillProgress() {
    const filled = entries.filter((e) => e.choice !== null).length;
    Screen.updateProgress('', filled, entries.length, 'show-results-btn', 2);
    if (hydrated) {
      Persist.save('framing', { groups: groups, entries: entries });
    }
  }

  window.frGoTo = (screenIdx) => {
    Screen.goTo(screenIdx);
    if (screenIdx !== 3) updateFillProgress();
  };

  window.frShowResults = () => {
    const filled = entries.filter((e) => e.choice !== null);
    const groupAEntries = filled.filter((e) => e.group === 'A');
    const groupBEntries = filled.filter((e) => e.group === 'B');
    const riskyPct = (arr) =>
      arr.length
        ? Math.round((arr.filter((e) => e.choice === '2').length / arr.length) * 100)
        : null;
    const aRisky = riskyPct(groupAEntries);
    const bRisky = riskyPct(groupBEntries);

    document.getElementById('a-risky').textContent = aRisky === null ? '—' : aRisky + '%';
    document.getElementById('b-risky').textContent = bRisky === null ? '—' : bRisky + '%';

    if (aRisky !== null && bRisky !== null) {
      const flipped = bRisky > aRisky;
      document.getElementById('flip-text').textContent = flipped
        ? 'Формулировка сработала'
        : 'В этот раз без переворота';
      document.getElementById('flip-detail').innerHTML =
        `<b>Группа Б выбрала риск на ${Math.abs(bRisky - aRisky)} п.п. ${bRisky > aRisky ? 'чаще' : 'реже'}</b>, чем Группа А — при абсолютно одинаковых числах внутри дилеммы, разница только в словах.`;
    }

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    filled.forEach((e) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${avatarName(e.name)}</td><td>${GROUP_LABEL[e.group]}</td><td>Программа ${e.choice}</td>`;
      tbody.appendChild(tr);
    });

    Print.mount('print-header-framing', {
      title: 'Эффект фрейминга',
      subtitle:
        'Один и тот же выбор выглядит разумным или рискованным — в зависимости от формулировки.',
      meta: Print.meta(filled.length),
      explanation:
        'Одна и та же по сути информация, поданная как выигрыш или как потеря, приводит к разным решениям — хотя математически варианты идентичны. Классический эксперимент — Tversky, Kahneman (1981), легший в основу теории перспектив, за которую Канеман получил Нобелевскую премию по экономике в 2002 году.',
    });

    frGoTo(4);
  };

  window.frReset = () => {
    groups = Roles.makeGroups(state.participants);
    renderGroupsHolder();
    entries = buildEntries();
    frGoTo(0);
    Persist.clear('framing');
  };

  updateFillProgress();
  hydrated = true;
}
