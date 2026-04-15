// Build and shuffle multi-deck card sets for Sheng Ji.

const { SUITS, mkCard } = require('./Card');

function buildDeck(numDecks) {
  const cards = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (let rank = 2; rank <= 14; rank++) {
        cards.push(mkCard(d, suit, rank));
      }
    }
    cards.push(mkCard(d, 'J', 'SJ'));
    cards.push(mkCard(d, 'J', 'BJ'));
  }
  return cards;
}

// Fisher-Yates shuffle (in place). Uses Math.random — fine for a casual game.
function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

module.exports = { buildDeck, shuffle };
