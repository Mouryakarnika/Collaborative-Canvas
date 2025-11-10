(function () {
  // --- Setup socket connection ---
  const socket = WS.connect(getRoomId());

  // --- DOM elements ---
  const canvasEl = document.getElementById('canvas');
  const toolEl = document.getElementById('tool');
  const colorEl = document.getElementById('color');
  const widthEl = document.getElementById('width');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const usersList = document.getElementById('users');
  const roomSpan = document.getElementById('room-id');

  // Display current room ID
  roomSpan.innerText = getRoomId();

  // --- Fit canvas to window ---
  function fitCanvas() {
    canvasEl.style.width = (window.innerWidth - 220) + 'px';
    canvasEl.style.height = (window.innerHeight - 110) + 'px';
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  // --- Initialize Collaborative Canvas ---
  const canvas = CollabCanvas.createCanvas(canvasEl, socket);
  canvas.setOnUsers(updateUserList);

  // --- Current user tool options ---
  let currentTool = 'brush';
  let currentColor = '#000000';
  let currentWidth = 4;

  // --- UI Event Bindings ---
  toolEl.addEventListener('change', () => {
    currentTool = toolEl.value;
  });

  colorEl.addEventListener('change', () => {
    currentColor = colorEl.value;
  });

  widthEl.addEventListener('change', () => {
    currentWidth = parseInt(widthEl.value, 10) || 4;
  });

  undoBtn.addEventListener('click', () => {
    canvas.undo();
  });

  redoBtn.addEventListener('click', () => {
    canvas.redo();
  });

  // --- Mouse Events for Drawing ---
  canvasEl.addEventListener('mousedown', (e) => {
    canvas.pointerDown(e, getMeta());
  });

  canvasEl.addEventListener('mousemove', (e) => {
    canvas.pointerMove(e, getMeta());
  });

  window.addEventListener('mouseup', (e) => {
    canvas.pointerUp(e);
  });

  // --- Touch Events (for mobile support) ---
  canvasEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    canvas.pointerDown(touch, getMeta());
  });

  canvasEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    canvas.pointerMove(touch, getMeta());
  });

  window.addEventListener('touchend', (e) => {
    e.preventDefault();
    canvas.pointerUp(e);
  });

  // --- Update Users List ---
  function updateUserList(users) {
    usersList.innerHTML = '';
    users.forEach((u) => {
      const li = document.createElement('li');
      li.innerText = u.name || u.id;
      li.style.color = u.color;
      usersList.appendChild(li);
    });
  }

  // --- Meta Information for Each Stroke ---
  function getMeta() {
    return {
      userId: socket.id,
      tool: currentTool,
      color: currentColor,
      width: currentWidth,
    };
  }

  // --- Get Room ID from URL ---
  function getRoomId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'default';
  }
})();
