/* =========================================================
   GAME: Эффект владения (endowment)
   Two rounds instead of one: round 1 keeps the groups as
   assigned, round 2 swaps roles — owners become buyers and
   buyers become owners, for the same mug. Everyone ends up
   giving both a WTA and a WTP price, which doubles the sample
   behind each average instead of splitting the room in half.
========================================================= */
function renderEndowmentGame(){
  let groups = Roles.makeGroups(state.participants);
  let entries = buildEntries();
  let hydrated = false; // guards against overwriting a not-yet-restored draft

  const TOTAL_SCREENS = 6;

  function buildEntries(){
    // r1Role is where they start (from the groups screen); r2Role is
    // always the opposite — that's the whole point of round 2.
    const owners = groups.groupA.map(n => ({ name:n, r1Role:'owner', r2Role:'buyer', r1Price:null, r2Price:null }));
    const buyers = groups.groupB.map(n => ({ name:n, r1Role:'buyer', r2Role:'owner', r1Price:null, r2Price:null }));
    return owners.concat(buyers);
  }

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="game-crumb">
        <button class="back-link" id="back-home">← Все игры</button>
        <span class="crumb-sep">/</span>
        <span class="crumb-current">Эффект владения</span>
      </div>
      <div class="progress">${Roles.dotsHTML(TOTAL_SCREENS, 0)}</div>

      <section class="screen active" id="screen-0">
        <p class="eyebrow">Командное упражнение · 9 минут</p>
        <h1>Одна кружка, две цены — и роли поменяются</h1>
        <p class="lede">Два раунда. В первом одна половина продаёт, другая покупает. Во втором — наоборот, с той же кружкой.</p>

        <div class="draft-mount" id="draft-mount-endowment"></div>

        <ol class="step-list">
          <li>
            <div class="step-num">1</div>
            <div class="step-body">
              <b>Представьте фирменную кружку команды</b>
              <span>Обычная кружка с логотипом — ничего особенного, просто повод для решения о цене.</span>
            </div>
          </li>
          <li>
            <div class="step-num">2</div>
            <div class="step-body">
              <b>Раунд 1 — одна роль, раунд 2 — противоположная</b>
              <span>Владельцы называют минимальную цену продажи, покупатели — максимальную цену покупки. Во втором раунде каждый оказывается в противоположной роли — с той же кружкой.</span>
            </div>
          </li>
        </ol>

        <p class="note">Отвечайте первым пришедшим в голову числом — это не должно занимать больше пары секунд раздумий.</p>

        <div class="nav-row">
          <span></span>
          <button class="primary" onclick="endGoTo(1)">Распределить группы →</button>
        </div>
      </section>

      <section class="screen" id="screen-1">
        <p class="eyebrow">Распределение ролей</p>
        <h2>Кто продаёт, кто покупает — в раунде 1</h2>
        <p class="lede">Во втором раунде роли поменяются местами автоматически. Не нравится расклад — перемешайте.</p>

        <div id="groups-holder"></div>
        <button class="shuffle-btn" id="shuffle-btn">🎲 Перемешать группы</button>

        <div class="nav-row">
          <button class="ghost" onclick="endGoTo(0)">← Назад</button>
          <button class="primary" onclick="endLockGroups()">Дальше →</button>
        </div>
      </section>

      <section class="screen" id="screen-2">
        <p class="eyebrow">Раунд 1 из 2</p>
        <h2>Впишите цену каждого участника</h2>
        <p class="lede">Владельцы называют минимальную цену продажи, покупатели — максимальную цену покупки.</p>

        <div id="entry-body-1"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count-1">0</span> из <span id="fill-total-1">${entries.length}</span>
          <div class="track"><div id="fill-bar-1" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="endGoTo(1)">← Назад</button>
          <button class="primary" id="next-btn-1" onclick="endGoTo(3)" disabled>Раунд 2 — роли наоборот →</button>
        </div>
      </section>

      <section class="screen" id="screen-3">
        <p class="eyebrow">Раунд 2 из 2 · Роли поменялись</p>
        <h2>Та же кружка, противоположная роль</h2>
        <p class="lede">Кто в раунде 1 продавал — теперь покупает, и наоборот.</p>

        <div id="entry-body-2"></div>

        <div class="fill-progress">
          Заполнено: <span id="fill-count-2">0</span> из <span id="fill-total-2">${entries.length}</span>
          <div class="track"><div id="fill-bar-2" style="width:0%"></div></div>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="endGoTo(2)">← Назад</button>
          <button class="primary" id="next-btn-2" onclick="endShowResults()" disabled>Показать результаты →</button>
        </div>
      </section>

      <section class="screen" id="screen-4">
        <p class="eyebrow">Результаты</p>
        <h2>Что получилось у вашей команды</h2>
        <div class="print-header" id="print-header-endowment"></div>

        <div class="reveal">
          <div class="n" id="ratio-value">—</div>
          <p><b>Во столько раз</b> средняя цена продажи оказалась выше средней цены покупки — по всем ${entries.length} людям сразу, ведь каждый побывал в обеих ролях.</p>
        </div>

        <div class="group-compare">
          <div class="g low">
            <div class="t">Средняя цена продажи (в роли владельца)</div>
            <div class="v" id="avg-wta">—</div>
          </div>
          <div class="g high">
            <div class="t">Средняя цена покупки (в роли покупателя)</div>
            <div class="v" id="avg-wtp">—</div>
          </div>
        </div>

        <table class="results-table" id="results-table">
          <thead><tr><th>Участник</th><th>Как владелец</th><th>Как покупатель</th></tr></thead>
          <tbody id="results-tbody"></tbody>
        </table>

        <div class="print-footer" id="print-footer-endowment"></div>

        <div class="pdf-row">
          <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
        </div>

        <div class="nav-row">
          <button class="ghost" onclick="endGoTo(3)">← Назад</button>
          <button class="primary" onclick="endGoTo(5)">Что это было? →</button>
        </div>
      </section>

      <section class="screen" id="screen-5">
        <p class="eyebrow">А теперь — контекст</p>
        <h1>Эффект владения</h1>
        <p class="lede">Одна и та же вещь субъективно ценнее для того, кто ею уже «владеет», чем для того, кто хочет её купить — хотя рационально цена должна быть одна и та же.</p>

        <p>Знаменитый «эксперимент с кружками» описан в статье Kahneman D., Knetsch J. L., Thaler R. H. (1990). Experimental Tests of the Endowment Effect and the Coase Theorem. <i>Journal of Political Economy</i>. Половине студентов раздали кружки и предложили их продать, другой половине предложили купить такую же кружку. Средняя цена продажи оказалась примерно вдвое выше средней цены покупки.</p>

        <p>По теореме Коуза, при нулевых транзакционных издержках итоговое распределение не должно зависеть от того, кому изначально досталось владение — цена продажи и цена покупки должны сходиться. На практике они систематически расходятся.</p>

        <p><b>Почему владение меняет ощущение ценности.</b> Пока вещь ещё не ваша, вы оцениваете её просто как один из вариантов — «сколько я готов заплатить за эту кружку среди прочих способов потратить эти деньги». Но как только вещь становится вашей, точка отсчёта смещается: теперь вы думаете не «сколько это стоит», а «что я потеряю, если отдам её».</p>

        <p><b>Зачем нужен именно второй раунд.</b> В классическом дизайне WTA и WTP называют РАЗНЫЕ люди — а значит, разницу можно списать на то, что одни от природы просто более прижимистые продавцы, а другие — более расчётливые покупатели. Когда роли меняются местами, каждый называет обе цены за одну и ту же кружку — и разница между «моя цена продажи» и «моя цена покупки» становится чисто личным эффектом, а не различием между двумя разными группами людей.</p>

        <hr>
        <h2>Ещё немного фактов</h2>

        <div class="fact"><b>Не для всех вещей одинаково сильно</b><span>Эффект слабее выражен для вещей, купленных «для перепродажи» — трейдеры не успевают привязаться к товару — и заметно сильнее для вещей с личной или эмоциональной ценностью.</span></div>
        <div class="fact"><b>Это не совсем ошибка, а часть психологии потери</b><span>Эффект владения — частный случай неприятия потерь (loss aversion): расставание с вещью ощущается как потеря, а потери переживаются острее, чем эквивалентные по размеру приобретения.</span></div>
        <div class="fact"><b>Достаточно нескольких секунд владения</b><span>В экспериментах эффект проявляется даже тогда, когда предмет побывал в руках участника буквально пару минут перед «продажей» — для его возникновения не нужны недели привязанности.</span></div>
        <div class="fact"><b>Влияет на реальные рынки жилья</b><span>Владельцы недвижимости во время падения цен систематически выставляют квартиры дороже рыночной стоимости и дольше не соглашаются на снижение — им психологически труднее «признать» уменьшение ценности того, что уже принадлежит им.</span></div>
        <div class="fact"><b>Пробные периоды используют этот же механизм</b><span>«30 дней бесплатно, потом можно отказаться» работает лучше простой продажи именно потому, что после пробного периода товар или подписка уже ощущаются как «свои» — отказаться от них труднее, чем изначально не подписываться.</span></div>
        <div class="fact"><b>Рабочая параллель</b><span>Команда обычно переоценивает ценность своего же кода, процесса или архитектурного решения именно потому, что уже «владеет» им — сторонний взгляд почти всегда оценивает то же самое дешевле.</span></div>

        <div class="nav-row">
          <button class="ghost" onclick="endReset()">↺ Начать заново</button>
          <span></span>
        </div>
      </section>
    </div>
  `;

  Screen.wireBackHome('endowment');

  Persist.offerRestore('endowment', 'draft-mount-endowment',
    (p) => Array.isArray(p.entries) && p.entries.length === state.participants.length,
    (p) => {
      groups = p.groups;
      entries = p.entries;
      renderGroupsHolder();
      buildEntryRows(1);
      buildEntryRows(2);
      updateFillProgress(1);
      updateFillProgress(2);
      endGoTo(2);
    });

  function renderGroupsHolder(){
    const el = document.getElementById('groups-holder');
    el.innerHTML =
      Roles.groupsHTML(groups.groupA, groups.groupB, { labelA:'Владельцы (раунд 1)', labelB:'Покупатели (раунд 1)' });
    Roles.bindGroupSwap(el, () => groups, renderGroupsHolder);
  }
  renderGroupsHolder();
  Roles.bindShuffle(document.getElementById('shuffle-btn'), () => {
    groups = Roles.makeGroups(state.participants);
    renderGroupsHolder();
  });

  window.endLockGroups = function(){
    entries = buildEntries();
    buildEntryRows(1);
    buildEntryRows(2);
    updateFillProgress(1);
    updateFillProgress(2);
    endGoTo(2);
  };

  function buildEntryRows(round){
    const body = document.getElementById('entry-body-' + round);
    document.getElementById('fill-total-' + round).textContent = entries.length;
    const roleField = round === 1 ? 'r1Role' : 'r2Role';
    const priceField = round === 1 ? 'r1Price' : 'r2Price';

    const withIdx = entries.map((e, i) => ({ ...e, idx:i }));
    const owners = withIdx.filter(e => e[roleField] === 'owner');
    const buyers = withIdx.filter(e => e[roleField] === 'buyer');

    function section(title, list, cls){
      const cards = list.map(e => `
        <div class="team-entry-card">
          <div class="team-entry-name">${avatarName(e.name)}</div>
          <input type="number" min="0" inputmode="numeric" placeholder="₽" data-idx="${e.idx}" data-round="${round}" value="${e[priceField] ?? ''}">
        </div>`).join('');
      return `
        <div class="team-entry-group ${cls}">
          <div class="team-entry-group-title">${title} <span class="count">· ${list.length} чел.</span></div>
          <div class="team-entry-list">${cards}</div>
        </div>`;
    }

    body.innerHTML = section('Владельцы · продают', owners, 'team-a') + section('Покупатели · покупают', buyers, 'team-b');

    Array.from(body.querySelectorAll('input')).forEach(inp=>{
      inp.addEventListener('input', onEntryInput);
    });
  }

  function onEntryInput(e){
    const idx = +e.target.dataset.idx;
    const round = +e.target.dataset.round;
    const priceField = round === 1 ? 'r1Price' : 'r2Price';
    let v = e.target.value === '' ? null : Number(e.target.value);
    if(v !== null && v < 0) v = 0;
    entries[idx][priceField] = v;
    updateFillProgress(round);
  }

  function updateFillProgress(round){
    const priceField = round === 1 ? 'r1Price' : 'r2Price';
    const filled = entries.filter(e => e[priceField] !== null).length;
    Screen.updateProgress('-' + round, filled, entries.length, 'next-btn-' + round, 2);
    if(hydrated){ Persist.save('endowment', { groups: groups, entries: entries }); }
  }

  window.endGoTo = function(screenIdx){
    Screen.goTo(screenIdx);
  };

  window.endShowResults = function(){
    const filled = entries.filter(e => e.r1Price !== null && e.r2Price !== null);

    // Everyone gave one WTA (as owner) and one WTP (as buyer) — pick the
    // right value from whichever round they held each role in.
    const wtaOf = e => e.r1Role === 'owner' ? e.r1Price : e.r2Price;
    const wtpOf = e => e.r1Role === 'buyer' ? e.r1Price : e.r2Price;

    const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
    const avgWTA = avg(filled.map(wtaOf));
    const avgWTP = avg(filled.map(wtpOf));

    document.getElementById('avg-wta').textContent = avgWTA===null ? '—' : Math.round(avgWTA)+' ₽';
    document.getElementById('avg-wtp').textContent = avgWTP===null ? '—' : Math.round(avgWTP)+' ₽';

    if(avgWTA!==null && avgWTP!==null && avgWTP>0){
      document.getElementById('ratio-value').textContent = (avgWTA/avgWTP).toFixed(1) + '×';
    } else {
      document.getElementById('ratio-value').textContent = '—';
    }

    const tbody = document.getElementById('results-tbody');
    tbody.innerHTML = '';
    filled.forEach(e=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="name">${avatarName(e.name)}</td><td>${wtaOf(e)} ₽</td><td>${wtpOf(e)} ₽</td>`;
      tbody.appendChild(tr);
    });

    Print.mount('print-header-endowment', {
      title: 'Эффект владения',
      subtitle: 'Та же вещь внезапно дороже для того, кто ей уже владеет.',
      meta: Print.meta(filled.length, '2 раунда, роли поменялись'),
      explanation: 'Одна и та же вещь субъективно ценнее для того, кто ею уже владеет, чем для того, кто хочет её купить, хотя рационально цена должна быть одной и той же. Знаменитый «эксперимент с кружками» описан в статье Kahneman, Knetsch, Thaler (1990) — эффект считается частным случаем неприятия потерь (loss aversion).'
    });

    endGoTo(4);
  };

  window.endReset = function(){
    groups = Roles.makeGroups(state.participants);
    renderGroupsHolder();
    entries = buildEntries();
    buildEntryRows(1);
    buildEntryRows(2);
    updateFillProgress(1);
    updateFillProgress(2);
    endGoTo(0);
    Persist.clear('endowment');
  };

  buildEntryRows(1);
  buildEntryRows(2);
  updateFillProgress(1);
  updateFillProgress(2);
  hydrated = true;
}
