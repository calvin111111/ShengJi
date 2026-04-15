// Multi-hand game orchestration.
//
// A Game is created when a Room starts. It owns team levels, dealer seat,
// declarer team, and the current Hand. When a Hand finishes it applies
// the level delta to `teamLevels` (living on the Room), rotates dealer, and
// starts the next hand — or reports that the game is over.

const { Hand } = require('./Hand');

// Rank constants (rank 14 = Ace).
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const MAX_RANK = 14;

function clampRank(r) {
  if (r < 2) return 2;
  if (r > MAX_RANK) return MAX_RANK;
  return r;
}

class Game {
  // cfg: {
  //   numPlayers: 4|6, numDecks, kittySize, handSize, maxM,
  //   startLevel, teamLevels (mutated ref), onEvent(name, payload),
  // }
  constructor(cfg) {
    this.cfg = cfg;
    this.numPlayers = cfg.numPlayers;
    this.teamLevels = cfg.teamLevels; // shared with Room
    this.declarerTeam = 'A'; // by convention, first hand starts with Team A
    this.dealerSeat = null; // determined during first deal
    this.firstHand = true;
    this.currentHand = null;
    this.over = false;
    this.winnerTeam = null;
  }

  teamOf(seat) {
    return seat % 2 === 0 ? 'A' : 'B';
  }

  startNextHand() {
    const trumpRank = this.teamLevels[this.declarerTeam];
    const handCfg = {
      numPlayers: this.numPlayers,
      numDecks: this.cfg.numDecks,
      handSize: this.cfg.handSize,
      kittySize: this.cfg.kittySize,
      maxM: this.cfg.maxM,
      trumpRank,
      declarerTeam: this.declarerTeam,
      dealerSeat: this.dealerSeat,
      teamOf: (s) => this.teamOf(s),
      firstHand: this.firstHand,
    };
    const hand = new Hand(handCfg, (name, payload) => this._onHandEvent(name, payload));
    this.currentHand = hand;
    hand.start();
    this.cfg.onEvent('hand_started', {
      trumpRank,
      declarerTeam: this.declarerTeam,
      dealerSeat: this.dealerSeat,
      handIndex: this.handsPlayed || 0,
    });
  }

  _onHandEvent(name, payload) {
    // Update game state BEFORE notifying listeners so they see the new state.
    if (name === 'trump_finalized' && this.firstHand) {
      this.dealerSeat = this.currentHand.dealerSeat;
    }
    if (name === 'hand_ended') this._applyHandEnd(payload);
    // Forward to the room-level event handler (triggers pushGameState).
    this.cfg.onEvent(name, payload);
  }

  _applyHandEnd(result) {
    this.firstHand = false;
    this.handsPlayed = (this.handsPlayed || 0) + 1;
    const declarerTeam = this.declarerTeam;
    const oppTeam = declarerTeam === 'A' ? 'B' : 'A';

    if (result.declarersKeepLabel) {
      this.teamLevels[declarerTeam] = clampRank(
        this.teamLevels[declarerTeam] + result.declarerDelta,
      );
      // Dealer moves to next seat on declarer team (counter-clockwise).
      this.dealerSeat = this._nextDealerSameTeam(this.dealerSeat);
      // declarerTeam stays the same
    } else {
      this.teamLevels[oppTeam] = clampRank(
        this.teamLevels[oppTeam] + result.opponentDelta,
      );
      // Dealer passes to the seat at immediate right on opponent team
      // (which becomes declarer team next hand).
      this.dealerSeat = this._nextDealerSwap(this.dealerSeat);
      this.declarerTeam = oppTeam;
    }

    // Win condition: declarers won while playing Ace as trump rank.
    const trumpRankJustPlayed = this.currentHand ? this.currentHand.trumpRank : 0;
    if (result.declarersKeepLabel && trumpRankJustPlayed === MAX_RANK) {
      this.over = true;
      this.winnerTeam = declarerTeam;
      this.cfg.onEvent('game_over', { winnerTeam: declarerTeam });
      return;
    }

    // Start the next hand automatically after a brief pause so clients can
    // read the scoring summary.
    setTimeout(() => {
      if (!this.over) this.startNextHand();
    }, 4000);
  }

  _nextDealerSameTeam(seat) {
    // Walk counter-clockwise (seat - 2 in a 4p/6p alternating table) to the
    // next seat on the same team.
    let next = seat;
    for (let i = 0; i < this.numPlayers; i++) {
      next = (next - 2 + this.numPlayers) % this.numPlayers;
      if (this.teamOf(next) === this.teamOf(seat)) return next;
    }
    return seat;
  }

  _nextDealerSwap(seat) {
    // Dealer passes to immediate right (counter-clockwise by 1), which is on
    // the opposite team.
    return (seat - 1 + this.numPlayers) % this.numPlayers;
  }

  // External event handlers (forward to current hand).
  declare(seat, cards) {
    if (!this.currentHand) return { error: 'no active hand' };
    return this.currentHand.declare(seat, cards);
  }
  setKitty(seat, cards) {
    if (!this.currentHand) return { error: 'no active hand' };
    return this.currentHand.setKitty(seat, cards);
  }
  play(seat, cards) {
    if (!this.currentHand) return { error: 'no active hand' };
    return this.currentHand.play(seat, cards);
  }

  publicState(forSeat) {
    const h = this.currentHand;
    const state = {
      numPlayers: this.numPlayers,
      teamLevels: { ...this.teamLevels },
      declarerTeam: this.declarerTeam,
      dealerSeat: this.dealerSeat,
      trumpRank: h ? h.trumpRank : null,
      trumpSuit: h ? h.trumpSuit : null,
      phase: h ? h.state : 'IDLE',
      opponentPoints: h ? h.opponentPoints : 0,
      handSizes: h ? h.hands.map((arr) => arr.length) : [],
      currentTrick: h && h.currentTrick ? {
        leader: h.currentTrick.leader,
        plays: h.currentTrick.plays.map((p) => ({ seat: p.seat, cards: p.cards })),
      } : null,
      declaration: h && h.declaration ? {
        seat: h.declaration.seat,
        trumpSuit: h.declaration.trumpSuit,
        cards: h.declaration.cards,
      } : null,
      over: this.over,
      winnerTeam: this.winnerTeam,
    };
    if (h && forSeat != null) {
      state.hand = h.hands[forSeat];
      // Show dealer the kitty after it's been placed (PLAY or DONE phase).
      if (forSeat === h.dealerSeat && h.kitty && h.state !== 'KITTY') {
        state.kitty = h.kitty;
      }
      // During KITTY phase show dealer their full hand (includes kitty cards).
      if (h.state === 'KITTY' && forSeat === h.dealerSeat) {
        state.hand = h.hands[forSeat]; // already has the 8 extra cards
      }
    }
    // Also include last trick history for end-of-hand display.
    if (h && h.state === 'DONE') {
      state.lastHandKitty = h.kitty;
    }
    return state;
  }
}

module.exports = { Game };
