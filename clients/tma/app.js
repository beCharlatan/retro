/* =========================================================
   MINI APP CLIENT — facilitator + participant in one bundle
   =========================================================
   Role is decided by how the app was opened:
     - no session code anywhere → facilitator (a session is created
       for them on the server);
     - ?join=CODE or Telegram start_param=CODE → participant.
   State comes from the server as whole-session snapshots
   (see server/protocol.js) — this file only renders snapshots and
   sends the few client messages. Participant form values live in
   `form` between snapshots so a broadcast never wipes a half-typed
   answer.
========================================================= */

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

import { toPng } from 'html-to-image';

const params = new URLSearchParams(location.search);
const sessionCode = (tg?.initDataUnsafe?.start_param || params.get('join') || '')
  .trim()
  .toUpperCase();

// Local dev without Telegram: ?dev=Имя declares the debug user the
// server accepts when no BOT_TOKEN is configured (server/auth.js).
function initData() {
  if (tg?.initData) return tg.initData;
  return JSON.stringify({ dev: true, user: { name: params.get('dev') ?? 'Разработчик' } });
}

const state = {
  role: sessionCode ? 'participant' : 'facilitator',
  you: null,
  snapshot: null,
  connected: false,
  form: {}, // participant's draft answers, keyed by field key
  formRound: -1, // the round `form` belongs to (fields change per round)
  editing: null, // facilitator: { tgId, name } row being edited
  dispatched: null, // facilitator: last dispatch result for the modal
};

// ---------- websocket ----------

const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
let ws = null;
let reconnectDelay = 500;

function connect() {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => {
    reconnectDelay = 500;
    state.connected = true;
    send({
      t: 'auth',
      initData: initData(),
      role: state.role,
      ...(sessionCode ? { sessionId: sessionCode } : {}),
    });
  };
  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.t === 'hello') {
      state.you = msg.you;
      if (msg.sessionId && !sessionCode) history.replaceState(null, '', `?s=${msg.sessionId}`);
    } else if (msg.t === 'session') {
      state.snapshot = msg.snapshot;
      render();
    } else if (msg.t === 'dispatched') {
      state.dispatched = msg.items;
      renderDispatchModal(msg.items);
    } else if (msg.t === 'error') {
      toast(msg.message);
      if (msg.code === 'no_session' || msg.code === 'auth_failed') {
        state.fatal = msg.message;
        render();
      }
    }
  };
  ws.onclose = () => {
    state.connected = false;
    render();
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 5000);
  };
  ws.onerror = () => ws.close();
}

function send(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// ---------- rendering ----------

const app = document.getElementById('app');
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function render() {
  if (state.fatal) {
    app.innerHTML = `<div class="status"><h2>Не получилось войти</h2><p>${esc(state.fatal)}</p></div>`;
    return;
  }
  if (!state.snapshot) {
    app.innerHTML = `<div class="status">${state.connected ? 'Подключаемся…' : 'Соединение…'}</div>`;
    return;
  }
  if (state.role === 'facilitator') renderFacilitator();
  else renderParticipant();
}

// Player chips: Telegram avatar when the profile provided photo_url,
// initials otherwise (the img hides itself on error — CDN links can
// expire). Facilitator gets profile links (t.me/username) and a ✎ to
// rename; a participant gets a rename control on their own chip.
function playerChips(players, { links = false, renameable = false } = {}) {
  return `<div class="chips">${players
    .map((p) => {
      const initial = esc((p.name || '?').trim().charAt(0).toUpperCase());
      const avatar = p.avatarUrl
        ? `<img class="chip-avatar" src="${esc(p.avatarUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'">`
        : '';
      const label =
        links && p.username
          ? `<a href="https://t.me/${esc(p.username)}" target="_blank" rel="noopener">${esc(p.name)}</a>`
          : esc(p.name);
      const edit =
        renameable || p.tgId === state.you?.tgId
          ? `<button class="chip-edit" data-rename="${p.tgId}" aria-label="Переименовать">✎</button>`
          : '';
      return `<span class="chip ${p.tgId === state.you?.tgId ? 'me' : ''}">
           <span class="chip-avatar-box">${avatar}<i>${initial}</i></span>
           <span class="dot ${p.answered ? 'on' : ''}"></span>${label}${p.role === 'facilitator' ? ' · ведущий' : ''}${edit}
         </span>`;
    })
    .join('')}</div>`;
}

function wireRename(root) {
  root.querySelectorAll('[data-rename]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = state.snapshot.players.find((x) => x.tgId === Number(btn.dataset.rename));
      const name = prompt('Имя в этой сессии:', p?.name ?? '');
      if (name && name.trim()) {
        send({
          t: 'rename',
          name: name.trim(),
          ...(state.role === 'facilitator' ? { tgId: Number(btn.dataset.rename) } : {}),
        });
      }
    });
  });
}

