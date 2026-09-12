/* =========================================================
   PLATFORM STATE
========================================================= */
const state = {
  participants: ["Михаил","Виктория","Ирина","Айшат","Екатерина","Олег","Мухамед","Артём","Марат","Арина","Таня","Денис","Диана"],
  filter: 'all',
  structureFilter: 'all',
};

const CATEGORY = {
  cognitive: { label: 'Когнитивные искажения', color: 'var(--teal-deep)', pillBg: 'var(--teal-soft)' },
  econ:      { label: 'Экономика / теория игр', color: 'var(--amber-deep)', pillBg: 'var(--amber-soft)' },
  social:    { label: 'Социальная психология',  color: 'var(--plum-deep)', pillBg: 'var(--plum-soft)' },
};

// How participants are split for the exercise — used by the second filter row.
const STRUCTURE = {
  solo:   { label: 'Каждый сам за себя' },
  pairs:  { label: 'По парам' },
  groups: { label: '2 команды' },
};

// A cheerful, distinct color per participant — looked up by each
// person's position in state.participants, so the same person keeps
// the same color everywhere: home screen, every game's forms and
// results tables, and the printed PDF.
const AVATAR_COLORS = [
  '#3E6E64', '#B5502E', '#B7862C', '#7A4364',
  '#3B6E8F', '#5C7A3A', '#9C4B3B', '#6B5B95',
  '#4F8F7A', '#A16A2E', '#5B4B8A', '#8A4B6B',
];

