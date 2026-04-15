// Legal-follow validation for Sheng Ji.
//
// The authoritative rule is "follow suit + structure to the extent possible"
// (§4.3). For MVP we enforce:
//   1. Total card count equals the lead's card count.
//   2. At least min(|inSuit|, N) played cards are in the lead's effective
//      suit (so players cannot withhold in-suit cards).
//   3. Among in-suit cards played, the number of pairs played is at least
//      min(leadPairs, availableInSuitPairs); same for triples in 3-deck
//      games. This enforces "must follow structure when possible" at the
//      pair / triple level.
//
// Not enforced in MVP (explicit simplification):
//   • Exact tractor-length matching beyond total pair count.
//   • Minimum cards-in-suit when lead is a throw (treated the same as any
//     other lead — the total in-suit requirement alone is enough to avoid
//     most cheating).

const { effectiveSuit } = require('./ordering');
const { parseCards } = require('./Combo');

function countMTuples(units, m) {
  let n = 0;
  for (const u of units) {
    if (u.m === m) n += u.length; // each m-tuple in a run counts once
  }
  return n;
}

// Validate a follow play against the lead. Returns null if legal, or a
// short error string otherwise. `hand` is the player's full hand BEFORE
// playing `played` (i.e. `played` cards are still in `hand`).
function validateFollow(hand, played, lead, trumpRank, trumpSuit, maxM) {
  if (!played || played.length === 0) return 'no cards';
  if (played.length !== lead.totalCards) {
    return `must play ${lead.totalCards} cards`;
  }
  // Make sure each played card actually exists in hand.
  const handIds = new Set(hand.map((c) => c.id));
  for (const c of played) {
    if (!handIds.has(c.id)) return 'card not in hand';
  }

  const leadSuit = lead.effectiveSuit;
  const inSuitHand = hand.filter(
    (c) => effectiveSuit(c, trumpRank, trumpSuit) === leadSuit,
  );
  const inSuitPlayed = played.filter(
    (c) => effectiveSuit(c, trumpRank, trumpSuit) === leadSuit,
  );

  const requiredInSuit = Math.min(inSuitHand.length, lead.totalCards);
  if (inSuitPlayed.length < requiredInSuit) {
    return `must follow suit (at least ${requiredInSuit} cards in lead suit)`;
  }

  // Structure requirement: play as many m-tuples in the lead suit as
  // possible, capped by what the lead demands.
  if (inSuitPlayed.length > 0 && inSuitHand.length > 0) {
    const parsedAvailable = parseCards(inSuitHand, trumpRank, trumpSuit, maxM);
    const parsedPlayed = parseCards(inSuitPlayed, trumpRank, trumpSuit, maxM);
    // parsedPlayed should always succeed here since we confirmed same suit.
    if (!parsedAvailable || !parsedPlayed) return 'invalid in-suit card combination';

    for (let m = maxM; m >= 2; m--) {
      const leadHas = countMTuples(lead.units, m);
      if (leadHas === 0) continue;
      const availHas = countMTuples(parsedAvailable.units, m);
      const playedHas = countMTuples(parsedPlayed.units, m);
      const required = Math.min(leadHas, availHas);
      if (playedHas < required) {
        const name = m === 2 ? 'pairs' : m === 3 ? 'triples' : `${m}-tuples`;
        return `must follow structure (at least ${required} ${name} in lead suit)`;
      }
    }
  }

  return null;
}

module.exports = { validateFollow };