// ----- facilitator -----

function renderFacilitator() {
  const s = state.snapshot;
  const game = s.game;

  if (s.phase === 'lobby' || !game) {
    app.innerHTML = `
      <div class="eyebrow">5 минут общего развития — онлайн</div>
      <h1>Сессия ${esc(s.id)}</h1>
      <div class="card accent stack">
        <div class="eyebrow">Код для участников</div>
        <div class="code">${esc(s.id)}</div>
        <button class="primary" id="share">Пригласить участников</button>
      </div>
      <div class="card stack">
        <div class="row spread"><b>В комнате: ${s.players.length}</b><span class="count">зелёная точка — ответил · ✎ — имя на эту сессию</span></div>
        ${playerChips(s.players, { links: true, renameable: true })}
      </div>
      <div class="card stack">
        <div class="eyebrow">Выберите игру</div>
        ${s.games
          .map(
            (g) => `
          <button class="game-item" data-start="${esc(g.id)}">
            <span><b>${esc(g.name)}</b><br><span class="meta">${esc(g.category)} · от ${g.minPlayers} участников${g.rounds > 1 ? ` · ${g.rounds} раунда` : ''}</span></span>
            <span aria-hidden="true">→</span>
          </button>`,
          )
          .join('')}
      </div>`;
    bind('#share', () => {
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(s.joinLink)}`);
      } else if (navigator.share) {
        navigator.share({ title: '5 минут общего развития', url: s.joinLink }).catch(() => {});
      } else {
        navigator.clipboard?.writeText(s.joinLink);
        toast('Ссылка скопирована');
      }
    });
    bindAll('[data-start]', (el) => send({ t: 'start', gameId: el.dataset.start }));
    wireRename(app);
    return;
  }

  if (s.phase === 'collect') {
    const participants = s.players.filter((p) => p.role === 'participant');
    const isLastRound = game.round.index >= game.round.total - 1;
    app.innerHTML = `
      <div class="eyebrow">${esc(game.name)}</div>
      <h1>${game.round.total > 1 ? esc(game.round.title) : 'Сбор ответов'}</h1>
      ${timerHtml(game.round.timer)}
      ${recapHtml(game.recap)}
      ${rosterHtml(game.roster)}
      <div class="card stack">
        <div class="row spread"><b>Внесено ${game.answered} из ${participants.length}</b><span class="count">${game.editable ? 'нажмите на строку, чтобы поправить' : 'правка — через переответ участника'}</span></div>
        ${
          game.entries.length
            ? `<table>
            <thead><tr><th>${game.structure === 'solo' ? 'Участник' : 'Пара / участник'}</th>${game.entries[0].cells.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
            <tbody>
              ${game.entries
                .map(
                  (e, i) => `
                <tr class="${game.editable ? 'tappable' : ''}" ${game.editable ? `data-edit="${i}"` : ''}>
                  <td>${esc(e.name)}${e.tag ? ` <span class="hint">${esc(e.tag)}</span>` : ''}</td>
                  ${e.cells.map((c) => `<td>${esc(c.value)}</td>`).join('')}
                </tr>`,
                )
                .join('')}
            </tbody>
          </table>`
            : '<div class="status">Пока никто не ответил. Отправьте участникам ссылку из лобби.</div>'
        }
      </div>
      <div class="stack">
        ${
          isLastRound
            ? `<button class="primary big" id="reveal">Показать результаты</button>`
            : `<button class="primary big" id="advance">Следующий раунд</button>`
        }
        <div class="row">
          ${
            game.dispatchable ? `<button id="dispatch" style="flex:1">Раздать в личку</button>` : ''
          }
          ${game.timerSupported ? `<button id="timer" style="flex:1">Запустить таймер</button>` : ''}
        </div>
        <button class="ghost" id="toLobby">Сменить игру</button>
      </div>`;
    bind('#reveal', () => send({ t: 'reveal' }));
    bind('#advance', () => send({ t: 'advance' }));
    bind('#timer', () => send({ t: 'timer' }));
    bind('#dispatch', () => send({ t: 'dispatch' }));
    bind('#toLobby', () => {
      if (game.entries.length === 0 || confirm('Вернуться к выбору игры? Ответы сохранятся.')) {
        send({ t: 'toLobby' });
      }
    });
    if (game.editable) {
      bindAll('[data-edit]', (el) => {
        state.editing = game.entries[Number(el.dataset.edit)];
        renderEditModal(game);
      });
    }
    return;
  }

  // results
  app.innerHTML = `
    <div class="eyebrow">${esc(game.name)}</div>
    <h1>Результаты команды</h1>
    <div class="card accent">
      <div class="headline">${esc(game.results.headline)}</div>
      <p style="text-align:center;margin:0">${esc(game.results.detail)}</p>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Участник</th>${game.entries.length ? game.entries[0].cells.map((c) => `<th>${esc(c.label)}</th>`).join('') : ''}</tr></thead>
        <tbody>
          ${game.entries
            .map(
              (e) =>
                `<tr><td>${esc(e.name)}</td>${e.cells.map((c) => `<td>${esc(c.value)}</td>`).join('')}</tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <div class="stack">
      <button class="primary big" id="back">Вернуться к сбору</button>
      <div class="row">
        <button id="export" style="flex:1">Скачать PNG-отчёт</button>
        <button class="ghost" id="restart" style="flex:1">Начать заново</button>
      </div>
    </div>`;
  bind('#back', () => send({ t: 'back' }));
  bind('#restart', () => {
    if (confirm('Стереть все ответы и собрать заново?')) send({ t: 'restart' });
  });
  bind('#export', () => exportReport(s, game));
}

// A branded PNG report of the results screen — the online counterpart
// of the offline report-export.js: same paper-and-ink look, built into
// an offscreen node, rasterized at 2× (1080px wide).
async function exportReport(s, game) {
  const date = new Date().toLocaleDateString('ru-RU');
  const node = document.createElement('div');
  node.style.cssText =
    'position:fixed;left:-10000px;top:0;width:540px;background:#fafafa;color:#333;' +
    "font-family:Georgia,'Times New Roman',serif;padding:36px;";
  node.innerHTML = `
    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b">
      5 минут общего развития · ${esc(date)}
    </div>
    <h1 style="font-size:30px;margin:6px 0 2px">${esc(game.name)}</h1>
    <div style="font-size:14px;color:#6b6b6b;margin-bottom:24px">
      Участников: ${s.players.filter((p) => p.role === 'participant').length} · сессия ${esc(s.id)}
    </div>
    <div style="background:#cfdfff;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px">
      <div style="font-size:64px;font-weight:700;color:#2750ae;line-height:1">${esc(game.results.headline)}</div>
      <div style="font-size:15px;color:#102046;margin-top:8px">${esc(game.results.detail)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;font-family:system-ui,sans-serif">
      <thead><tr>
        <th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e0e0e0;color:#6b6b6b;font-size:12px">${game.structure === 'solo' ? 'Участник' : 'Пара / участник'}</th>
        ${game.entries[0]?.cells.map((c) => `<th style="text-align:left;padding:6px 8px;border-bottom:1px solid #e0e0e0;color:#6b6b6b;font-size:12px">${esc(c.label)}</th>`).join('') ?? ''}
      </tr></thead>
      <tbody>
        ${game.entries
          .map(
            (e) => `<tr>
          <td style="padding:7px 8px;border-bottom:1px solid #e0e0e0">${esc(e.name)}</td>
          ${e.cells.map((c) => `<td style="padding:7px 8px;border-bottom:1px solid #e0e0e0">${esc(c.value)}</td>`).join('')}
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;
  document.body.appendChild(node);
  try {
    const url = await toPng(node, { pixelRatio: 2 });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${game.name.replaceAll(' ', '_')}_${date}.png`;
    a.click();
    toast('Отчёт скачан');
  } catch {
    toast('Не получилось собрать PNG');
  } finally {
    node.remove();
  }
}

function renderEditModal(game) {
  const row = state.editing;
  const flat = { ...(row.flat ?? {}) };
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal stack" role="dialog" aria-label="Правка ответа">
      <h2>${esc(row.name)}</h2>
      ${fieldsHtml(game.fields, flat)}
      <div class="row">
        <button class="primary" id="save" style="flex:1">Сохранить</button>
        <button class="ghost" id="cancel">Отмена</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  wireFields(backdrop, game.fields, flat);
  backdrop.querySelector('#cancel').addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('#save').addEventListener('click', () => {
    send({ t: 'edit', tgId: row.tgId, answers: flat });
    backdrop.remove();
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
}

// ----- participant -----

function renderParticipant() {
  const s = state.snapshot;
  const game = s.game;

  if (!game || s.phase === 'lobby') {
    app.innerHTML = `
      <div class="status">
        <h1>Вы в комнате ${esc(s.id)}</h1>
        <p>Ведущий выбирает игру — как только начнётся сбор, здесь появятся вопросы.</p>
        ${playerChips(s.players)}
      </div>`;
    wireRename(app);
    return;
  }

  if (s.phase === 'collect') {
    // Fields are round-scoped: on a new round the draft starts over,
    // prefilled with what the server has for me this round.
    if (state.formRound !== game.round.index) {
      state.formRound = game.round.index;
      state.form = { ...(game.my?.answers ?? {}) };
    }
    const mine = state.form;
    const hasValue = Object.values(mine).some((v) => v !== null && v !== undefined && v !== '');
    app.innerHTML = `
      <div class="eyebrow">${esc(game.name)}</div>
      <h1>${game.round.total > 1 ? esc(game.round.title) : esc(game.rules.items[0]?.title ?? 'Ваши ответы')}</h1>
      ${timerHtml(game.round.timer)}
      ${
        game.my?.info
          ? `<div class="card accent"><div class="eyebrow">Ваша роль</div><div>${esc(game.my.info)}</div></div>`
          : ''
      }
      <div class="card stack">
        ${game.rules.items
          .map((item) => `<div><b>${esc(item.title)}.</b> ${esc(item.text)}</div>`)
          .join('')}
      </div>
      <div class="card stack">
        ${fieldsHtml(game.fields ?? [], mine)}
        <button class="primary big" id="submit">Отправить ведущему</button>
        <div class="count" style="text-align:center">${hasValue ? '<span class="ok">✓ Ответ у ведущего — можно править до конца сбора</span>' : 'Ответ увидит только ведущий'}</div>
      </div>`;
    wireFields(app, game.fields ?? [], mine);
    bind('#submit', () => {
      send({ t: 'answer', answers: { ...mine } });
      toast('Отправлено');
    });
    return;
  }

  // results
  app.innerHTML = `
    <div class="eyebrow">${esc(game.name)}</div>
    <h1>Результаты</h1>
    <div class="card accent">
      <div class="headline">${esc(game.results.headline)}</div>
      <p style="text-align:center;margin:0">${esc(game.results.detail)}</p>
    </div>
    <div class="status">Ведущий может вернуться к сбору и запустить ещё раунд.</div>`;
}

// ----- shared form bits -----

// Advisory countdown: the snapshot carries `timer.remaining` at send
// time; the ticker below re-renders the slot every second until it
// hits zero, then waits for the server's 'done' broadcast.
function timerHtml(timer) {
  if (!timer) return '';
  return `<div class="card accent" id="timer-card" data-remaining="${timer.remaining}" data-state="${timer.state}">
    <div class="eyebrow">Время на раунд</div>
    <div class="code" data-timer-face>${timerFace(timer.remaining)}</div>
  </div>`;
}

function timerFace(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

setInterval(() => {
  document.querySelectorAll('#timer-card').forEach((card) => {
    if (card.dataset.state !== 'running') return;
    const left = Math.max(0, Number(card.dataset.remaining) - 1);
    card.dataset.remaining = String(left);
    if (left === 0) card.dataset.state = 'done';
    const face = card.querySelector('[data-timer-face]');
    if (face) face.textContent = timerFace(left);
  });
}, 1000);

// Between-round recap (aggregate lines from the declaration).
function recapHtml(recap) {
  if (!recap?.length) return '';
  return `<div class="card stack"><div class="eyebrow">Что было</div>
    ${recap.map((line) => `<div>${esc(line)}</div>`).join('')}</div>`;
}

function rosterHtml(roster) {
  if (!roster) return '';
  if (roster.kind === 'pairs') {
    return `<div class="card stack"><div class="eyebrow">${esc(roster.title)}</div>
      ${roster.pairs
        .map(
          (p) =>
            `<div class="row spread"><span>${esc(p.a)} ↔ ${esc(p.b)}</span>${p.trio ? '<span class="hint">трио</span>' : ''}</div>`,
        )
        .join('')}</div>`;
  }
  if (roster.kind === 'groups') {
    return `<div class="card stack"><div class="eyebrow">${esc(roster.title)}</div>
      ${roster.groups
        .map(
          (g) =>
            `<div><b>${esc(g.label)}</b><div class="chips" style="margin-top:4px">${g.names
              .map((n) => `<span class="chip">${esc(n)}</span>`)
              .join('')}</div></div>`,
        )
        .join('')}</div>`;
  }
  return '';
}

// What the bot sent everyone (and what it could not) — in production
// the texts land in DMs; in dev (no bot) this modal IS the delivery.
function renderDispatchModal(items) {
  document.querySelector('.modal-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal stack" role="dialog" aria-label="Раздача в личку">
      <h2>Раздача в личку</h2>
      ${items
        .map(
          (item, i) => `
        <div class="card stack">
          <div class="row spread"><b>${esc(item.name)}</b><span class="${item.delivered ? 'ok' : 'hint'}">${item.delivered ? '✓ доставлено ботом' : 'не доставлено — скопируйте вручную'}</span></div>
          <pre style="white-space:pre-wrap;font-size:13px;margin:0">${esc(item.text)}</pre>
          <button data-copy="${i}" class="ghost">Скопировать текст</button>
        </div>`,
        )
        .join('')}
      <button class="primary" id="close-dispatch">Готово</button>
    </div>`;
  document.body.appendChild(backdrop);
  items.forEach((item, i) => {
    backdrop.querySelector(`[data-copy="${i}"]`)?.addEventListener('click', () => {
      navigator.clipboard?.writeText(item.text);
      toast(`Текст для ${item.name} скопирован`);
    });
  });
  backdrop.querySelector('#close-dispatch').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
}

function fieldsHtml(fields, values) {
  return fields
    .map((f) => {
      if (f.kind === 'choice') {
        return `
        <div class="field" data-field="${esc(f.key)}">
          <span>${esc(f.label)}</span>
          <div class="choice">
            ${f.options
              .map(
                (o) =>
                  `<button type="button" data-choice="${esc(o.value)}" class="${values[f.key] === o.value ? 'picked' : ''}">${esc(o.label)}</button>`,
              )
              .join('')}
          </div>
        </div>`;
      }
      if (f.kind === 'text') {
        return `
        <label class="field" data-field="${esc(f.key)}">
          <span>${esc(f.label)}${f.hint ? ` <span class="hint">${esc(f.hint)}</span>` : ''}</span>
          <textarea rows="3" placeholder="Пара предложений, своими словами…">${esc(values[f.key] ?? '')}</textarea>
        </label>`;
      }
      return `
      <label class="field" data-field="${esc(f.key)}">
        <span>${esc(f.label)}${f.hint ? ` <span class="hint">${esc(f.hint)}</span>` : ''}</span>
        <input type="number" inputmode="numeric" value="${values[f.key] ?? ''}" placeholder="—">
      </label>`;
    })
    .join('');
}

function wireFields(root, fields, values) {
  for (const f of fields) {
    const box = root.querySelector(`[data-field="${f.key}"]`);
    if (!box) continue;
    if (f.kind === 'choice') {
      box.querySelectorAll('[data-choice]').forEach((btn) => {
        btn.addEventListener('click', () => {
          values[f.key] = btn.dataset.choice;
          box.querySelectorAll('[data-choice]').forEach((b) => {
            b.classList.toggle('picked', b === btn);
          });
        });
      });
    } else {
      const input = box.querySelector('input, textarea');
      input.addEventListener('input', () => {
        values[f.key] =
          input.value === ''
            ? null
            : input.tagName === 'TEXTAREA'
              ? input.value
              : Number(input.value);
      });
    }
  }
}

// ---------- tiny helpers ----------

function bind(selector, fn) {
  app.querySelector(selector)?.addEventListener('click', fn);
}

function bindAll(selector, fn) {
  app.querySelectorAll(selector).forEach((el) => {
    el.addEventListener('click', () => fn(el));
  });
}

let toastTimer = null;
function toast(text) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

connect();
render();
