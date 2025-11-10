// client/canvas.js
const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Resize canvas to full screen
function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Toolbar elements
const colorEl = document.getElementById('color');
const widthEl = document.getElementById('width');
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');
const clientsEl = document.getElementById('clients');

// Drawing state
let drawing = false;
let path = [];
let sendBuffer = [];
let lastSendTime = 0;
const SEND_INTERVAL = 50;

// --- Snapshot system (performance optimization) ---
let snapshots = [];
const SNAPSHOT_INTERVAL = 20; // take a snapshot every 20 strokes
let roomHistory = [];

// Take a snapshot of the current canvas state
function takeSnapshot() {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  snapshots.push({ index: roomHistory.length, imageData });
}

// Restore from the latest snapshot (instead of redrawing everything)
function redrawFromHistory() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Find last snapshot to speed up re-render
  const lastSnapshot = snapshots
    .slice()
    .reverse()
    .find((s) => s.index <= roomHistory.length);

  if (lastSnapshot) {
    ctx.putImageData(lastSnapshot.imageData, 0, 0);
    const opsToReplay = roomHistory.slice(lastSnapshot.index);
    for (const op of opsToReplay) {
      if (op.state !== 'active') continue;
      const c = op.chunk;
      for (let i = 1; i < c.path.length; i++) {
        drawSegment(c.path[i - 1], c.path[i], c.color, c.width);
      }
    }
  } else {
    // No snapshot yet — full redraw
    for (const op of roomHistory) {
      if (op.state !== 'active') continue;
      const c = op.chunk;
      for (let i = 1; i < c.path.length; i++) {
        drawSegment(c.path[i - 1], c.path[i], c.color, c.width);
      }
    }
  }
}

// --- Drawing logic ---
canvas.addEventListener('pointerdown', (e) => {
  drawing = true;
  path = [{ x: e.clientX, y: e.clientY }];
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const p = { x: e.clientX, y: e.clientY };
  path.push(p);

  // Draw locally
  const a = path[path.length - 2];
  const b = path[path.length - 1];
  if (a) drawSegment(a, b, colorEl.value, +widthEl.value);

  // Buffer for sending
  sendBuffer.push(p);
  const now = Date.now();

  if (now - lastSendTime > SEND_INTERVAL) {
    socket.emit('strokeChunk', {
      path: sendBuffer.slice(),
      color: colorEl.value,
      width: +widthEl.value,
    });
    sendBuffer = [];
    lastSendTime = now;
  }

  // Occasionally send cursor position
  if (now % 200 < 20) socket.emit('cursor', { x: e.clientX, y: e.clientY });
});

canvas.addEventListener('pointerup', () => {
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

  // Every few strokes, capture a snapshot for faster undo/redo redraws
  if (roomHistory.length % SNAPSHOT_INTERVAL === 0 && roomHistory.length > 0) {
    takeSnapshot();
  }
});

// --- Drawing helper ---
function drawSegment(p1, p2, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

// --- Socket events ---
socket.on('connect', () => {
  const username = 'user-' + Math.floor(Math.random() * 1000);
  socket.emit('join', { roomId: 'main', username, color: colorEl.value });
});

// Update user list
socket.on('clients', (clients) => {
  clientsEl.textContent =
    'Users: ' + Object.values(clients).map((x) => x.username).join(', ');
});

// Receive full room state
socket.on('roomState', (data) => {
  roomHistory = data.history || [];
  redrawFromHistory();
});

// Handle incoming strokes
socket.on('strokeChunk', (op) => {
  roomHistory.push(op);
  const c = op.chunk;
  for (let i = 1; i < c.path.length; i++) {
    drawSegment(c.path[i - 1], c.path[i], c.color, c.width);
  }
});

// Undo / Redo responses
socket.on('undoApplied', ({ opId }) => {
  const op = roomHistory.find((o) => o.id === opId);
  if (op) op.state = 'undone';
  redrawFromHistory();
});

socket.on('redoApplied', ({ op }) => {
  roomHistory.push(op);
  redrawFromHistory();
});

// --- Undo / Redo requests from toolbar ---
undoBtn.addEventListener('click', () => {
  socket.emit('undoRequest');
});

redoBtn.addEventListener('click', () => {
  socket.emit('redoRequest');
});

// --- Remote cursor visualization ---
const remoteCursors = {};
socket.on('cursor', (c) => {
  remoteCursors[c.socketId] = { x: c.x, y: c.y, ts: Date.now() };
});

function renderCursors() {
  for (const id in remoteCursors) {
    const cur = remoteCursors[id];
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

// --- Optional: simplify paths before sending ---
function simplifyPath(points, minDist = 2) {
  if (!points.length) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - out[out.length - 1].x;
    const dy = points[i].y - out[out.length - 1].y;
    if (Math.hypot(dx, dy) >= minDist) out.push(points[i]);
  }
  return out;
}
