// Trump-aware card ordering.
//
// Ordinal layout (high → low), assuming trump rank R and trump suit T:
//
//   300 : Big Joker
//   299 : Small Joker
//   298 : R in suit T              (trump-rank card, in trump suit)
//   297 : R in any other suit      (trump-rank card, off-suit)   [all equal]
//   200..213 : cards in trump suit T (not rank R), ranked A..2 via 213..200
//   100..113 : cards in a non-trump suit S, ranked 2..A via 100..113
//
// For non-trump cards, we bucket by suit using offsets 100/400/700/1000 so
// `ordinal` is still a single integer but cards in different non-trump suits
// are never compared (callers always check effective suit first).
//
// "No trump suit" (大王/小王 declared or fallback): trumpSuit === null. In
// that case only jokers and trump-rank cards are trumps.

const { isBigJoker, isSmallJoker, isJoker } = require('./Card');

const OFFSUIT_BASE = { S: 100, H: 400, C: 700, D: 1000 };

// Effective suit of a card given current trump.
// Returns 'TRUMP' if the card is any trump (joker, trump-rank, or trump-suit)
// or the normal suit letter otherwise.
function effectiveSuit(card, trumpRank, trumpSuit) {
  if (isJoker(card)) return 'TRUMP';
  if (card.rank === trumpRank) return 'TRUMP';
  if (trumpSuit && card.suit === trumpSuit) return 'TRUMP';
  return card.suit;
}

function isTrump(card, trumpRank, trumpSuit) {
  return effectiveSuit(card, trumpRank, trumpSuit) === 'TRUMP';
}

// Compute the absolute ordinal (higher = stronger). For non-trump cards,
// offset by suit so cards of different non-trump suits never tie numerically;
// callers should still refuse to compare across suits when relevant.
function ordinal(card, trumpRank, trumpSuit) {
  if (isBigJoker(card)) return 300;
  if (isSmallJoker(card)) return 299;
  if (card.rank === trumpRank) {
    if (trumpSuit && card.suit === trumpSuit) return 298;
    return 297;
  }
  if (trumpSuit && card.suit === trumpSuit) {
    // rank 2..A (skipping trumpRank); map rank to 200..213 s.t. A → 213.
    return 200 + card.rank; // rank 2..14 → 202..214; fine so long as we stay unique.
  }
  // Off-suit ordering: use suit base + rank (2..14).
  return OFFSUIT_BASE[card.suit] + card.rank;
}

// Two cards are "identical" iff they match rank+suit (required for pairs).
// Trump-rank off-suit cards are NOT pairs just because they have equal ordinal
// (e.g. 8♣ + 8♦ when 8 is trump rank do NOT form a pair; 8♣ + 8♣ do).
function sameKey(a, b) {
  return a.key === b.key;
}

// "Rank slot" is a contiguous logical index used for detecting consecutive
// pairs (tractors). Two units are adjacent iff their rank slots differ by 1
// AND they share an effective suit.
//
// Layout (trump rank R, trump suit T):
//   Non-trump suit S: rank 2..A skipping R → slot 2..13
//   Trump area, non-rank (T_2..T_A skipping R) → slot 2..13
//   Trump rank off-suit (R in any non-T suit) → slot 14
//   Trump rank in T                            → slot 15
//   Small Joker                                → slot 16
//   Big Joker                                  → slot 17
function rankSlot(card, trumpRank, trumpSuit) {
  if (isBigJoker(card)) return 17;
  if (isSmallJoker(card)) return 16;
  if (card.rank === trumpRank) {
    if (trumpSuit && card.suit === trumpSuit) return 15;
    return 14;
  }
  // Normal ranked card (non-trump-rank). Slot collapses the trump-rank gap.
  return card.rank < trumpRank ? card.rank : card.rank - 1;
}

module.exports = {
  effectiveSuit,
  isTrump,
  ordinal,
  sameKey,
  rankSlot,
};
