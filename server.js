const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'changeme';

app.use(express.static(path.join(__dirname, 'public')));

let state = {
  running: false,
  startSeconds: 0,
  endAtMs: null,
  serverTimeMs: Date.now()
};

// Helper: set countdown
function setCountdown(seconds) {
  state.startSeconds = seconds;
  state.endAtMs = Date.now() + seconds * 1000;
  state.running = true;
}

// Broadcast state to all clients
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

// Socket handling
io.on('connection', (socket) => {
  socket.emit('state', state);

  socket.on('admin', (msg) => {
    if (msg.key !== ADMIN_KEY) return;

    if (msg.type === 'start') {
      setCountdown(msg.seconds);
    }

    if (msg.type === 'stop') {
      state.running = false;
    }

    if (msg.type === 'reset') {
      state.running = false;
      state.startSeconds = 0;
      state.endAtMs = null;
    }

    if (msg.type === 'prank') {
      // Jump to 1 minute and broadcast prank
      setCountdown(60);
      io.emit('prank');
    }

    if (msg.type === 'jumpBack') {
      // Jump back to 4 minutes (after prank)
      setCountdown(240);
    }

    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Saw Timer server running on port ${PORT}`);
});
