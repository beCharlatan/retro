/* =========================================================
   GAME: Эффект Барнума / Форера (barnum)
========================================================= */

import { Persist } from '../persist.js';
import { Print } from '../print.js';
import { Screen } from '../screen.js';
import { app, avatarName, state } from '../state.js';
import { copyToClipboard } from '../toast.js';

export function renderBarnumGame() {
  const NAMES = state.participants.slice();
  const PROFILE_TEXT =
    'Иногда вы сомневаетесь, правильно ли поступили или приняли верное решение. Вы цените, когда вас окружают доказательства того, что вас любят и уважают, но при этом умеете быть требовательны к себе. У вас есть значительный неиспользуемый потенциал, который вы не всегда обращаете себе на пользу. Внешне вы дисциплинированы и держите себя в руках, но внутри нередко испытываете тревогу и неуверенность. Порой вы всерьёз сомневаетесь, правильный ли выбор сделали в жизни или в карьере. Вам нравится определённая доля перемен и разнообразия, а жёсткие рамки и ограничения вызывают недовольство.';
  let data = NAMES.map((n) => ({ name: n, rating: null }));
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Эффект Барнума</span>
      </div>
      <div class="progress">
        <div class="dot active" data-dot="0"></div>
        <div class="dot" data-dot="1"></div>
        <div class="dot" data-dot="2"></div>
        <div class="dot" data-dot="3"></div>
      </div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 6 минут</p>
        <h1>Персональный психологический портрет команды</h1>
        <p class="lede">Перед игрой команда заполнила короткий опросник о себе (реально не нужно ничего заполнять — просто скажите это вслух для атмосферы). Ниже — их индивидуальный разбор.</p>

        <div class="draft-mount" id="draft-mount-barnum"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Прочитайте вслух текст на следующем экране</b>
              <span>Как «результат психологического анализа», подготовленный лично для команды.</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Каждый оценивает точность про себя</b>
              <span>От 0 (совсем не про меня) до 5 (прямо в точку) — насколько описание похоже лично на вас.</span>
            </div>
          </li>
        </ol>

        <p class="note">Не подглядывайте вперёд — оценивайте по первому впечатлению.</p>

        <div class="quote-card">
          <div class="spoiler-head">
            <b>Текст для команды</b>
            <div class="spoiler-actions">
              <button type="button" class="ghost" id="copy-profile">📋 Скопировать</button>
            </div>
          </div>
          <p>«${PROFILE_TEXT}»</p>
        </div>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="barnumGoTo(1)">Вносить данные →</button>
        </div>
      </section>

      <section class="screen" id="screen-1">
        <p class="eyebrow">Сбор данных</p>
        <h2>Впишите оценку каждого участника</h2>
        <p class="lede">От 0 (совсем не про меня) до 5 (прямо в точку).</p>

        <div class="entry-head two-col">
          <div>Участник</div>
          <div>Оценка (0–5)</div>
        </div>
        <div id="entry-body"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count">0</span> из <span id="fill-total">${NAMES.length}</span>
          <div class="track"><div id="fill-bar" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="barnumGoTo(0)">← Назад</button>
          <button class="primary" id="show-results-btn" onclick="barnumShowResults()" disabled>Показать результаты →</button>
        </div>
      </section>

      <section class="screen" id="screen-2">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-barnum"></div>


        <div class="reveal">
          <div class="n" id="avg-rating">—</div>
          <p><b>Средняя оценка точности</b> из 5 — команда в среднем сочла описание довольно похожим на себя.</p>
        </div>

        <div class="quote-card">
          <p>«${PROFILE_TEXT}»</p>
        </div>
        <p><b>Сюрприз:</b> это тот же самый текст, что был на первом экране — и каждый участник получил ровно его, слово в слово. Никакого «индивидуального анализа» не было.</p>

        <table class="results-table" id="results-table">
          <thead><tr><th>Участник</th><th>Оценка</th></tr></thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-barnum"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>


        <div class="nav-row">
          <button class="ghost" onclick="barnumGoTo(1)">← Назад</button>
          <button class="primary" onclick="barnumGoTo(3)">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-3">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Эффект Барнума / Форера</h1>
        <p class="lede">Расплывчатое, «универсальное» описание личности воспринимается как удивительно точное — если человек верит, что оно составлено именно для него.</p>

        <p>В 1949 году психолог Бертрам Форер дал 39 студентам тест личности, а через неделю раздал каждому «индивидуальный» разбор — якобы составленный по результатам их теста. На деле все получили один и тот же текст, собранный из газетного гороскопа, а сам тест никак не обрабатывался.</p>

        <div class="stat-row">
          <div class="stat"><div class="n">4.26 / 5</div><div class="lab">средняя оценка точности в оригинальном опыте Форера</div></div>
          <div class="stat"><div class="n">39</div><div class="lab">студентов получили один и тот же текст</div></div>
        </div>

        <p>Опубликовано как Forer B. R. (1949). The Fallacy of Personal Validation: A Classroom Demonstration of Gullibility. <i>Journal of Abnormal and Social Psychology</i>, 44(1), 118–123. Термин «эффект Барнума» ввёл психолог Пол Мил в 1956 году — в честь шоумена Ф. Т. Барнума, чей девиз был «у нас для каждого найдётся что-нибудь».</p>

        <p><b>Почему расплывчатость работает лучше точности.</b> Фразы вроде «иногда вы сомневаетесь в своих решениях» технически верны для почти любого живого человека — но воспринимаются они не как общие, а как личные, потому что читающий сам додумывает конкретный случай из своей жизни, который под них подходит. Мозг охотно ищет подтверждения («да, точно, было на прошлой неделе!») и почти не ищет опровержений — это отдельное, тоже хорошо изученное искажение, склонность к подтверждению (confirmation bias). Плюс формулировки часто строятся как «двусторонние»: «вы бываете общительны, но иногда любите одиночество» — подходит буквально всем, потому что покрывает оба варианта сразу.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>Этим держатся гороскопы и многие онлайн-тесты личности</b><span>Формулировки специально делают расплывчатыми и «двусторонними» («дисциплинированы снаружи, но тревожны внутри») — какой бы стороной вы ни были, фраза всё равно попадёт.</span></div>
        <div class="fact"><b>Позитивная формулировка усиливает эффект</b><span>Люди охотнее соглашаются с лестными расплывчатыми описаниями, чем с нейтральными или негативными — общая благосклонность к себе подыгрывает искажению.</span></div>
        <div class="fact"><b>Авторитет источника тоже усиливает эффект</b><span>Тот же самый текст, поданный как «результат теста от психолога», воспринимается точнее, чем поданный как шутка или случайный текст — доверие к источнику подкрепляет доверие к содержанию.</span></div>
        <div class="fact"><b>Работает даже на профессионалов</b><span>В повторных опытах студенты психологических факультетов, знавшие об эффекте Барнума и специально предупреждённые, всё равно оценивали общий текст как «довольно точный» — интеллектуальное знание о ловушке не отменяет автоматической реакции.</span></div>
        <div class="fact"><b>Основа целой индустрии «холодного чтения»</b><span>Экстрасенсы и гадалки используют тот же приём вживую: начинают с общих утверждений, наблюдают за реакцией собеседника и постепенно уточняют формулировки в сторону того, что вызывает у него отклик — сам «дар предвидения» тут не нужен.</span></div>
        <div class="fact"><b>Обратная сторона — эффект хорошо продаваемой обратной связи</b><span>Расплывчатые комментарии о работе сотрудника («у вас большой потенциал, которым вы не всегда пользуетесь») звучат вдумчиво, но малополезны на практике именно потому, что подходят почти любому человеку — конкретная обратная связь работает лучше именно из-за своей конкретности.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="barnumReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('barnum');

  document.getElementById('copy-profile').addEventListener('click', (e) => {
    copyToClipboard(PROFILE_TEXT, e.currentTarget);
  });

  Persist.offerRestore(
    'barnum',
    'draft-mount-barnum',
    (p) => Array.isArray(p.data) && p.data.length === NAMES.length,
    (p) => {
      data = p.data;
      buildEntryRows();
      updateFillProgress();
      barnumGoTo(1);
    },
  );

  function buildEntryRows() {
    const body = document.getElementById('entry-body');
    body.innerHTML = '';
    data.forEach((row, i) => {
      const div = document.createElement('div');
      div.className = 'entry-row two-col';
      div.innerHTML = `
        <div class="name">${avatarName(row.name)}</div>
        <input type="number" min="0" max="5" step="1" inputmode="numeric" placeholder="0–5" data-idx="${i}" value="${row.rating ?? ''}">
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
    if (v !== null) {
      if (v < 0) v = 0;
      if (v > 5) v = 5;
    }
    data[idx].rating = v;
    updateFillProgress();
  }

  function updateFillProgress() {
    const filled = data.filter((d) => d.rating !== null).length;
    Screen.updateProgress('', filled, NAMES.length, 'show-results-btn', 2);
    if (hydrated) {
      Persist.save('barnum', { data: data });
    }
  }

  window.barnumGoTo = (screenIdx) => {
    Screen.goTo(screenIdx);
  };

  window.barnumShowResults = () => {
    const filled = data.filter((d) => d.rating !== null);
    const avg = filled.reduce((a, b) => a + b.rating, 0) / filled.length;
    document.getElementById('avg-rating').textContent = avg.toFixed(2) + ' / 5';

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    filled.forEach((d) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${avatarName(d.name)}</td><td>${d.rating} / 5</td>`;
      tbody.appendChild(tr);
    });

    Print.mount('print-header-barnum', {
      title: 'Эффект Барнума',
      subtitle: 'Расплывчатое описание личности кажется удивительно «прямо про меня».',
      meta: Print.meta(filled.length),
      explanation:
        'Расплывчатое, общее для всех описание личности воспринимается как удивительно точное и «прямо про меня» — потому что читающий сам додумывает подходящие примеры из своей жизни. Эффект впервые продемонстрировал психолог Бертрам Форер в 1949 году: все 39 студентов получили один и тот же текст и в среднем оценили его точность на 4.26 из 5.',
    });

    barnumGoTo(2);
  };

  window.barnumReset = () => {
    data = NAMES.map((n) => ({ name: n, rating: null }));
    buildEntryRows();
    updateFillProgress();
    barnumGoTo(0);
    Persist.clear('barnum');
  };

  buildEntryRows();
  updateFillProgress();
  hydrated = true;
}
