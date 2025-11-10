// client/canvas.js
const socket = io();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
window.addEventListener('resize', resize);
resize();

// toolbar elements
const colorEl = document.getElementById('color');
const widthEl = document.getElementById('width');
const undoBtn = document.getElementById('undo');
const clientsEl = document.getElementById('clients');

let drawing = false;
let path = [];
let sendBuffer = [];
let lastSendTime = 0;
const SEND_INTERVAL = 50;

canvas.addEventListener('pointerdown', (e) => {
  drawing = true;
  path = [{ x: e.clientX, y: e.clientY }];
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const p = { x: e.clientX, y: e.clientY };
  path.push(p);
  // draw locally
  const a = path[path.length - 2];
  const b = path[path.length - 1];
  if (a) drawSegment(a, b, colorEl.value, +widthEl.value);
  // buffer points for sending
  sendBuffer.push(p);
  const now = Date.now();
  if (now - lastSendTime > SEND_INTERVAL) {
    socket.emit('strokeChunk', { path: sendBuffer.slice(), color: colorEl.value, width: +widthEl.value });
    sendBuffer = [];
    lastSendTime = now;
  }
  // send cursor occasionally
  if (now % 200 < 20) socket.emit('cursor', { x: e.clientX, y: e.clientY });
});

canvas.addEventListener('pointerup', () => {
  drawing = false;
  if (sendBuffer.length) {
    socket.emit('strokeChunk', { path: sendBuffer.slice(), color: colorEl.value, width: +widthEl.value, final: true });
    sendBuffer = [];
  }
});

// local draw helper
function drawSegment(p1, p2, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

// socket events
socket.on('connect', () => {
  const username = 'user-' + Math.floor(Math.random() * 1000);
  const color = colorEl.value;
  socket.emit('join', { roomId: 'main', username, color });
});

socket.on('strokeChunk', (op) => {
  // op contains chunk and meta
  const c = op.chunk;
  for (let i = 1; i < c.path.length; i++) {
    drawSegment(c.path[i-1], c.path[i], c.color, c.width);
  }
});

socket.on('clients', (clients) => {
  clientsEl.textContent = 'Users: ' + Object.values(clients).map(x => x.username).join(', ');
});

undoBtn.addEventListener('click', () => {
  socket.emit('undoRequest');
});
