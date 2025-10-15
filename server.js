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
  startSeconds: 0,     // the configured starting seconds
  endAtMs: null,       // when the countdown ends (unless frozen)
  serverTimeMs: Date.now(),
  pranking: false,     // true during the frozen prank minute
  prankEndMs: null,    // when the prank minute ends
  freezeSeconds: null, // number shown while pranking (e.g. 180 for 03:00)
  prankFiredAuto: false // ensure the auto prank only happens once per run
};

function setCountdown(seconds) {
  state.startSeconds = seconds;
  state.endAtMs = Date.now() + seconds * 1000;
  state.running = true;
  // reset prank state for a fresh run
  state.pranking = false;
  state.prankEndMs = null;
  state.freezeSeconds = null;
  state.prankFiredAuto = false;
}

function stopCountdown() {
  state.running = false;
  state.pranking = false;
  state.prankEndMs = null;
  state.freezeSeconds = null;
}

function resetCountdown() {
  stopCountdown();
  state.startSeconds = 0;
  state.endAtMs = null;
}

function broadcastState() {
  state.serverTimeMs = Date.now();
  io.emit('state', state);
}

function secondsLeft() {
  if (!state.running || !state.endAtMs) return state.startSeconds || 0;
  const left = Math.ceil((state.endAtMs - Date.now()) / 1000);
  return Math.max(0, left);
}

setInterval(() => {
  const now = Date.now();

  if (state.running) {
    // Auto-fire prank ONCE when reaching exactly 03:00 remaining (or crossing it)
    const left = secondsLeft();
    if (!state.prankFiredAuto && !state.pranking && left <= 180 && left > 0) {
      // Enter prank mode for 60s, freeze the display at 03:00
      state.pranking = true;
      state.prankEndMs = now + 60_000;
      state.freezeSeconds = 180; // show 03:00 during prank
      state.prankFiredAuto = true;

      // Tell clients to do the audio/visual gag
      io.emit('prank');
    }

    // While pranking, keep counting real time but freeze the shown number on clients.
    // When prank ends, skip that minute -> jump to 02:00 (120s remain) and resume.
    if (state.pranking && now >= state.prankEndMs) {
      state.pranking = false;
      state.prankEndMs = null;
      state.freezeSeconds = null;
      // Jump the timer to 2:00 from "just after" 3:00
      state.endAtMs = now + 120_000;
    }

    // If time actually runs out (and we weren't in a frozen prank), stop.
    if (!state.pranking && state.running && now >= state.endAtMs) {
      state.running = false;
    }
  }

  broadcastState();
}, 200); // a bit more responsive for the freeze/unfreeze

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
        io.emit('start-sfx');  // play start sfx on viewers
        socket.emit('admin-ack', { ok:true, msg:`Started ${secs}s` });
      } else {
        socket.emit('admin-ack', { ok:false, msg:'Enter minutes > 0' });
      }
    } else if (msg.type === 'stop') {
      stopCountdown();
      socket.emit('admin-ack', { ok:true, msg:'Stopped' });
    } else if (msg.type === 'reset') {
      resetCountdown();
      socket.emit('admin-ack', { ok:true, msg:'Reset' });
    } else if (msg.type === 'prank') {
      // Manual prank: just do the gag (NO timer change)
      io.emit('prank');
      // If you also want the freeze behavior when pressed manually, uncomment below:
      // if (!state.pranking) {
      //   state.pranking = true;
      //   state.prankEndMs = Date.now() + 60_000;
      //   state.freezeSeconds = Math.max(1, Math.min(9999, secondsLeft())); // freeze at current remaining
      // }
      socket.emit('admin-ack', { ok:true, msg:'Prank fired' });
    } else if (msg.type === 'jumpBack') {
      setCountdown(240);
      socket.emit('admin-ack', { ok:true, msg:'Jumped → 4:00' });
    } else {
      socket.emit('admin-ack', { ok:false, msg:'Unknown command' });
    }

    broadcastState();
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Saw Timer server running on port ${PORT}`);
});
