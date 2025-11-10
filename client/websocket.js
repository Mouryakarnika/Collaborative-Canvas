// websocket client wrapper
const WS = (function(){
let socket = null;


function connect(roomId){
socket = io(); // assumes same origin
socket.on('connect', ()=>{
socket.emit('join-room', { roomId });
});


socket.on('disconnect', ()=> console.log('disconnected'));


return socket;
}


return { connect };
})();