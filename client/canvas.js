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

// toolbar elements
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

// Rebuild canvas using snapshots if available
function redrawFromHistory() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // find last snapshot with index <= roomHistory.length
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
    // full replay
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
    // limit number of stored snapshots (keep last 5)
    if (snapshots.length > 5) snapshots.shift();
  } catch (err) {
    // getImageData may throw if canvas is tainted; ignore snapshot in that case
    console.warn('snapshot failed', err);
  }
}

// ------------ Pointer events (drawing & batching) ------------
canvas.addEventListener('pointerdown', (e) => {
  drawing = true;
  path = [{ x: e.clientX, y: e.clientY }];
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const p = { x: e.clientX, y: e.clientY };
  path.push(p);

  // local immediate draw
  const a = path[path.length - 2];
  const b = path[path.length - 1];
  if (a) drawSegment(a, b, colorEl.value, +widthEl.value);

  // buffer to send
  sendBuffer.push(p);
  const now = Date.now();
  if (now - lastSendTime > SEND_INTERVAL) {
    const buffered = sendBuffer.slice();
    sendBuffer = [];
    lastSendTime = now;
    socket.emit('strokeChunk', { path: buffered, color: colorEl.value, width: +widthEl.value });
  }

  // occasionally send cursor
  if (now % 200 < 20) socket.emit('cursor', { x: e.clientX, y: e.clientY });
});

canvas.addEventListener('pointerup', () => {
  if (!drawing) return;
  drawing = false;
  if (sendBuffer.length) {
    socket.emit('strokeChunk', { path: sendBuffer.slice(), color: colorEl.value, width: +widthEl.value, final: true });
    sendBuffer = [];
  }

  // After adding op(s) on server, the roomHistory will update via server broadcasts.
  // We can take snapshots locally based on current known history length.
  if (roomHistory.length > 0 && roomHistory.length % SNAPSHOT_INTERVAL === 0) {
    takeSnapshot();
  }
});

// ------------ Undo / Redo UI ----------
undoBtn.addEventListener('click', () => {
  // option: send targetOpId to undo a specific op, but default to last
  socket.emit('undoRequest', {}); // empty => server will undo last active op
});

redoBtn.addEventListener('click', () => {
  socket.emit('redoRequest');
});

// ------------ Socket handlers ------------
socket.on('connect', () => {
  const username = 'user-' + Math.floor(Math.random() * 1000);
  socket.emit('join', { roomId: 'main', username, color: colorEl.value });
});

// receive initial room state
socket.on('roomState', (data) => {
  roomHistory = data.history || [];
  redrawFromHistory();
});

// Receive op broadcast (strokeChunk op)
socket.on('strokeChunk', (op) => {
  // op: { id, socketId, chunk: { path, color, width }, state }
  roomHistory.push(op);
  // draw incoming chunk immediately
  const c = op.chunk;
  for (let i = 1; i < c.path.length; i++) {
    drawSegment(c.path[i - 1], c.path[i], c.color, c.width);
  }
  // if history length reached snapshot boundary take snapshot (optional)
  if (roomHistory.length % SNAPSHOT_INTERVAL === 0) takeSnapshot();
});

// undo applied - server informs about op removed
socket.on('undoApplied', ({ opId, history }) => {
  // update local history if provided (server optionally sends updated history)
  if (history) {
    roomHistory = history;
  } else {
    const idx = roomHistory.findIndex((o) => o.id === opId);
    if (idx !== -1) roomHistory.splice(idx, 1);
  }
  redrawFromHistory();
});

// redo applied - server sends the restored op
socket.on('redoApplied', ({ op, history }) => {
  if (history) roomHistory = history;
  else if (op) roomHistory.push(op);
  redrawFromHistory();
});

socket.on('clients', (clients) => {
  if (clientsEl) clientsEl.textContent = 'Users: ' + Object.values(clients).map((c) => c.username).join(', ');
});

// cursor updates
const remoteCursors = {};
socket.on('cursor', (c) => {
  remoteCursors[c.socketId] = { x: c.x, y: c.y, ts: Date.now() };
});

// render cursors on top (simple approach: redraw overlay each frame)
function renderCursors() {
  // NOTE: this naive method paints cursors on top of canvas which may smear strokes
  // For production, use a separate overlay canvas for cursors.
  for (const id in remoteCursors) {
    const cur = remoteCursors[id];
    if (!cur) continue;
    if (Date.now() - cur.ts > 2000) {
      delete remoteCursors[id];
      continue;
    }
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.arc(cur.x, cur.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  requestAnimationFrame(renderCursors);
}
requestAnimationFrame(renderCursors);

// optional: function to request full history from server
function requestFullHistory() {
  socket.emit('requestFullHistory');
}
