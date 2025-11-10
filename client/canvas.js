// client/canvas.js
const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const toolbar = document.getElementById('toolbar');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - (toolbar ? toolbar.offsetHeight : 0);
}
window.addEventListener('resize', resize);
resize();

// Toolbar elements
const colorEl = document.getElementById('color');
const widthEl = document.getElementById('width');
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');
const clientsEl = document.getElementById('clients');

let drawing = false;
let path = [];
let sendBuffer = [];
let lastSendTime = 0;
const SEND_INTERVAL = 50;

// Snapshotting
let roomHistory = [];
let snapshots = [];
const SNAPSHOT_INTERVAL = 20;

// ------------ Drawing helpers ------------
function drawSegment(p1, p2, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

function redrawFromHistory() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let lastSnapshot = null;
  for (let i = snapshots.length - 1; i >= 0; i--) {
    if (snapshots[i].index <= roomHistory.length) {
      lastSnapshot = snapshots[i];
      break;
    }
  }

  if (lastSnapshot) {
    ctx.putImageData(lastSnapshot.imageData, 0, 0);
    const startIndex = lastSnapshot.index;
    const opsToReplay = roomHistory.slice(startIndex);
    opsToReplay.forEach((op) => {
      if (op.state !== 'active') return;
      const c = op.chunk;
      for (let i = 1; i < c.path.length; i++) {
        drawSegment(c.path[i - 1], c.path[i], c.color, c.width);
      }
    });
  } else {
    roomHistory.forEach((op) => {
      if (op.state !== 'active') return;
      const c = op.chunk;
      for (let i = 1; i < c.path.length; i++) {
        drawSegment(c.path[i - 1], c.path[i], c.color, c.width);
      }
    });
  }
}

function takeSnapshot() {
  try {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    snapshots.push({ index: roomHistory.length, imageData });
    if (snapshots.length > 5) snapshots.shift();
  } catch (err) {
    console.warn('snapshot failed', err);
  }
}

// ------------ Drawing events ------------
canvas.addEventListener('pointerdown', (e) => {
  drawing = true;
  path = [{ x: e.clientX, y: e.clientY }];
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing) {
    // send cursor position occasionally
    if (Date.now() % 200 < 20) socket.emit('cursor', { x: e.clientX, y: e.clientY });
    return;
  }

  const p = { x: e.clientX, y: e.clientY };
  path.push(p);

  // local immediate draw
  const a = path[path.length - 2];
  const b = path[path.length - 1];
  if (a) drawSegment(a, b, colorEl.value, +widthEl.value);

  // buffer points to send
  sendBuffer.push(p);
  const now = Date.now();
  if (now - lastSendTime > SEND_INTERVAL) {
    const buffered = sendBuffer.slice();
    sendBuffer = [];
    lastSendTime = now;
    socket.emit('strokeChunk', {
      path: buffered,
      color: colorEl.value,
      width: +widthEl.value,
    });
  }
});

canvas.addEventListener('pointerup', () => {
  if (!drawing) return;
  drawing = false;

  if (sendBuffer.length) {
    socket.emit('strokeChunk', {
      path: sendBuffer.slice(),
      color: colorEl.value,
      width: +widthEl.value,
      final: true,
    });
    sendBuffer = [];
  }

  if (roomHistory.length > 0 && roomHistory.length % SNAPSHOT_INTERVAL === 0) {
    takeSnapshot();
  }
});

// ------------ Undo / Redo ------------
undoBtn.addEventListener('click', () => {
  socket.emit('undoRequest', {});
});

redoBtn.addEventListener('click', () => {
  socket.emit('redoRequest');
});

// ------------ Socket events ------------
socket.on('connect', () => {
  const username = 'user-' + Math.floor(Math.random() * 1000);
  socket.emit('join', { roomId: 'main', username, color: colorEl.value });
});

socket.on('roomState', (data) => {
  roomHistory = data.history || [];
  redrawFromHistory();
});

socket.on('strokeChunk', (op) => {
  // ensure color and width present
  if (!op || !op.chunk) return;
  const c = op.chunk;
  roomHistory.push(op);
  for (let i = 1; i < c.path.length; i++) {
    drawSegment(c.path[i - 1], c.path[i], c.color || '#000000', c.width || 3);
  }
  if (roomHistory.length % SNAPSHOT_INTERVAL === 0) takeSnapshot();
});

socket.on('undoApplied', ({ opId, history }) => {
  roomHistory = history || roomHistory.filter((o) => o.id !== opId);
  redrawFromHistory();
});

socket.on('redoApplied', ({ op, history }) => {
  if (history) roomHistory = history;
  else if (op) roomHistory.push(op);
  redrawFromHistory();
});

socket.on('clients', (clients) => {
  if (clientsEl)
    clientsEl.textContent =
      'Users: ' + Object.values(clients).map((c) => c.username).join(', ');
});

// ------------ Cursor Rendering ------------
const remoteCursors = {};
socket.on('cursor', (c) => {
  remoteCursors[c.socketId] = { x: c.x, y: c.y, ts: Date.now() };
});

function renderCursors() {
  const now = Date.now();
  for (const id in remoteCursors) {
    const cur = remoteCursors[id];
    if (now - cur.ts > 1500) {
      delete remoteCursors[id];
      continue;
    }
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.arc(cur.x, cur.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  requestAnimationFrame(renderCursors);
}
requestAnimationFrame(renderCursors);

// optional manual history request
function requestFullHistory() {
  socket.emit('requestFullHistory');
}
