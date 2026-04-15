// Single-hand state machine for Sheng Ji.
//
// State flow:   DEAL → KITTY → PLAY → DONE
//
// The Hand is driven by timers for dealing cards, and by player events for
// declarations, kitty selection, and play. The owning Game provides a
// callback `onEvent(name, payload)` that routes updates to clients.

const { buildDeck, shuffle } = require('./Deck');
const { effectiveSuit } = require('./ordering');
const { parseCards, validateThrow } = require('./Combo');
const { validateFollow } = require('./Follow');
const { determineWinner, playPoints } = require('./Trick');

const DEAL_TICK_MS = 250;

class Hand {
  constructor(cfg, onEvent) {
    // cfg: {
    //   numPlayers, numDecks, handSize, kittySize, maxM,
    //   trumpRank, declarerTeam, dealerSeat,
    //   teamOf: seat => 'A'|'B',
    //   firstHand: bool (whether dealer is yet to be determined),
    // }
    this.cfg = cfg;
    this.onEvent = onEvent;
    this.trumpRank = cfg.trumpRank;
    this.trumpSuit = null;
    this.maxM = cfg.maxM;
    this.hands = Array.from({ length: cfg.numPlayers }, () => []);
    this.deck = shuffle(buildDeck(cfg.numDecks));
    this.state = 'INIT';
    this.dealIdx = 0;
    this.dealerSeat = cfg.firstHand ? null : cfg.dealerSeat;
    this.drawSeat = cfg.firstHand ? 0 : cfg.dealerSeat; // first hand picks seat 0 to start
    this.declaration = null; // { seat, level, trumpSuit, cards }
    this.kitty = null;
    this.trickHistory = [];
    this.currentTrick = null;
    this.opponentPoints = 0;
    this.dealTimer = null;
  }

  // ------------------------------------------------------------------
  // Dealing phase
  // ------------------------------------------------------------------
  start() {
    this.state = 'DEAL';
    this.onEvent('phase', { phase: 'DEAL' });
    this._scheduleDeal();
  }

  _scheduleDeal() {
    this.dealTimer = setTimeout(() => this._tickDeal(), DEAL_TICK_MS);
  }

  _tickDeal() {
    this.dealTimer = null;
    const total = this.deck.length - this.cfg.kittySize;
    if (this.dealIdx >= total) {
      this._finishDealing();
      return;
    }
    const card = this.deck[this.dealIdx++];
    this.hands[this.drawSeat].push(card);
    this.onEvent('deal_card', { seat: this.drawSeat, card });
    this.drawSeat = (this.drawSeat - 1 + this.cfg.numPlayers) % this.cfg.numPlayers;
    this._scheduleDeal();
  }

  _finishDealing() {
    // If no declaration, fallback to revealing bottom cards per §3.5.5.
    if (!this.declaration) {
      const bottom = this.deck.slice(this.deck.length - this.cfg.kittySize);
      let chosen = null;
      for (const c of bottom) {
        if (c.suit !== 'J' && c.rank === this.trumpRank) {
          chosen = c;
          break;
        }
      }
      if (!chosen) {
        // Highest-ranking non-joker card's suit.
        for (const c of bottom) {
          if (c.suit === 'J') continue;
          if (!chosen || c.rank > chosen.rank) chosen = c;
        }
      }
      this.trumpSuit = chosen ? chosen.suit : 'S';
      // Dealer assignment fallback for first hand: if nobody declared and
      // it's the first hand, keep whoever was seat 0 as dealer.
      if (this.dealerSeat === null) this.dealerSeat = 0;
    } else {
      this.trumpSuit = this.declaration.trumpSuit;
      if (this.dealerSeat === null) this.dealerSeat = this.declaration.seat;
    }

    // Dealer receives kitty cards into their hand.
    const kittyCards = this.deck.slice(this.deck.length - this.cfg.kittySize);
    for (const c of kittyCards) this.hands[this.dealerSeat].push(c);

    this.state = 'KITTY';
    this.onEvent('trump_finalized', {
      trumpRank: this.trumpRank,
      trumpSuit: this.trumpSuit,
      dealerSeat: this.dealerSeat,
    });
    this.onEvent('phase', { phase: 'KITTY' });
    this.onEvent('kitty_phase', { dealerSeat: this.dealerSeat });
  }

