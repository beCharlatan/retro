/* =========================================================
   HOME VIEW
========================================================= */

import { openGame } from './router.js';
import { app, avatarHTML, CATEGORY, GAMES, STRUCTURE, state } from './state.js';
import { showToast } from './toast.js';

export function renderHome() {
  const catFilters = [
    { id: 'all', label: 'Все' },
    ...Object.keys(CATEGORY).map((k) => ({ id: k, label: CATEGORY[k].label })),
  ];
  const structFilters = [
    { id: 'all', label: 'Все' },
    ...Object.keys(STRUCTURE).map((k) => ({ id: k, label: STRUCTURE[k].label })),
  ];

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
  renderFilterGroup(
    'filters',
    catFilters,
    () => state.filter,
    (id) => {
      state.filter = id;
    },
  );
  renderFilterGroup(
    'structure-filters',
    structFilters,
    () => state.structureFilter,
    (id) => {
      state.structureFilter = id;
    },
  );
  renderGameGrid();
  document.getElementById('random-game-btn').addEventListener('click', pickRandomGame);
}

function getFilteredReadyGames() {
  return GAMES.filter(
    (g) =>
      g.ready &&
      (state.filter === 'all' || g.category === state.filter) &&
      (state.structureFilter === 'all' || g.structure === state.structureFilter),
  );
}

function pickRandomGame() {
  const pool = getFilteredReadyGames();
  if (!pool.length) {
    showToast('Нет доступных игр с такими фильтрами');
    return;
  }
  const g = pool[Math.floor(Math.random() * pool.length)];
  openGame(g.id);
}

function renderParticipantsPanel() {
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
  state.participants.forEach((name, i) => {
    const c = document.createElement('span');
    c.className = 'chip';
    c.innerHTML = `${avatarHTML(name)}${name} <button class="chip-x" data-i="${i}" aria-label="Удалить ${name}">×</button>`;
    chips.appendChild(c);
  });
  chips.querySelectorAll('.chip-x').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const i = +e.currentTarget.dataset.i;
      state.participants.splice(i, 1);
      renderParticipantsPanel();
    });
  });

  const input = document.getElementById('new-participant');
  const addBtn = document.getElementById('add-participant-btn');
  function addParticipant() {
    const v = input.value.trim();
    if (!v) return;
    state.participants.push(v);
    renderParticipantsPanel();
  }
  addBtn.addEventListener('click', addParticipant);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addParticipant();
    }
  });
}

function renderFilterGroup(containerId, options, getActive, onSelect) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  options.forEach((f) => {
    const btn = document.createElement('button');
    btn.className = 'filter-pill' + (getActive() === f.id ? ' active' : '');
    btn.textContent = f.label;
    btn.addEventListener('click', () => {
      onSelect(f.id);
      renderFilterGroup(containerId, options, getActive, onSelect);
      renderGameGrid();
    });
    el.appendChild(btn);
  });
}

function renderGameGrid() {
  const grid = document.getElementById('game-grid');
  grid.innerHTML = '';
  const list = GAMES.filter(
    (g) =>
      (state.filter === 'all' || g.category === state.filter) &&
      (state.structureFilter === 'all' || g.structure === state.structureFilter),
  );
  if (!list.length) {
    grid.innerHTML = `<p class="note" style="grid-column:1/-1;">Нет игр с такими фильтрами — попробуйте сбросить один из них.</p>`;
    return;
  }
  list.forEach((g) => {
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
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = toggle.classList.toggle('open');
      teaserEl.hidden = !isOpen;
      toggleLabel.textContent = isOpen ? 'Скрыть' : 'Что это?';
    });
    card.addEventListener('click', () => {
      if (g.ready) {
        openGame(g.id);
      } else {
        showToast(`«${g.name}» скоро добавим`);
      }
    });
    grid.appendChild(card);
  });
}
