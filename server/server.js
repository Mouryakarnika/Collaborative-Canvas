const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Rooms } = require('./room');
const { DrawingState } = require('./drawing-state');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = new Rooms();

app.use(express.static(path.join(__dirname, '..', 'client')));

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('join-room', ({ roomId })=>{
    socket.join(roomId);
    socket.data.roomId = roomId;
    // add user to room
    const room = rooms.ensureRoom(roomId, io);
    const user = room.addUser(socket.id);

    // send user their id
    socket.emit('me', { userId: socket.id });

    // send current history
    socket.emit('history', { history: room.state.getHistory() });

    // broadcast users
    io.to(roomId).emit('users', { users: room.listUsers() });

    // wire user events
    socket.on('start-stroke', ({ stroke })=>{
      // push placeholder into history to lock ordering
      room.state.startStroke(stroke);
      io.to(roomId).emit('remote-start-stroke', { stroke });
    });

    socket.on('stroke-points', ({ strokeId, points })=>{
      room.state.appendPoints(strokeId, points);
      io.to(roomId).emit('remote-stroke-points', { strokeId, points });
    });

    socket.on('end-stroke', ({ stroke })=>{
      room.state.endStroke(stroke);
      io.to(roomId).emit('remote-end-stroke', { stroke });
    });

    socket.on('cursor', ({ x, y })=>{
      io.to(roomId).emit('cursor-update', { userId: socket.id, x, y, color: user.color });
    });

    socket.on('undo', ()=>{
      const opId = room.state.undo();
      if(opId) io.to(roomId).emit('op-undo', { opId });
    });

    socket.on('redo', ()=>{
      const op = room.state.redo();
      if(op) io.to(roomId).emit('op-redo', { op });
    });

    socket.on('disconnect', ()=>{
      console.log('disconnect', socket.id);
      const r = rooms.getRoom(roomId);
      if(r){ r.removeUser(socket.id); io.to(roomId).emit('users', { users: r.listUsers() }); }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('listening on', PORT));