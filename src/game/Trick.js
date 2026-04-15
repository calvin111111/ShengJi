// Trick mechanics: collect plays, determine winner, count points.

const { effectiveSuit, ordinal } = require('./ordering');
const { parseCards, pickCompareUnit, matchesStructure } = require('./Combo');

// Point value of a card (K/10 = 10, 5 = 5).
function cardPoints(card) {
  if (card.suit === 'J') return 0;
  if (card.rank === 5) return 5;
  if (card.rank === 10 || card.rank === 13) return 10;
  return 0;
}

function playPoints(cards) {
  return cards.reduce((sum, c) => sum + cardPoints(c), 0);
}

// Determine the seat that wins the trick.
//
// `plays` is an array of { seat, cards, parsed } in play order, starting with
// the leader. `lead` is the leader's parsed combo (also the first entry in
// plays, for convenience).
function determineWinner(plays, lead, trumpRank, trumpSuit, maxM) {
  const leadSuit = lead.effectiveSuit;
  const leadBest = pickCompareUnit(lead.units);

  let winnerIdx = 0;
  let winnerScore = scoreForPlay(plays[0], lead, leadBest, trumpRank, trumpSuit, maxM);

  for (let i = 1; i < plays.length; i++) {
    const score = scoreForPlay(plays[i], lead, leadBest, trumpRank, trumpSuit, maxM);
    if (score === null) continue;
    if (winnerScore === null || compareScores(score, winnerScore) > 0) {
      winnerIdx = i;
      winnerScore = score;
    }
  }
  return plays[winnerIdx].seat;
}

// A play's "score" is `{ rank, ord }` where higher wins. `null` means the
// play cannot win the trick. `rank` encodes tier: 0 = fails-to-win, 1 = in
// lead suit matching structure, 2 = trump matching structure.
function scoreForPlay(play, lead, leadBest, trumpRank, trumpSuit, maxM) {
  // Reparse to be safe (in case caller didn't).
  const parsed = play.parsed || parseCards(play.cards, trumpRank, trumpSuit, maxM);
  if (!parsed) return { rank: 0, ord: 0 }; // mixed suits → can't win
  const leadSuit = lead.effectiveSuit;

  // Determine the play's effective suit (must be a single suit to win).
  const suits = new Set(play.cards.map((c) => effectiveSuit(c, trumpRank, trumpSuit)));
  if (suits.size !== 1) return { rank: 0, ord: 0 };
  const pSuit = [...suits][0];

  if (pSuit === leadSuit) {
    // Same-suit follow. Find the highest unit matching leadBest's (m, length).
    const match = pickMatchingUnit(parsed.units, leadBest);
    if (match === null) {
      // No matching unit — play can't win structure. Use lowest tier.
      return { rank: 0, ord: 0 };
    }
    return { rank: 1, ord: match.highOrdinal };
  }
  if (pSuit === 'TRUMP') {
    // Trumping: must match lead structure per §4.4.
    if (!matchesStructure(lead, parsed)) return { rank: 0, ord: 0 };
    const match = pickMatchingUnit(parsed.units, leadBest);
    if (match === null) return { rank: 0, ord: 0 };
    return { rank: 2, ord: match.highOrdinal };
  }
  return { rank: 0, ord: 0 };
}

function compareScores(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return a.ord - b.ord;
}

// Find the highest unit in `units` matching the given lead unit's (m, length).
// For singles (m=1, length=1), falls back to highest single if no exact match.
function pickMatchingUnit(units, leadUnit) {
  let best = null;
  for (const u of units) {
    if (u.m !== leadUnit.m) continue;
    if (u.length < leadUnit.length) continue;
    if (!best || u.highOrdinal > best.highOrdinal) best = u;
  }
  if (best) return best;
  // Fallback for singles: treat any card as a single.
  if (leadUnit.m === 1 && leadUnit.length === 1) {
    for (const u of units) {
      if (!best || u.highOrdinal > best.highOrdinal) best = u;
    }
  }
  return best;
}

module.exports = {
  cardPoints,
  playPoints,
  determineWinner,
};