  // ------------------------------------------------------------------
  // Declarations (during DEAL)
  // ------------------------------------------------------------------
  declare(seat, cards) {
    if (this.state !== 'DEAL') return { error: 'not in deal phase' };
    const tier = this._declarationTier(cards);
    if (!tier) return { error: 'invalid declaration cards' };
    const handIds = new Set(this.hands[seat].map((c) => c.id));
    for (const c of cards) {
      if (!handIds.has(c.id)) return { error: 'card not in hand' };
    }
    if (this.declaration && this.declaration.seat === seat) {
      return { error: 'cannot override yourself' };
    }
    if (this.declaration && tier.level <= this.declaration.level) {
      return { error: 'declaration must strictly exceed current' };
    }
    this.declaration = {
      seat,
      level: tier.level,
      trumpSuit: tier.trumpSuit,
      cards,
    };
    this.onEvent('trump_declared', {
      seat,
      trumpSuit: tier.trumpSuit,
      cards,
    });
    return { ok: true };
  }

  _declarationTier(cards) {
    if (!cards || cards.length === 0) return null;
    const firstKey = cards[0].key;
    if (!cards.every((c) => c.key === firstKey)) return null;
    const c = cards[0];
    const isRank = c.suit !== 'J' && c.rank === this.trumpRank;
    const isSJ = c.suit === 'J' && c.rank === 'SJ';
    const isBJ = c.suit === 'J' && c.rank === 'BJ';
    if (cards.length === 1) {
      if (isRank) return { level: 1, trumpSuit: c.suit };
      return null;
    }
    if (cards.length === 2) {
      if (isRank) return { level: 2, trumpSuit: c.suit };
      if (isSJ) return { level: 3, trumpSuit: null };
      if (isBJ) return { level: 4, trumpSuit: null };
      return null;
    }
    if (cards.length === 3 && this.cfg.numDecks >= 3) {
      if (isRank) return { level: 5, trumpSuit: c.suit };
      if (isSJ) return { level: 6, trumpSuit: null };
      if (isBJ) return { level: 7, trumpSuit: null };
      return null;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Kitty phase
  // ------------------------------------------------------------------
  setKitty(seat, cards) {
    if (this.state !== 'KITTY') return { error: 'not in kitty phase' };
    if (seat !== this.dealerSeat) return { error: 'only dealer sets kitty' };
    if (cards.length !== this.cfg.kittySize) {
      return { error: `kitty must be ${this.cfg.kittySize} cards` };
    }
    const handIds = new Set(this.hands[seat].map((c) => c.id));
    for (const c of cards) if (!handIds.has(c.id)) return { error: 'card not in hand' };
    // Remove cards from hand.
    const ids = new Set(cards.map((c) => c.id));
    this.hands[seat] = this.hands[seat].filter((c) => !ids.has(c.id));
    this.kitty = cards;
    this.state = 'PLAY';
    this.currentTrick = { leader: this.dealerSeat, plays: [] };
    this.onEvent('phase', { phase: 'PLAY' });
    this.onEvent('trick_started', { leader: this.dealerSeat });
    return { ok: true };
  }

  // ------------------------------------------------------------------
  // Play phase
  // ------------------------------------------------------------------
  play(seat, cards) {
    if (this.state !== 'PLAY') return { error: 'not in play phase' };
    const trick = this.currentTrick;
    if (!trick) return { error: 'no active trick' };
    const expectedSeat = this._expectedSeat();
    if (seat !== expectedSeat) return { error: 'not your turn' };
    const uniquePlayIds = new Set(cards.map((c) => c.id));
    if (uniquePlayIds.size !== cards.length) return { error: 'duplicate cards' };
    const handIds = new Set(this.hands[seat].map((c) => c.id));
    for (const c of cards) if (!handIds.has(c.id)) return { error: 'card not in hand' };

    if (trick.plays.length === 0) {
      // Leading: parse and (if multi-unit) validate as throw.
      const parsed = parseCards(cards, this.trumpRank, this.trumpSuit, this.maxM);
      if (!parsed) return { error: 'lead cards must be one effective suit' };
      if (parsed.units.length >= 2) {
        // Throw: validate against other hands.
        const others = {};
        for (let s = 0; s < this.cfg.numPlayers; s++) {
          if (s !== seat) others[s] = this.hands[s];
        }
        const v = validateThrow(parsed, seat, others, this.trumpRank, this.trumpSuit, this.maxM);
        if (!v.ok) return { error: v.reason };
      }
      trick.lead = parsed;
      this._removeCards(seat, cards);
      trick.plays.push({ seat, cards, parsed });
    } else {
      // Following: validate.
      const err = validateFollow(
        this.hands[seat],
        cards,
        trick.lead,
        this.trumpRank,
        this.trumpSuit,
        this.maxM,
      );
      if (err) return { error: err };
      const parsed = parseCards(cards, this.trumpRank, this.trumpSuit, this.maxM);
      this._removeCards(seat, cards);
      trick.plays.push({ seat, cards, parsed });
    }

    this.onEvent('card_played', { seat, cards });

    if (trick.plays.length === this.cfg.numPlayers) {
      // Resolve trick.
      const winner = determineWinner(
        trick.plays,
        trick.lead,
        this.trumpRank,
        this.trumpSuit,
        this.maxM,
      );
      const pts = trick.plays.reduce((s, p) => s + playPoints(p.cards), 0);
      const winnerTeam = this.cfg.teamOf(winner);
      if (winnerTeam !== this.cfg.declarerTeam && pts > 0) {
        this.opponentPoints += pts;
      }
      this.trickHistory.push({ ...trick, winner, points: pts });
      this.onEvent('trick_ended', { winner, points: pts, opponentPoints: this.opponentPoints });
      // Next trick or hand-end?
      if (this.hands[0].length === 0) {
        this._endHand(winner);
      } else {
        this.currentTrick = { leader: winner, plays: [] };
        this.onEvent('trick_started', { leader: winner });
      }
    }
    return { ok: true };
  }

  _expectedSeat() {
    const trick = this.currentTrick;
    return (trick.leader - trick.plays.length + this.cfg.numPlayers) % this.cfg.numPlayers;
  }

  _removeCards(seat, cards) {
    const ids = new Set(cards.map((c) => c.id));
    this.hands[seat] = this.hands[seat].filter((c) => !ids.has(c.id));
  }

  // ------------------------------------------------------------------
  // End-of-hand scoring
  // ------------------------------------------------------------------
  _endHand(lastTrickWinner) {
    const winnerTeam = this.cfg.teamOf(lastTrickWinner);
    let kittyBonus = 0;
    if (winnerTeam !== this.cfg.declarerTeam) {
      // Opponents took the last trick. Compute kitty bonus.
      const kittyPts = this.kitty.reduce((s, c) => {
        if (c.rank === 5) return s + 5;
        if (c.rank === 10 || c.rank === 13) return s + 10;
        return s;
      }, 0);
      // Factor based on the largest unit in the last lead.
      const lastLead = this.trickHistory[this.trickHistory.length - 1].lead;
      const largest = lastLead.units.reduce(
        (b, u) =>
          !b ||
          u.m > b.m ||
          (u.m === b.m && u.length > b.length)
            ? u
            : b,
        null,
      );
      // 2^(1 + total tuples count of largest unit) per §3.8 and §6.5.
      // For single → factor 2, pair → 4, 2-tractor → 8, etc.
      // For triple → 6 (we approximate with m*length+1).
      const factor =
        largest.m === 1
          ? 2
          : largest.m === 2
            ? Math.pow(2, largest.length + 1)
            : Math.pow(2, largest.length) * largest.m;
      kittyBonus = kittyPts * factor;
      this.opponentPoints += kittyBonus;
    }

    // Compute level delta per scoring table (20 * numDecks point increments,
    // 40 * numDecks threshold for opponents to win).
    const threshold = 40 * this.cfg.numDecks;
    const increment = 20 * this.cfg.numDecks;
    const opPts = this.opponentPoints;
    let declarerDelta = 0;
    let opponentDelta = 0;
    let declarersKeepLabel;
    if (opPts < threshold) {
      declarersKeepLabel = true;
      // bracket: 0 → +3, (5..threshold-increment-5) → tiers
      // Actually: 0 → +3, (5..increment-5) → +2, (increment..2*increment-5) → +1, (2*increment..threshold-5) → +0? No.
      // From §3.8:
      //   0         → Declarers +3
      //   5-35      → Declarers +2  (= 5..threshold/2 - 5)
      //   40-75     → Declarers +1  (= threshold/2..threshold - 5)
      //   80-115    → 0, switch
      // At 4p (threshold=80, increment=40): 0/+3, 5-35/+2, 40-75/+1.
      // At 6p (threshold=120, increment=60): 0/+3, 5-55/+2, 60-115/+1.
      if (opPts === 0) declarerDelta = 3;
      else if (opPts < threshold - increment) declarerDelta = 2;
      else declarerDelta = 1;
    } else {
      declarersKeepLabel = false;
      // 80-115 → +0, 120-155 → +1, 160-195 → +2, ...
      // Generalized: (opPts - threshold) / increment (floor) = delta
      opponentDelta = Math.floor((opPts - threshold) / increment);
    }

    this.state = 'DONE';
    this.onEvent('phase', { phase: 'DONE' });
    this.onEvent('hand_ended', {
      opponentPoints: opPts,
      kittyBonus,
      declarerDelta,
      opponentDelta,
      declarersKeepLabel,
      kitty: this.kitty,
    });
  }
}

module.exports = { Hand };
