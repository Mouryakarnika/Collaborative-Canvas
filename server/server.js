// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(__dirname + '/../client'));

const server = http.createServer(app);
const io = new Server(server);

const rooms = {}; // simple in-memory rooms: { roomId: { history: [], clients: {} } }

io.on('connection', socket => {
  socket.on('join', ({roomId, username, color}) => {
    socket.join(roomId);
    socket.data = { roomId, username, color };
    rooms[roomId] = rooms[roomId] || { history: [], clients: {} };
    rooms[roomId].clients[socket.id] = { username, color };

    // send room state to the joining client
    socket.emit('roomState', { history: rooms[roomId].history, clients: rooms[roomId].clients });
    io.to(roomId).emit('clients', rooms[roomId].clients);
  });

  socket.on('stroke', stroke => {
    const { roomId } = socket.data;
    if (!roomId) return;
    // Add a server-generated id & timestamp for ordering
    const op = { id: `${socket.id}_${Date.now()}`, socketId: socket.id, ...stroke };
    rooms[roomId].history.push(op);
    // Broadcast to others
    socket.to(roomId).emit('stroke', op);
  });

  socket.on('undo', ({ targetOpId }) => {
    const { roomId } = socket.data;
    if (!roomId) return;
    // mark op removed (simple approach)
    const room = rooms[roomId];
    room.history = room.history.filter(op => op.id !== targetOpId);
    io.to(roomId).emit('undo', { targetOpId });
  });

  socket.on('disconnect', () => {
    const { roomId } = socket.data || {};
    if (rooms[roomId]) {
      delete rooms[roomId].clients[socket.id];
      io.to(roomId).emit('clients', rooms[roomId].clients);
    }
  });
});

server.listen(3000, () => console.log('Server listening on :3000'));
