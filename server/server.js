// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../client')));

// Each room holds drawing history and connected clients
// rooms = { roomId: { history: [ops], clients: { socketId: {username, color} }, redoStack: [] } }
const rooms = {};

io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);

  // --- Join a drawing room ---
  socket.on('join', ({ roomId = 'main', username = 'guest', color = '#000000' }) => {
    socket.join(roomId);
    socket.data = { roomId, username, color };

    // Create room if not exist
    if (!rooms[roomId]) {
      rooms[roomId] = { history: [], clients: {}, redoStack: [] };
    }

    // Track user in the room
    rooms[roomId].clients[socket.id] = { username, color };

    // Send current state to the joining client
    socket.emit('roomState', {
      history: rooms[roomId].history,
      clients: rooms[roomId].clients,
    });

    // Notify everyone in the room of new client list
    io.to(roomId).emit('clients', rooms[roomId].clients);

    console.log(`👤 ${username} joined room ${roomId}`);
  });

  // --- Handle stroke data from clients ---
  socket.on('strokeChunk', (chunk) => {
    const { roomId } = socket.data || {};
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;

    // Ensure color & width exist
    const color = chunk.color || socket.data.color || '#000000';
    const width = chunk.width || 3;

    // Create a canonical operation
    const op = {
      id: `${socket.id}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      socketId: socket.id,
      chunk: { ...chunk, color, width },
      state: 'active',
      ts: Date.now(),
    };

    // Store operation in room history
    room.history.push(op);

    // Clear redo stack whenever new stroke is added
    room.redoStack = [];

    // Broadcast stroke to all clients (including sender)
    io.to(roomId).emit('strokeChunk', op);
  });

  // --- Handle cursor movement ---
  socket.on('cursor', (cursor) => {
    const { roomId } = socket.data || {};
    if (!roomId) return;
    socket.to(roomId).emit('cursor', {
      socketId: socket.id,
      x: cursor.x,
      y: cursor.y,
    });
  });

  // --- Undo ---
  socket.on('undoRequest', ({ targetOpId } = {}) => {
    const { roomId } = socket.data || {};
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    if (!room.redoStack) room.redoStack = [];

    let removedOp = null;

    // If an opId is provided, remove that op
    if (targetOpId) {
      const idx = room.history.findIndex((o) => o.id === targetOpId && o.state === 'active');
      if (idx !== -1) removedOp = room.history.splice(idx, 1)[0];
    } else {
      // Otherwise remove last active op (LIFO)
      for (let i = room.history.length - 1; i >= 0; i--) {
        if (room.history[i].state === 'active') {
          removedOp = room.history.splice(i, 1)[0];
          break;
        }
      }
    }

    if (removedOp) {
      room.redoStack.push(removedOp);
      io.to(roomId).emit('undoApplied', { opId: removedOp.id, history: room.history });
    }
  });

  // --- Redo ---
  socket.on('redoRequest', () => {
    const { roomId } = socket.data || {};
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room || !room.redoStack || room.redoStack.length === 0) return;

    const restoredOp = room.redoStack.pop();
    restoredOp.state = 'active';
    room.history.push(restoredOp);

    // Broadcast restored operation
    io.to(roomId).emit('redoApplied', { op: restoredOp, history: room.history });
  });

  // --- Request full history (e.g., reconnect) ---
  socket.on('requestFullHistory', () => {
    const { roomId } = socket.data || {};
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;

    socket.emit('roomState', {
      history: room.history,
      clients: room.clients,
    });
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    const { roomId } = socket.data || {};
    if (rooms[roomId]) {
      delete rooms[roomId].clients[socket.id];
      io.to(roomId).emit('clients', rooms[roomId].clients);
    }
    console.log('❌ Client disconnected:', socket.id);
  });
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
