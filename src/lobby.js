// Room / lobby registry.
//
// Rooms are keyed by 4-letter codes. Each Room owns seats, persistent team
// levels, and (when playing) a Game instance. A single in-memory registry
// serves the whole server process.

const crypto = require('crypto');
const { Game } = require('./game/Game');

// Config derived from player count.
function configFor(numPlayers) {
  if (numPlayers === 4) {
    return {
      numPlayers: 4,
      numDecks: 2,
      handSize: 25,
      kittySize: 8,
      maxM: 2,
    };
  }
  if (numPlayers === 6) {
    return {
      numPlayers: 6,
      numDecks: 3,
      handSize: 26,
      kittySize: 6,
      maxM: 3,
    };
  }
  throw new Error(`unsupported numPlayers: ${numPlayers}`);
}

function makeCode() {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }
  return code;
}

function makeToken() {
  return crypto.randomBytes(16).toString('hex');
}

class Room {
  constructor(code, numPlayers, startLevel) {
    this.code = code;
    this.cfg = configFor(numPlayers);
    this.startLevel = startLevel;
    this.seats = Array.from({ length: numPlayers }, () => null);
    this.teamLevels = { A: startLevel, B: startLevel };
    this.status = 'LOBBY'; // LOBBY | PLAYING | ENDED
    this.game = null;
    this.tokenToSeat = new Map();
    this.listeners = new Set(); // seat indices currently connected
  }

  addPlayer(name) {
    const slot = this.seats.findIndex((s) => s === null);
    if (slot === -1) return { error: 'room full' };
    const token = makeToken();
    this.seats[slot] = { token, name, team: slot % 2 === 0 ? 'A' : 'B' };
    this.tokenToSeat.set(token, slot);
    return { ok: true, seat: slot, token };
  }

  rebind(token) {
    if (!this.tokenToSeat.has(token)) return null;
    return this.tokenToSeat.get(token);
  }

  removePlayer(seat) {
    const info = this.seats[seat];
    if (!info) return;
    this.tokenToSeat.delete(info.token);
    this.seats[seat] = null;
  }

  isFull() {
    return this.seats.every((s) => s !== null);
  }

  start(onEvent) {
    if (this.status !== 'LOBBY') return { error: 'already started' };
    if (!this.isFull()) return { error: 'need all seats filled' };
    this.status = 'PLAYING';
    this.game = new Game({
      numPlayers: this.cfg.numPlayers,
      numDecks: this.cfg.numDecks,
      handSize: this.cfg.handSize,
      kittySize: this.cfg.kittySize,
      maxM: this.cfg.maxM,
      startLevel: this.startLevel,
      teamLevels: this.teamLevels, // shared reference
      onEvent,
    });
    this.game.startNextHand();
    return { ok: true };
  }

  newGame() {
    // Reset team levels to start level, clear game instance.
    this.teamLevels.A = this.startLevel;
    this.teamLevels.B = this.startLevel;
    this.game = null;
    this.status = 'LOBBY';
  }

  // Serialized summary for lobby listing / room view.
  summary() {
    return {
      code: this.code,
      numPlayers: this.cfg.numPlayers,
      numDecks: this.cfg.numDecks,
      startLevel: this.startLevel,
      teamLevels: { ...this.teamLevels },
      status: this.status,
      seats: this.seats.map((s, i) => ({
        index: i,
        team: i % 2 === 0 ? 'A' : 'B',
        name: s ? s.name : null,
        occupied: !!s,
      })),
    };
  }
}

class Lobby {
  constructor() {
    this.rooms = new Map(); // code → Room
  }

  createRoom(numPlayers, startLevel) {
    let code;
    do {
      code = makeCode();
    } while (this.rooms.has(code));
    const room = new Room(code, numPlayers, startLevel);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code);
  }

  deleteRoom(code) {
    this.rooms.delete(code);
  }

  listSummaries() {
    return [...this.rooms.values()].map((r) => r.summary());
  }
}

module.exports = { Lobby, Room, configFor };
