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
  lastStartAtMs: 0,  // NEW: last time "start" was triggered
  lastPrankAtMs: 0   // NEW: last time "prank" was triggered
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

// ---- Sockets ----
io.on('connection', (socket) => {
  socket.emit('state', state);

  socket.on('admin', (msg) => {
    if (!msg || msg.key !== ADMIN_KEY) {
      socket.emit('admin-ack', { ok:false, msg:'Invalid admin key' });
      return;
    }

    if (msg.type === 'start') {
      const secs = Number(msg.seconds) || 0;
      if (secs > 0) {
        setCountdown(secs);
        state.lastStartAtMs = Date.now(); // NEW
        io.emit('start-sfx');             // fire-and-forget for live listeners
        socket.emit('admin-ack', { ok:true, msg:`Started ${secs}s` });
        console.log(`[ADMIN] start ${secs}s`);
      } else {
        socket.emit('admin-ack', { ok:false, msg:'Enter minutes > 0' });
      }
    } else if (msg.type === 'stop') {
      state.running = false;
      socket.emit('admin-ack', { ok:true, msg:'Stopped' });
      console.log('[ADMIN] stop');
    } else if (msg.type === 'reset') {
      state.running = false;
      state.startSeconds = 0;
      state.endAtMs = null;
      socket.emit('admin-ack', { ok:true, msg:'Reset' });
      console.log('[ADMIN] reset');
    } else if (msg.type === 'prank') {
      setCountdown(60);
      state.lastPrankAtMs = Date.now();  // NEW
      io.emit('prank');                   // fire-and-forget for live listeners
      socket.emit('admin-ack', { ok:true, msg:'Prank → 1:00' });
      console.log('[ADMIN] prank to 1:00');
    } else if (msg.type === 'jumpBack') {
      setCountdown(240);
      socket.emit('admin-ack', { ok:true, msg:'Jumped → 4:00' });
      console.log('[ADMIN] jumpBack to 4:00');
    } else {
      socket.emit('admin-ack', { ok:false, msg:'Unknown command' });
    }

    broadcastState(); // make sure timestamps go out soon
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Saw Timer server running on port ${PORT}`);
});