const AVATAR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.7 0 8 1.34 8 4v2H4v-2c0-2.66 5.3-4 8-4zm0-2a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg>`;

function avatarColor(name){
  const idx = state.participants.indexOf(name);
  return AVATAR_COLORS[(idx < 0 ? 0 : idx) % AVATAR_COLORS.length];
}

// Renders a small colored avatar for `name`. Pass size:'sm' for the
// compact version used inline in entry forms, role cards and results
// tables — the default (no size) is the larger chip-sized version
// used on the home screen's participant panel.
function avatarHTML(name, size){
  const color = avatarColor(name);
  const cls = size === 'sm' ? 'avatar avatar-sm' : 'avatar';
  return `<span class="${cls}" style="background:${color}">${AVATAR_SVG}</span>`;
}

// Wraps a name with its (small) avatar as one inline unit — the form
// used almost everywhere outside the home screen's own chip markup:
// entry rows, pair/team cards, role screens and results tables.
function avatarName(name){
  return `<span class="name-with-avatar">${avatarHTML(name, 'sm')}${name}</span>`;
}

const GAMES = [
  { id:'anchoring', icon:'⚓', name:'Эффект якоря', category:'cognitive',
    teaser:'Случайное число незаметно сдвигает вашу же числовую оценку.',
    players:'4+', time:'5 мин', ready:true , structure:'solo' },
  { id:'crowd-wisdom', icon:'🐂', name:'Мудрость толпы', category:'cognitive',
    teaser:'Средняя оценка группы обходит по точности почти всех поодиночке.',
    players:'4+', time:'5 мин', ready:true , structure:'solo' },
  { id:'ultimatum', icon:'⚖️', name:'Ультиматум', category:'econ',
    teaser:'Люди отвергают выгодные предложения, если те кажутся нечестными.',
    players:'4+ (чётное)', time:'10 мин', ready:true , structure:'pairs' },
  { id:'dictator', icon:'👑', name:'Игра диктатора', category:'econ',
    teaser:'Никто не заставляет делиться — но почти все делятся.',
    players:'3+', time:'7 мин', ready:true , structure:'solo' },
  { id:'public-goods', icon:'🪙', name:'Общественное благо', category:'econ',
    teaser:'Группе выгодно вкладываться всем — каждому по отдельности выгоднее не вкладываться.',
    players:'4+', time:'10 мин', ready:true , structure:'solo' },
  { id:'false-consensus', icon:'🙋', name:'Ложный консенсус', category:'social',
    teaser:'Мы уверены, что наше мнение разделяют куда больше людей, чем на самом деле.',
    players:'5+', time:'6 мин', ready:true , structure:'solo' },
  { id:'endowment', icon:'☕', name:'Эффект владения', category:'cognitive',
    teaser:'Та же вещь внезапно дороже для того, кто ей уже владеет.',
    players:'4+ (чётное)', time:'9 мин', ready:true , structure:'groups' },
  { id:'barnum', icon:'🔮', name:'Эффект Барнума', category:'social',
    teaser:'Расплывчатое описание личности кажется удивительно «прямо про меня».',
    players:'3+', time:'6 мин', ready:true , structure:'solo' },
  { id:'prisoners-dilemma', icon:'🔒', name:'Дилемма заключённого', category:'econ',
    teaser:'Рационально предать — но если встреча не последняя, правила меняются.',
    players:'4+ (чётное)', time:'10 мин', ready:true , structure:'pairs' },
  { id:'framing', icon:'🖼️', name:'Эффект фрейминга', category:'cognitive',
    teaser:'Один и тот же выбор выглядит разумным или рискованным — в зависимости от формулировки.',
    players:'6+ (чётное)', time:'7 мин', ready:true , structure:'groups' },
  { id:'availability', icon:'⚡', name:'Эвристика доступности', category:'cognitive',
    teaser:'Мы оцениваем риск по тому, что легче вспоминается, а не по статистике.',
    players:'4+', time:'6 мин', ready:true , structure:'solo' },
  { id:'planning-fallacy', icon:'⏳', name:'Ошибка планирования', category:'cognitive',
    teaser:'«В лучшем случае» и «по факту» — почти никогда не одно и то же число.',
    players:'4+', time:'6 мин', ready:true , structure:'solo' },
  { id:'calibration', icon:'🎯', name:'Калибровка уверенности', category:'cognitive',
    teaser:'Уверены на 90%? Реальное попадание обычно куда ниже.',
    players:'4+', time:'10 мин', ready:true , structure:'solo' },
];

const app = document.getElementById('app');

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(()=>t.classList.remove('show'), 1800);
}

// Copies plain text to the clipboard and gives brief feedback both on
// the button itself (label flips to "Скопировано") and via the shared
// toast. Falls back gracefully if the Clipboard API is unavailable
// (e.g. non-secure context) instead of throwing.
function copyToClipboard(text, btn){
  const done = () => {
    showToast('Скопировано в буфер обмена');
    if(btn){
      const original = btn.dataset.label || btn.textContent;
      btn.dataset.label = original;
      btn.textContent = '✓ Скопировано';
      clearTimeout(btn._copyTm);
      btn._copyTm = setTimeout(()=>{ btn.textContent = original; }, 1600);
    }
  };
  const fail = () => showToast('Не удалось скопировать — выделите текст вручную');

  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(fail);
  } else {
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    }catch(e){ fail(); }
  }
}

/* =========================================================
   HOME VIEW
========================================================= */
function renderHome(){
  const catFilters = [{id:'all', label:'Все'}, ...Object.keys(CATEGORY).map(k=>({id:k, label:CATEGORY[k].label}))];
  const structFilters = [{id:'all', label:'Все'}, ...Object.keys(STRUCTURE).map(k=>({id:k, label:STRUCTURE[k].label}))];

  app.innerHTML = `
    <div class="wrap">
      <div class="masthead">
        <h1>5 минут общего развития</h1>
        <p class="lede">Экономика и психология решений — в формате коротких командных игр. Инструкция, форма, живой результат вашей команды, а потом — история и разбор эффекта.</p>
        <div class="masthead-rule">
          <span class="colophon"><b>${GAMES.length}</b> экспериментов</span>
          <span class="colophon">когнитивная психология · теория игр</span>
          <span class="colophon">составлено для командных встреч</span>
        </div>
      </div>

      <div class="panel" id="participants-panel"></div>

      <div class="filter-group">
        <span class="filter-label">Категория</span>
        <div class="filters" id="filters"></div>
      </div>

      <div class="toolbar-row">
        <div class="filter-group">
          <span class="filter-label">Участники</span>
          <div class="filters" id="structure-filters"></div>
        </div>
        <button class="shuffle-btn" id="random-game-btn">🎲 Случайная игра</button>
      </div>

      <div class="game-grid" id="game-grid"></div>
    </div>
  `;

  renderParticipantsPanel();
  renderFilterGroup('filters', catFilters, () => state.filter, (id) => { state.filter = id; });
  renderFilterGroup('structure-filters', structFilters, () => state.structureFilter, (id) => { state.structureFilter = id; });
  renderGameGrid();
  document.getElementById('random-game-btn').addEventListener('click', pickRandomGame);
}

function getFilteredReadyGames(){
  return GAMES.filter(g =>
    g.ready &&
    (state.filter === 'all' || g.category === state.filter) &&
    (state.structureFilter === 'all' || g.structure === state.structureFilter)
  );
}

function pickRandomGame(){
  const pool = getFilteredReadyGames();
  if(!pool.length){
    showToast('Нет доступных игр с такими фильтрами');
    return;
  }
  const g = pool[Math.floor(Math.random() * pool.length)];
  openGame(g.id);
}

function renderParticipantsPanel(){
  const panel = document.getElementById('participants-panel');
  panel.innerHTML = `
    <div class="panel-head">
      <h2>Участники</h2>
      <span class="count">${state.participants.length} человек</span>
    </div>
    <div class="chips" id="chips"></div>
    <div class="add-row">
      <input type="text" id="new-participant" placeholder="Имя участника">
      <button class="primary" id="add-participant-btn">Добавить</button>
    </div>
  `;
  const chips = document.getElementById('chips');
  state.participants.forEach((name, i)=>{
    const c = document.createElement('span');
    c.className = 'chip';
    c.innerHTML = `${avatarHTML(name)}${name} <button class="chip-x" data-i="${i}" aria-label="Удалить ${name}">×</button>`;
    chips.appendChild(c);
  });
  chips.querySelectorAll('.chip-x').forEach(btn=>{
    btn.addEventListener('click', e=>{
      const i = +e.currentTarget.dataset.i;
      state.participants.splice(i,1);
      renderParticipantsPanel();
    });
  });

  const input = document.getElementById('new-participant');
  const addBtn = document.getElementById('add-participant-btn');
  function addParticipant(){
    const v = input.value.trim();
    if(!v) return;
    state.participants.push(v);
    renderParticipantsPanel();
  }
  addBtn.addEventListener('click', addParticipant);
  input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addParticipant(); } });
}

function renderFilterGroup(containerId, options, getActive, onSelect){
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  options.forEach(f=>{
    const btn = document.createElement('button');
    btn.className = 'filter-pill' + (getActive()===f.id ? ' active' : '');
    btn.textContent = f.label;
    btn.addEventListener('click', ()=>{
      onSelect(f.id);
      renderFilterGroup(containerId, options, getActive, onSelect);
      renderGameGrid();
    });
    el.appendChild(btn);
  });
}

function renderGameGrid(){
  const grid = document.getElementById('game-grid');
  grid.innerHTML = '';
  const list = GAMES.filter(g =>
    (state.filter === 'all' || g.category === state.filter) &&
    (state.structureFilter === 'all' || g.structure === state.structureFilter)
  );
  if(!list.length){
    grid.innerHTML = `<p class="note" style="grid-column:1/-1;">Нет игр с такими фильтрами — попробуйте сбросить один из них.</p>`;
    return;
  }
  list.forEach(g=>{
    const cat = CATEGORY[g.category];
    const card = document.createElement('div');
    card.className = 'game-card' + (g.ready ? '' : ' disabled');
    card.style.setProperty('--cat-color', cat.color);
    card.innerHTML = `
      <div class="top-row">
        <span class="icon">${g.icon}</span>
        <div class="top-row-right">
          <span class="year">№ ${String(GAMES.indexOf(g) + 1).padStart(2, '0')}</span>
          ${g.ready ? '' : `<span class="status soon">Скоро</span>`}
        </div>
      </div>
      <p class="name">${g.name}</p>
      <button type="button" class="teaser-toggle"><span class="toggle-label">Что это?</span> <span class="chev">▾</span></button>
      <p class="teaser" hidden>${g.teaser}</p>
      <div class="meta">
        <span class="cat-tag">${cat.label}</span>
        <span>·</span>
        <span>${g.players}</span>
        <span>·</span>
        <span>${g.time}</span>
      </div>
    `;
    const toggle = card.querySelector('.teaser-toggle');
    const toggleLabel = card.querySelector('.toggle-label');
    const teaserEl = card.querySelector('.teaser');
    toggle.addEventListener('click', (e)=>{
      e.stopPropagation();
      const isOpen = toggle.classList.toggle('open');
      teaserEl.hidden = !isOpen;
      toggleLabel.textContent = isOpen ? 'Скрыть' : 'Что это?';
    });
    card.addEventListener('click', ()=>{
      if(g.ready){ openGame(g.id); }
      else{ showToast(`«${g.name}» скоро добавим`); }
    });
    grid.appendChild(card);
  });
}

const GAME_RENDERERS = {
  'anchoring': () => renderAnchoringGame(),
  'crowd-wisdom': () => renderCrowdWisdomGame(),
  'dictator': () => renderDictatorGame(),
  'public-goods': () => renderPublicGoodsGame(),
  'false-consensus': () => renderFalseConsensusGame(),
  'barnum': () => renderBarnumGame(),
  'availability': () => renderAvailabilityGame(),
  'planning-fallacy': () => renderPlanningFallacyGame(),
  'ultimatum': () => renderUltimatumGame(),
  'prisoners-dilemma': () => renderPrisonersDilemmaGame(),
  'endowment': () => renderEndowmentGame(),
  'framing': () => renderFramingGame(),
  'calibration': () => renderCalibrationGame(),
};

function openGame(id){
  const fn = GAME_RENDERERS[id];
  if(fn) fn();
}

/* =========================================================
   PRIVACY: briefly reveal a toggle-button choice right after it's
   clicked, then blur it again (see the .toggle-pair button.on.just-set
   CSS rule). One delegated listener covers every game that uses
   .toggle-pair — false-consensus, availability, framing,
   prisoners-dilemma — without each of them needing their own timer.
========================================================= */
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.toggle-pair button');
  if(!btn) return;
  btn.classList.add('just-set');
  clearTimeout(btn._peekTimer);
  btn._peekTimer = setTimeout(()=>{ btn.classList.remove('just-set'); }, 1400);
});

/* =========================================================
   BOOT
========================================================= */
renderHome();
