(function(window){
  const TOOLS = { BRUSH: 'brush', ERASER: 'eraser' };

  function createCanvas(el, socket, opts={}){
    const canvas = el;
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let lastPoint = null;
    let currentStroke = null;
    let devicePixelRatio = window.devicePixelRatio || 1;

    // State for remote cursors
    const remoteCursors = new Map();

    function resize(){
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.floor(w * devicePixelRatio);
      canvas.height = Math.floor(h * devicePixelRatio);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
      redrawFromHistory();
    }

    window.addEventListener('resize', debounce(resize, 100));

    // Drawing history will be provided/kept by server; we keep a local cache that mirrors server history
    let remoteHistory = []; // array of operations

    function setHistory(h){ remoteHistory = h.slice(); redrawFromHistory(); }

    function redrawFromHistory(){
      // clear
      ctx.clearRect(0,0,canvas.width,canvas.height);
      // draw all ops in order
      for(const op of remoteHistory){
        drawOp(ctx, op);
      }
    }

    function drawOp(ctx, op){
      if(op.type !== 'stroke') return;
      ctx.save();
      if(op.tool === TOOLS.ERASER){
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = op.color || '#000';
      }
      ctx.lineWidth = op.width || 4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const pts = op.points;
      if(!pts || pts.length === 0) { ctx.restore(); return; }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for(let i=1;i<pts.length;i++){
        const p = pts[i];
        // simple smoothing: quadratic curve to midway
        const midx = (pts[i-1].x + p.x)/2;
        const midy = (pts[i-1].y + p.y)/2;
        ctx.quadraticCurveTo(pts[i-1].x, pts[i-1].y, midx, midy);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Event handlers for user input
    function pointFromEvent(e){
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left);
      const y = (e.clientY - rect.top);
      return { x, y };
    }

    function pointerDown(e, meta){
      drawing = true;
      lastPoint = pointFromEvent(e);
      currentStroke = {
        id: generateId(),
        type: 'stroke',
        userId: meta.userId,
        tool: meta.tool,
        color: meta.color,
        width: meta.width,
        points: [ lastPoint ]
      };
      // optimistic draw locally
      drawOp(ctx, currentStroke);
      // notify server start
      socket.emit('start-stroke', { stroke: currentStroke });
    }

    function pointerMove(e, meta){
      const p = pointFromEvent(e);
      // send cursor position
      socket.emit('cursor', { x: p.x, y: p.y });
      if(!drawing) return;
      currentStroke.points.push(p);
      // draw incremental (draw last small segment)
      const tail = currentStroke.points.slice(-6);
      drawOp(ctx, { ...currentStroke, points: tail });
      // batch send points for this stroke - keep it lightweight
      if(currentStroke.points.length % 6 === 0){
        socket.emit('stroke-points', { strokeId: currentStroke.id, points: tail });
      }
    }

    function pointerUp(e){
      if(!drawing) return;
      drawing = false;
      socket.emit('end-stroke', { stroke: currentStroke });
      currentStroke = null;
    }

    // Remote events
    socket.on('remote-start-stroke', ({ stroke })=>{
      // add to remote history immediately to reserve ordering
      remoteHistory.push(stroke);
      redrawFromHistory();
    });

    socket.on('remote-stroke-points', ({ strokeId, points })=>{
      // find stroke in remoteHistory and append
      const op = remoteHistory.find(o => o.id === strokeId);
      if(op){
        op.points.push(...points);
        // draw only appended segment
        drawOp(ctx, { ...op, points });
      }
    });

    socket.on('remote-end-stroke', ({ stroke })=>{
      // finalise (server sends canonical stroke)
      const idx = remoteHistory.findIndex(o => o.id === stroke.id);
      if(idx === -1) remoteHistory.push(stroke);
      else remoteHistory[idx] = stroke;
      redrawFromHistory();
    });

    socket.on('history', ({ history })=>{
      setHistory(history);
    });

    socket.on('op-undo', ({ opId })=>{
      // remove op with id
      const idx = remoteHistory.findIndex(o => o.id === opId);
      if(idx !== -1) remoteHistory.splice(idx,1);
      redrawFromHistory();
    });

    socket.on('op-redo', ({ op })=>{
      remoteHistory.push(op);
      drawOp(ctx, op);
    });

    socket.on('users', ({ users })=>{
      // pass through
      if(typeof onUsers === 'function') onUsers(users);
    });

    socket.on('cursor-update', ({ userId, x, y, color })=>{
      showRemoteCursor(userId,x,y,color);
    });

    function showRemoteCursor(userId,x,y,color){
      let el = remoteCursors.get(userId);
      if(!el){
        el = document.createElement('div');
        el.className = 'cursor-indicator';
        el.style.background = 'rgba(255,255,255,0.9)';
        el.innerText = '';
        document.body.appendChild(el);
        remoteCursors.set(userId, el);
      }
      const rect = canvas.getBoundingClientRect();
      el.style.left = (rect.left + x) + 'px';
      el.style.top = (rect.top + y) + 'px';
      el.style.borderLeft = `8px solid ${color || '#000'}`;
      // inactivity removal (reset timer)
      if(el._removeTimer) clearTimeout(el._removeTimer);
      el._removeTimer = setTimeout(()=>{
        if(el){ el.remove(); remoteCursors.delete(userId); }
      }, 2500);
    }

    // Exposed API
    const api = {
      resize,
      pointerDown,
      pointerMove,
      pointerUp,
      setHistory,
      setOnUsers(cb){ onUsers = cb; },
      undo(){ socket.emit('undo'); },
      redo(){ socket.emit('redo'); },
    };

    let onUsers = null;

    resize();

    return api;
  }

  // utilities
  function drawLine(ctx,x1,y1,x2,y2){ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }

  function generateId(){ return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9); }

  function debounce(fn, t){ let timer; return (...a)=>{ clearTimeout(timer); timer = setTimeout(()=>fn(...a), t); }; }

  window.CollabCanvas = { createCanvas };
})(window);
