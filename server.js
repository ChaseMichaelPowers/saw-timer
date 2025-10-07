const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'sawMaster123';

app.use(express.static(path.join(__dirname, 'public')));

let state = {
  running: false,
  startSeconds: 0,
  endAtMs: null,
  serverTimeMs: Date.now(),
  lastPrankAtMs: 0   // used so late viewers still play the prank sound
};

function setCountdown(seconds) {
  state.startSeconds = seconds;
  state.endAtMs = Date.now() + seconds * 1000;
  state.running = true;
}

function broadcastState() {
  state.serverTimeMs = Date.now();
  io.emit('state', state);
}

setInterval(() => {
  if (state.running && Date.now() >= state.endAtMs) {
    state.running = false;
  }
  broadcastState();
}, 1000);

io.on('connection', (socket) => {
  socket.emit('state', state);

  socket.on('admin', (msg) => {
    if (!msg || msg.key !== ADMIN_KEY) {
      socket.emit('admin-ack', { ok:false, msg:'Invalid admin key' });
      return;
    }

    if (msg.type === 'prank') {
      // Set timer to 1:00 and notify all viewers
      setCountdown(60);
      state.lastPrankAtMs = Date.now();
      io.emit('prank'); // <-- VIEWERS will hear the sound
      socket.emit('admin-ack', { ok:true, msg:'Prank → 1:00' });
      console.log('[ADMIN] prank to 1:00');
    }

    // (Other commands unchanged… start/stop/reset/jumpBack)
    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Saw Timer on ${PORT}`);
});
