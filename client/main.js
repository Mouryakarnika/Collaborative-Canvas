(function(){
  const socket = WS.connect(getRoomId());
  const canvasEl = document.getElementById('canvas');
  const toolEl = document.getElementById('tool');
  const colorEl = document.getElementById('color');
  const widthEl = document.getElementById('width');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const usersList = document.getElementById('users');
  const roomSpan = document.getElementById('room-id');

  roomSpan.innerText = getRoomId();

  // Make canvas take available space
  function fitCanvas(){
    canvasEl.style.width = (window.innerWidth - 220) + 'px';
    canvasEl.style.height = (window.innerHeight - 110) + 'px';
  }
  fitCanvas(); window.addEventListener('resize', fitCanvas);

  // create CollabCanvas instance
  const canvas = CollabCanvas.createCanvas(canvasEl, socket);
  canvas.setOnUsers(updateUsers);

  // mouse handling
  let meta = { userId: null, tool: 'brush', color: '#000', width: 4 };

  socket.on('me', ({ userId })=>{ meta.userId = userId; });

  toolEl.addEventListener('change', ()=> meta.tool = toolEl.value);
  colorEl.addEventListener('change', ()=> meta.color = colorEl.value);
  widthEl.addEventListener('input', ()=> meta.width = parseInt(widthEl.value,10));

  undoBtn.addEventListener('click', ()=> canvas.undo());
  redoBtn.addEventListener('click', ()=> canvas.redo());

  canvasEl.addEventListener('pointerdown', (e)=>{ canvas.pointerDown(e, meta); });
  canvasEl.addEventListener('pointermove', (e)=>{ canvas.pointerMove(e, meta); });
  window.addEventListener('pointerup', (e)=>{ canvas.pointerUp(e); });

  socket.on('history', ({ history })=>{ canvas.setHistory(history); });

  function updateUsers(users){
    usersList.innerHTML = '';
    for(const u of users){
      const li = document.createElement('li');
      const dot = document.createElement('span'); dot.className='user-dot'; dot.style.background = u.color;
      li.appendChild(dot);
      li.appendChild(document.createTextNode((u.userId === meta.userId ? 'You' : ('User ' + u.userShort))));
      usersList.appendChild(li);
    }
  }

  // small helper to get or create room id from URL hash
  function getRoomId(){
    const h = location.hash.slice(1);
    if(h) return h;
    const id = Math.random().toString(36).slice(2,8);
    location.hash = id;
    return id;
  }
})();