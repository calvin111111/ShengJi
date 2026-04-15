// Socket.IO event wiring: bridges clients ↔ Lobby/Game.
//
// Client→server:
//   lobby:list
//   lobby:create { numPlayers, startLevel, name }
//   lobby:join   { code, name }
//   lobby:leave
//   lobby:start
//   lobby:new_game
//   lobby:rebind { code, token }          — reconnect after refresh
//   game:declare { cards }
//   game:kitty   { cards }
//   game:play    { cards }
//
// Server→client:
//   lobby:state  { rooms: [...] }         — broadcast on create/join/leave/start
//   room:state   { room: {...} }          — specific room summary
//   room:you     { code, seat, token }    — after successful join/create
//   game:public  { ... }                  — full public state (plus private hand)
//   game:event   { name, payload }        — per-event notifier for animations
//   error        { msg }

const { Lobby } = require('./lobby');

const lobby = new Lobby();

function attach(io) {
  io.on('connection', (socket) => {
    // Per-connection context.
    socket.data.roomCode = null;
    socket.data.seat = null;

    function err(msg) {
      socket.emit('error', { msg });
    }

    function currentRoom() {
      if (!socket.data.roomCode) return null;
      return lobby.getRoom(socket.data.roomCode);
    }

    function pushRoomState(code) {
      const room = lobby.getRoom(code);
      if (!room) return;
      io.to(`room:${code}`).emit('room:state', { room: room.summary() });
      io.emit('lobby:state', { rooms: lobby.listSummaries() });
    }

    function pushGameState(code) {
      const room = lobby.getRoom(code);
      if (!room || !room.game) return;
      const roomKey = `room:${code}`;
      // Per-seat private state (hand cards).
      for (let seat = 0; seat < room.cfg.numPlayers; seat++) {
        const info = room.seats[seat];
        if (!info) continue;
        const socketId = seatSocketMap.get(`${code}:${seat}`);
        if (!socketId) continue;
        const pubState = room.game.publicState(seat);
        io.to(socketId).emit('game:public', pubState);
      }
    }

    function onGameEvent(code, name, payload) {
      io.to(`room:${code}`).emit('game:event', { name, payload });
      // After each event, push refreshed state.
      pushGameState(code);
      // If the game ended, also push room state for lobby view update.
      const room = lobby.getRoom(code);
      if (room && (name === 'game_over' || name === 'hand_ended')) {
        pushRoomState(code);
      }
    }

    // ----- lobby events -----

    socket.on('lobby:list', () => {
      socket.emit('lobby:state', { rooms: lobby.listSummaries() });
    });

    socket.on('lobby:create', ({ numPlayers, startLevel, name }) => {
      if (![4, 6].includes(numPlayers)) return err('numPlayers must be 4 or 6');
      const sl = Number(startLevel) || 2;
      const room = lobby.createRoom(numPlayers, sl);
      const r = room.addPlayer(name || 'Player');
      if (r.error) return err(r.error);
      socket.data.roomCode = room.code;
      socket.data.seat = r.seat;
      socket.join(`room:${room.code}`);
      seatSocketMap.set(`${room.code}:${r.seat}`, socket.id);
      socket.emit('room:you', { code: room.code, seat: r.seat, token: r.token });
      pushRoomState(room.code);
    });

    socket.on('lobby:join', ({ code, name }) => {
      const room = lobby.getRoom(code);
      if (!room) return err('no such room');
      if (room.status !== 'LOBBY') return err('game already started');
      const r = room.addPlayer(name || 'Player');
      if (r.error) return err(r.error);
      socket.data.roomCode = room.code;
      socket.data.seat = r.seat;
      socket.join(`room:${room.code}`);
      seatSocketMap.set(`${room.code}:${r.seat}`, socket.id);
      socket.emit('room:you', { code: room.code, seat: r.seat, token: r.token });
      pushRoomState(room.code);
    });

    socket.on('lobby:rebind', ({ code, token }) => {
      const room = lobby.getRoom(code);
      if (!room) return err('no such room');
      const seat = room.rebind(token);
      if (seat == null) return err('invalid reconnect token');
      socket.data.roomCode = code;
      socket.data.seat = seat;
      socket.join(`room:${code}`);
      seatSocketMap.set(`${code}:${seat}`, socket.id);
      socket.emit('room:you', { code, seat, token });
      pushRoomState(code);
      if (room.game) pushGameState(code);
    });

    socket.on('lobby:leave', () => {
      const room = currentRoom();
      if (!room) return;
      const seat = socket.data.seat;
      if (room.status === 'LOBBY') room.removePlayer(seat);
      // Leave the socket.io room
      socket.leave(`room:${room.code}`);
      seatSocketMap.delete(`${room.code}:${seat}`);
      socket.data.roomCode = null;
      socket.data.seat = null;
      // If room is empty, delete.
      const empty = room.seats.every((s) => s === null);
      if (empty && room.status === 'LOBBY') lobby.deleteRoom(room.code);
      pushRoomState(room.code);
    });

    socket.on('lobby:start', () => {
      const room = currentRoom();
      if (!room) return err('not in a room');
      const res = room.start((name, payload) => onGameEvent(room.code, name, payload));
      if (res.error) return err(res.error);
      pushRoomState(room.code);
      pushGameState(room.code);
    });

    socket.on('lobby:new_game', () => {
      const room = currentRoom();
      if (!room) return err('not in a room');
      room.newGame();
      pushRoomState(room.code);
    });

    // ----- game events -----

    socket.on('game:declare', ({ cards }) => {
      const room = currentRoom();
      if (!room || !room.game) return err('no active game');
      const res = room.game.declare(socket.data.seat, cards || []);
      if (res.error) return err(res.error);
    });

    socket.on('game:kitty', ({ cards }) => {
      const room = currentRoom();
      if (!room || !room.game) return err('no active game');
      const res = room.game.setKitty(socket.data.seat, cards || []);
      if (res.error) return err(res.error);
      pushGameState(room.code);
    });

    socket.on('game:play', ({ cards }) => {
      const room = currentRoom();
      if (!room || !room.game) return err('no active game');
      const res = room.game.play(socket.data.seat, cards || []);
      if (res.error) return err(res.error);
    });

    socket.on('disconnect', () => {
      const room = currentRoom();
      if (!room) return;
      const seat = socket.data.seat;
      seatSocketMap.delete(`${room.code}:${seat}`);
      // Don't remove from the room: allow reconnection with token.
      // If room is LOBBY and nobody holds the token socket, we still keep it
      // around briefly for reconnection.
    });
  });
}

// Map "code:seat" → socket.id for routing private state (hand cards) to the
// currently-connected socket for that seat.
const seatSocketMap = new Map();

module.exports = { attach, lobby };
