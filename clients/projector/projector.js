/* =========================================================
   PROJECTOR CLIENT — the room-facing screen, no Telegram needed
   =========================================================
   Opens at /projector?session=CODE (the facilitator shares this
   browser tab in Zoom, like the old postMessage window). Joins the
   session with the read-only 'projector' role and renders the
   snapshot big: rules while collecting, the headline on results.
   Reconnects on its own; everything comes from server snapshots.
========================================================= */

const params = new URLSearchParams(location.search);
const app = document.getElementById('app');
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

let sessionCode = (params.get('session') ?? '').trim().toUpperCase();
let snapshot = null;
let ws = null;
let reconnectDelay = 500;

// Projector auth: no initData — the server only requires a valid
// signature for real roles; 'projector' still passes through auth
// with a dev envelope when no BOT_TOKEN is set.
function authEnvelope() {
  return JSON.stringify({ dev: true, user: { name: 'Экран' } });
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    reconnectDelay = 500;
    ws.send(
      JSON.stringify({
        t: 'auth',
        initData: authEnvelope(),
        role: 'projector',
        sessionId: sessionCode,
      }),
    );
  };
  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.t === 'session') {
      snapshot = msg.snapshot;
      render();
    } else if (msg.t === 'error') {
      renderSetup(msg.message);
    }
  };
  ws.onclose = () => {
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 5000);
  };
  ws.onerror = () => ws.close();
}

function renderSetup(error = '') {
  app.innerHTML = `
    <div class="p-setup card stack">
      <h1>Экран для показа</h1>
      <p class="eyebrow">Введите код сессии, которую ведёт фасилитатор</p>
      <input id="code" type="text" maxlength="5" placeholder="КОД" value="${esc(sessionCode)}">
      <button class="primary big" id="go">Показать</button>
      ${error ? `<div class="status">${esc(error)}</div>` : ''}
    </div>`;
  const go = () => {
    const value = app.querySelector('#code').value.trim().toUpperCase();
    if (!value) return;
    sessionCode = value;
    history.replaceState(null, '', `?session=${value}`);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          t: 'auth',
          initData: authEnvelope(),
          role: 'projector',
          sessionId: value,
        }),
      );
    } else {
      connect();
    }
  };
  app.querySelector('#go').addEventListener('click', go);
  app.querySelector('#code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') go();
  });
}

function render() {
  if (!snapshot) return;
  const game = snapshot.game;

  if (!game || snapshot.phase === 'lobby') {
    const participants = snapshot.players.filter((p) => p.role === 'participant');
    app.innerHTML = `
      <div class="p-eyebrow eyebrow">5 минут общего развития</div>
      <h1 class="p-title">Сессия ${esc(snapshot.id)} — ждём начала</h1>
      <div class="p-count">В комнате: ${snapshot.players.length}</div>
      <div class="p-chips">
        ${participants.map((p) => `<span class="p-chip">${esc(p.name)}</span>`).join('')}
      </div>`;
    return;
  }

  const round = game.round ?? { index: 0, total: 1, title: '' };
  const timer = round.timer;

  if (snapshot.phase === 'collect') {
    app.innerHTML = `
      <div class="p-eyebrow eyebrow">${esc(game.name)}</div>
      <h1 class="p-title">${round.total > 1 ? esc(round.title) : esc(game.rules.items[0]?.title ?? '')}</h1>
      ${timer ? `<div class="p-count" data-state="${timer.state}" data-remaining="${timer.remaining}">${timerFace(timer.remaining)}</div>` : ''}
      <div class="card p-card stack">
        ${game.rules.items.map((item) => `<div><b>${esc(item.title)}.</b> ${esc(item.text)}</div>`).join('')}
      </div>
      ${recapBlock(game.recap)}
      ${rosterBlock(game.roster)}
      <div class="p-count">Внесено ${game.answered} ответов</div>
      ${game.anonymous ? anonymousBlock(game.anonymous) : entriesBlock(game.entries)}`;
    return;
  }

  app.innerHTML = `
    <div class="p-eyebrow eyebrow">${esc(game.name)}</div>
    <div class="p-headline">${esc(game.results.headline)}</div>
    <p class="p-detail">${esc(game.results.detail)}</p>
    ${entriesBlock(game.entries)}
    <div class="p-chips">
      ${snapshot.players
        .filter((p) => p.role === 'participant')
        .map((p) => `<span class="p-chip ${p.answered ? 'on' : ''}">${esc(p.name)}</span>`)
        .join('')}
    </div>`;
}

function timerFace(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

setInterval(() => {
  document.querySelectorAll('[data-remaining]').forEach((el) => {
    if (el.dataset.state !== 'running') return;
    const left = Math.max(0, Number(el.dataset.remaining) - 1);
    el.dataset.remaining = String(left);
    if (left === 0) el.dataset.state = 'done';
    el.textContent = timerFace(left);
  });
}, 1000);

function recapBlock(recap) {
  if (!recap?.length) return '';
  return `<div class="card p-card stack">${recap.map((line) => `<div>${esc(line)}</div>`).join('')}</div>`;
}

function anonymousBlock(anonymous) {
  if (!anonymous?.values?.length) return '';
  // Anonymous games show sorted values only — never who sent what.
  return `<div class="p-chips">${anonymous.values.map((v) => `<span class="p-chip">${esc(v)}</span>`).join('')}</div>`;
}

function rosterBlock(roster) {
  if (!roster) return '';
  if (roster.kind === 'pairs') {
    return `<div class="p-chips">${roster.pairs
      .map((p) => `<span class="p-chip">${esc(p.a)} ↔ ${esc(p.b)}</span>`)
      .join('')}</div>`;
  }
  if (roster.kind === 'groups') {
    return roster.groups
      .map(
        (g) =>
          `<div class="p-count" style="font-size:3.4vmin">${esc(g.label)}: ${g.names.map(esc).join(', ')}</div>`,
      )
      .join('');
  }
  return '';
}

function entriesBlock(entries) {
  if (!entries?.length) return '';
  return `<div class="card p-card"><table>
    <thead><tr><th></th>${entries[0].cells.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>
      ${entries
        .map(
          (e) =>
            `<tr><td>${esc(e.name)}${e.tag ? ` <span style="color:var(--ink-faint)">· ${esc(e.tag)}</span>` : ''}</td>${e.cells
              .map((c) => `<td>${esc(c.value)}</td>`)
              .join('')}</tr>`,
        )
        .join('')}
    </tbody>
  </table></div>`;
}

if (sessionCode) connect();
else renderSetup();
