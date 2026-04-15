// Card representation for Sheng Ji.
//
// A card is represented as a plain object so it is trivial to serialize over
// the wire. Jokers use suit "J" and rank "BJ" (big) or "SJ" (small). Standard
// cards use rank 2..14 (14 = Ace) and suit "S"|"H"|"C"|"D".
//
// `id` is unique per physical card instance in the multi-deck (e.g. d0-S-5,
// d1-S-5 are two different copies of 5♠). `key` is a stable identity for
// pairing: two cards form a "pair" in Sheng Ji only if their `key` matches.

const SUITS = ['S', 'H', 'C', 'D'];
const SUIT_GLYPH = { S: '♠', H: '♥', C: '♣', D: '♦', J: '★' };

function mkCard(deckIndex, suit, rank) {
  const id = `d${deckIndex}-${suit}-${rank}`;
  const key = `${suit}-${rank}`;
  return { id, key, suit, rank, deckIndex };
}

function isJoker(c) {
  return c.suit === 'J';
}

function isBigJoker(c) {
  return c.suit === 'J' && c.rank === 'BJ';
}

function isSmallJoker(c) {
  return c.suit === 'J' && c.rank === 'SJ';
}

function cardLabel(c) {
  if (isBigJoker(c)) return 'BJ';
  if (isSmallJoker(c)) return 'SJ';
  const rankLabel = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[c.rank] || String(c.rank);
  return `${rankLabel}${SUIT_GLYPH[c.suit]}`;
}

module.exports = {
  SUITS,
  SUIT_GLYPH,
  mkCard,
  isJoker,
  isBigJoker,
  isSmallJoker,
  cardLabel,
};
