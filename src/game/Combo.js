// Combo detection + trick structure utilities for Sheng Ji.
//
// A "unit" is one of: single, pair, tractor (consecutive pairs), triple,
// or airplane (consecutive triples). A "play" is parsed into a list of
// units all sharing one effective suit (either a normal suit or 'TRUMP').
//
// Unit shape:
//   { kind: 'tuple'|'consec', m, length, cards, highOrdinal, lowSlot, highSlot }
//     kind='tuple' + m=1 → single
//     kind='tuple' + m=2, length=1 → non-consec pair
//     kind='tuple' + m=3, length=1 → non-consec triple
//     kind='consec' + m=2, length=n ≥ 2 → tractor of n pairs
//     kind='consec' + m=3, length=n ≥ 2 → airplane of n triples
//
// `highOrdinal` is the ordinal of the highest card in the unit (for tractors,
// the top of the run). `length` is the number of m-tuples in a run (1 for a
// non-consecutive tuple). Total card count = m * length.

const { effectiveSuit, ordinal, rankSlot } = require('./ordering');

function groupByKey(cards) {
  const map = new Map();
  for (const c of cards) {
    if (!map.has(c.key)) map.set(c.key, []);
    map.get(c.key).push(c);
  }
  return map;
}

// Parse a set of cards into a list of units, greedily grouping the largest
// m-tuples first and then forming consecutive runs. Returns null if cards
// span multiple effective suits (an illegal lead/play structure).
function parseCards(cards, trumpRank, trumpSuit, maxM = 2) {
  if (!cards || cards.length === 0) return null;
  const eSuit = effectiveSuit(cards[0], trumpRank, trumpSuit);
  for (const c of cards) {
    if (effectiveSuit(c, trumpRank, trumpSuit) !== eSuit) return null;
  }

  // Greedy: take m-tuples with largest m first, leaving residue.
  const grouped = groupByKey(cards);
  const tuplesByM = {};
  for (let m = maxM; m >= 2; m--) {
    tuplesByM[m] = [];
    for (const [, arr] of grouped) {
      while (arr.length >= m) {
        const taken = arr.splice(0, m);
        tuplesByM[m].push({
          slot: rankSlot(taken[0], trumpRank, trumpSuit),
          ordinal: ordinal(taken[0], trumpRank, trumpSuit),
          cards: taken,
        });
      }
    }
  }
  const singles = [];
  for (const [, arr] of grouped) {
    for (const c of arr) {
      singles.push({
        slot: rankSlot(c, trumpRank, trumpSuit),
        ordinal: ordinal(c, trumpRank, trumpSuit),
        cards: [c],
      });
    }
  }

  const units = [];
  for (let m = maxM; m >= 2; m--) {
    const tuples = tuplesByM[m].slice().sort((a, b) => a.slot - b.slot);
    let i = 0;
    while (i < tuples.length) {
      let j = i + 1;
      while (j < tuples.length && tuples[j].slot === tuples[j - 1].slot + 1) j++;
      const run = tuples.slice(i, j);
      if (run.length >= 2) {
        units.push({
          kind: 'consec',
          m,
          length: run.length,
          cards: run.flatMap((t) => t.cards),
          highOrdinal: run[run.length - 1].ordinal,
          lowSlot: run[0].slot,
          highSlot: run[run.length - 1].slot,
        });
      } else {
        units.push({
          kind: 'tuple',
          m,
          length: 1,
          cards: run[0].cards,
          highOrdinal: run[0].ordinal,
          lowSlot: run[0].slot,
          highSlot: run[0].slot,
        });
      }
      i = j;
    }
  }
  for (const s of singles) {
    units.push({
      kind: 'tuple',
      m: 1,
      length: 1,
      cards: s.cards,
      highOrdinal: s.ordinal,
      lowSlot: s.slot,
      highSlot: s.slot,
    });
  }

  return { effectiveSuit: eSuit, units, totalCards: cards.length };
}

