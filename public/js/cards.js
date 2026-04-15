// Card rendering and comparison helpers for the client.
//
// A card from the server has shape { id, key, suit, rank, deckIndex }.
// We render with unicode suit glyphs and red/black colors.

const SUIT_GLYPH = { S: '♠', H: '♥', C: '♣', D: '♦' };

function cardLabelHtml(card) {
  if (card.suit === 'J') {
    const isBig = card.rank === 'BJ';
    return `<div class="card joker ${isBig ? 'big' : 'small'}" data-id="${card.id}">${isBig ? 'Big' : 'Sm'}<br>JOKER</div>`;
  }
  const rankLabel = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[card.rank] || String(card.rank);
  const red = card.suit === 'H' || card.suit === 'D';
  return `<div class="card ${red ? 'red' : ''}" data-id="${card.id}">${rankLabel}<span class="suit">${SUIT_GLYPH[card.suit]}</span></div>`;
}

function renderHand(cards, container, { onToggle, selectedIds, sortKey }) {
  // Sort for nice display: put trumps on the right? For MVP just by suit+rank.
  const sorted = cards.slice().sort(sortKey || defaultSort);
  container.innerHTML = sorted.map(cardLabelHtml).join('');
  const selSet = new Set(selectedIds || []);
  [...container.querySelectorAll('.card')].forEach((el) => {
    const id = el.dataset.id;
    if (selSet.has(id)) el.classList.add('selected');
    el.addEventListener('click', () => {
      if (onToggle) onToggle(id, el);
    });
  });
}

function defaultSort(a, b) {
  // Jokers first, then by suit then rank desc.
  if (a.suit === 'J' && b.suit !== 'J') return -1;
  if (b.suit === 'J' && a.suit !== 'J') return 1;
  if (a.suit === 'J' && b.suit === 'J') {
    // Big > Small
    return a.rank === 'BJ' ? -1 : 1;
  }
  if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
  return b.rank - a.rank;
}

function renderTrickArea(container, trick, numPlayers) {
  if (!trick || !trick.plays || trick.plays.length === 0) {
    container.innerHTML = '';
    return;
  }
  const html = trick.plays.map((p) => {
    const cardsHtml = p.cards.map((c) => cardLabelHtml(c).replace('class="card', 'class="card small')).join('');
    return `<div class="trick-stack"><div class="seat-label">seat ${p.seat}</div><div class="cards">${cardsHtml}</div></div>`;
  }).join('');
  container.innerHTML = html;
}

window.cardsLib = { cardLabelHtml, renderHand, renderTrickArea, SUIT_GLYPH };
