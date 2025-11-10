// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../client')));

// rooms: { [roomId]: { history: [ops], clients: { socketId: {username,color} }, redoStack: [] } }
const rooms = {};

io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  // join handler
  socket.on('join', ({ roomId = 'main', username = 'guest', color = '#000' }) => {
    socket.join(roomId);
    socket.data = { roomId, username, color };
    if (!rooms[roomId]) {
      rooms[roomId] = { history: [], clients: {}, redoStack: [] };
    }
    rooms[roomId].clients[socket.id] = { username, color };

    // send room state to the joining client
    socket.emit('roomState', { history: rooms[roomId].history, clients: rooms[roomId].clients });
    // notify everyone of clients
    io.to(roomId).emit('clients', rooms[roomId].clients);
    console.log(`socket ${socket.id} joined room ${roomId}`);
  });

  // receive a stroke chunk from client, wrap as op and broadcast to room
  socket.on('strokeChunk', (chunk) => {
    const { roomId } = socket.data || {};
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;

    // canonical operation: attach id, socketId, chunk object, and state
    const op = {
      id: `${socket.id}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      socketId: socket.id,
      chunk: chunk, // chunk should be { path: [...], color, width, final?:true }
      state: 'active',
      ts: Date.now(),
    };

    room.history.push(op);
    // clear redo stack because new op invalidates redo history
    room.redoStack = [];

    // broadcast the op to other clients (and optionally to sender if desired)
    io.to(roomId).emit('strokeChunk', op);
  });

  // cursor updates - broadcast to room (exclude sender)
  socket.on('cursor', (c) => {
    const { roomId } = socket.data || {};
    if (!roomId) return;
    socket.to(roomId).emit('cursor', { socketId: socket.id, x: c.x, y: c.y });
  });

  // undo: expects { targetOpId } or nothing (if none provided, server will undo last active op)
  socket.on('undoRequest', ({ targetOpId } = {}) => {
    const { roomId } = socket.data || {};
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    if (!room.redoStack) room.redoStack = [];

    // If a targetOpId specified, remove that op; else remove the last active op (LIFO)
    let removedOp = null;
    if (targetOpId) {
      const idx = room.history.findIndex((o) => o.id === targetOpId && o.state === 'active');
      if (idx !== -1) {
        removedOp = room.history.splice(idx, 1)[0];
      }
    } else {
      // find last active op
      for (let i = room.history.length - 1; i >= 0; i--) {
        if (room.history[i].state === 'active') {
          removedOp = room.history.splice(i, 1)[0];
          break;
        }
      }
    }

    if (removedOp) {
      // push to redo stack
      room.redoStack.push(removedOp);
      // notify clients to re-render (provide opId removed)
      io.to(roomId).emit('undoApplied', { opId: removedOp.id, history: room.history });
    }
  });

  // redo: pop from redoStack and reapply
  socket.on('redoRequest', () => {
    const { roomId } = socket.data || {};
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room || !room.redoStack || room.redoStack.length === 0) return;

    const restoredOp = room.redoStack.pop();
    restoredOp.state = 'active';
    room.history.push(restoredOp);

    // notify clients that redo applied (sending the op)
    io.to(roomId).emit('redoApplied', { op: restoredOp, history: room.history });
  });

  // allow client to request full redraw of history
  socket.on('requestFullHistory', () => {
    const { roomId } = socket.data || {};
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    socket.emit('roomState', { history: room.history, clients: room.clients });
  });

  socket.on('disconnect', () => {
    const { roomId } = socket.data || {};
    if (rooms[roomId]) {
      delete rooms[roomId].clients[socket.id];
      io.to(roomId).emit('clients', rooms[roomId].clients);
    }
    console.log('client disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on :${PORT}`));