// Summary of the structural "shape" of a parsed combo, used for matching
// (e.g. "2 tractors of length 2 + 1 pair + 1 single"). Two combos have the
// same shape iff they have the same counts by (kind, m, length).
function shapeKey(units) {
  const counts = {};
  for (const u of units) {
    const key = u.kind === 'consec' ? `c${u.m}.${u.length}` : `t${u.m}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  const keys = Object.keys(counts).sort();
  return keys.map((k) => `${k}x${counts[k]}`).join(',');
}

// Is `candidate` a legal trump combo that matches the structure of `lead`?
// Per §4.4: same total cards, ≥ same number of m-tuples for each m ≥ 2,
// and ≥ same number of length-n consecutive m-tuples for each (m, n) ≥ 2.
function matchesStructure(lead, candidate) {
  if (lead.totalCards !== candidate.totalCards) return false;
  // Count tuples by m, and consecutive runs by (m, length).
  const countLead = countStructuralUnits(lead.units);
  const countCand = countStructuralUnits(candidate.units);
  // For each m-tuple count in lead, candidate must have at least as many.
  for (const m of Object.keys(countLead.tupleByM)) {
    if ((countCand.tupleByM[m] || 0) < countLead.tupleByM[m]) return false;
  }
  for (const k of Object.keys(countLead.consecByML)) {
    if ((countCand.consecByML[k] || 0) < countLead.consecByML[k]) return false;
  }
  return true;
}

// When computing "at least as many m-tuples", a consecutive run of length L
// counts as L m-tuples of size m, PLUS we also require ≥ runs of length n
// for each applicable n. Implementation: tupleByM counts all m-tuple-sized
// groups regardless of whether they're consecutive.
function countStructuralUnits(units) {
  const tupleByM = {};
  const consecByML = {};
  for (const u of units) {
    if (u.m < 2) continue;
    tupleByM[u.m] = (tupleByM[u.m] || 0) + u.length;
    if (u.kind === 'consec') {
      const k = `${u.m}.${u.length}`;
      consecByML[k] = (consecByML[k] || 0) + 1;
    }
  }
  return { tupleByM, consecByML };
}

// Compare two combos of the SAME shape: return 1 if a > b, -1 if a < b, 0 if tie.
// §4.4: compare by the ordinal of the longest unit present in the lead. In
// practice, since shapes match, we compare the single highest unit by
// (m desc, length desc, highOrdinal desc). Ties broken by timestamp elsewhere.
function compareCombos(a, b) {
  const ua = pickCompareUnit(a.units);
  const ub = pickCompareUnit(b.units);
  if (ua.m !== ub.m) return ua.m > ub.m ? 1 : -1;
  if (ua.length !== ub.length) return ua.length > ub.length ? 1 : -1;
  if (ua.highOrdinal !== ub.highOrdinal) return ua.highOrdinal > ub.highOrdinal ? 1 : -1;
  return 0;
}

function pickCompareUnit(units) {
  // Pick longest (m, length) unit; tiebreak by highOrdinal.
  let best = null;
  for (const u of units) {
    if (
      !best ||
      u.m > best.m ||
      (u.m === best.m && u.length > best.length) ||
      (u.m === best.m && u.length === best.length && u.highOrdinal > best.highOrdinal)
    ) {
      best = u;
    }
  }
  return best;
}

// Evaluate whether a throw (combo with ≥ 2 units) is valid: no remaining
// higher unit of the same kind in the same effective suit exists in any
// single opponent's hand. Returns { ok, reason? } — we reject invalid throws
// outright rather than compute a forced-unit retraction.
function validateThrow(combo, leaderSeat, handsBySeat, trumpRank, trumpSuit, maxM) {
  if (combo.units.length < 2) return { ok: true };
  const leadSuit = combo.effectiveSuit;

  // For each opponent's hand, parse their cards in this effective suit and
  // check for higher units of the same kind.
  for (const seatStr of Object.keys(handsBySeat)) {
    const seat = Number(seatStr);
    if (seat === leaderSeat) continue;
    const hand = handsBySeat[seat];
    const inSuit = hand.filter(
      (c) => effectiveSuit(c, trumpRank, trumpSuit) === leadSuit,
    );
    if (inSuit.length === 0) continue;
    const other = parseCards(inSuit, trumpRank, trumpSuit, maxM);
    if (!other) continue;

    // Check each throw unit kind.
    for (const u of combo.units) {
      const higher = findHigherUnit(other.units, u, inSuit, trumpRank, trumpSuit);
      if (higher) {
        return {
          ok: false,
          reason: `invalid throw: opponent holds higher ${describeUnit(u)}`,
        };
      }
    }
  }
  return { ok: true };
}

// Does opponent have any unit that strictly beats the given lead unit?
function findHigherUnit(oppUnits, leadUnit, oppInSuitCards, trumpRank, trumpSuit) {
  if (leadUnit.m === 1 && leadUnit.length === 1) {
    // single: any card in the opponent's hand in this suit with higher
    // ordinal counts (even if it's locked in a tuple).
    for (const c of oppInSuitCards) {
      if (ordinal(c, trumpRank, trumpSuit) > leadUnit.highOrdinal) return true;
    }
    return false;
  }
  // Non-single: look for a matching (m, length) unit that's higher.
  for (const u of oppUnits) {
    if (u.m !== leadUnit.m) continue;
    if (u.kind === 'consec' && u.length >= leadUnit.length && u.highOrdinal > leadUnit.highOrdinal) return true;
    if (u.kind === 'tuple' && leadUnit.length === 1 && u.length >= 1 && u.m === leadUnit.m && u.highOrdinal > leadUnit.highOrdinal) return true;
  }
  return false;
}

function describeUnit(u) {
  if (u.m === 1) return 'single';
  if (u.m === 2 && u.length === 1) return 'pair';
  if (u.m === 2) return `tractor of ${u.length}`;
  if (u.m === 3 && u.length === 1) return 'triple';
  if (u.m === 3) return `airplane of ${u.length}`;
  return 'unit';
}

module.exports = {
  parseCards,
  shapeKey,
  matchesStructure,
  compareCombos,
  validateThrow,
  describeUnit,
  pickCompareUnit,
};
