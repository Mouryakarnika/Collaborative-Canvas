const { DrawingState } = require('./drawing-state');

class Room {
  constructor(id){
    this.id = id;
    this.state = new DrawingState();
    this.users = new Map();
  }

  addUser(socketId){
    const color = this._assignColor();
    const u = { userId: socketId, color, userShort: socketId.slice(-4) };
    this.users.set(socketId, u);
    return u;
  }

  removeUser(socketId){ this.users.delete(socketId); }

  listUsers(){ return Array.from(this.users.values()); }

  _assignColor(){ // pick color from palette
    const palette = ['#e6194b','#3cb44b','#ffe119','#4363d8','#f58231','#911eb4','#46f0f0','#f032e6','#bcf60c','#fabebe'];
    const taken = new Set(Array.from(this.users.values()).map(u=>u.color));
    for(const c of palette) if(!taken.has(c)) return c;
    return '#000000';
  }
}

class Rooms {
  constructor(){ this._rooms = new Map(); }
  ensureRoom(id){ if(!this._rooms.has(id)) this._rooms.set(id, new Room(id)); return this._rooms.get(id); }
  getRoom(id){ return this._rooms.get(id); }
}

module.exports = { Rooms };
