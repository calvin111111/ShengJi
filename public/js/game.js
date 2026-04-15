// Game view controller.

const gameUI = (() => {
  let state = null;
  let selectedIds = new Set();
  let myHand = [];
  let latestPublic = null;
  let lastHandResult = null;

  function init(sharedState) {
    state = sharedState;

    document.getElementById('action-declare').addEventListener('click', onDeclare);
    document.getElementById('action-kitty').addEventListener('click', onSetKitty);
    document.getElementById('action-play').addEventListener('click', onPlay);
    document.getElementById('action-newgame').addEventListener('click', () => {
      net.emit('lobby:new_game');
    });

    net.on('game:public', (pub) => {
      latestPublic = pub;
      myHand = pub.hand || [];
      render(pub);
    });

    net.on('game:event', ({ name, payload }) => {
      if (name === 'hand_ended') {
        lastHandResult = payload;
        showHandSummary(payload);
      }
      if (name === 'trump_declared') {
        const suit = payload.trumpSuit ? cardsLib.SUIT_GLYPH[payload.trumpSuit] : 'NT';
        const seatName = seatDisplayName(payload.seat);
        showToast(`${seatName} declared ${suit} as trump`, 3000);
      }
      if (name === 'trick_ended' && payload.points > 0) {
        const seatName = seatDisplayName(payload.winner);
        showToast(`${seatName} wins trick (+${payload.points} pts)`, 1500);
      }
      if (name === 'game_over') {
        showToast(`🎉 Game over! Team ${payload.winnerTeam} wins!`, 8000);
      }
    });
  }

  function seatDisplayName(seat) {
    const s = state.room?.seats?.[seat];
    return s ? s.name : `Seat ${seat}`;
  }

  function onRoomState(room) {
    state.room = room;
  }

  function onDeclare() {
    const cards = selectedCards();
    if (cards.length === 0) return showToast('Select cards to declare');
    net.emit('game:declare', { cards });
    clearSelection();
  }
  function onSetKitty() {
    const cards = selectedCards();
    const need = latestPublic ? (latestPublic.numPlayers === 4 ? 8 : 6) : 8;
    if (cards.length !== need) return showToast(`Select exactly ${need} cards for the kitty`);
    net.emit('game:kitty', { cards });
    clearSelection();
  }
  function onPlay() {
    const cards = selectedCards();
    if (cards.length === 0) return showToast('Select cards to play');
    net.emit('game:play', { cards });
    clearSelection();
  }

  function selectedCards() {
    return myHand.filter((c) => selectedIds.has(c.id));
  }
  function clearSelection() {
    selectedIds.clear();
    if (latestPublic) render(latestPublic);
  }

  function render(pub) {
    document.getElementById('hud-trump').textContent = trumpLabel(pub);
    document.getElementById('hud-declarer').textContent =
      pub.declarerTeam ? `Team ${pub.declarerTeam}` : '—';
    document.getElementById('hud-points').textContent =
      `${pub.opponentPoints} / ${pub.numPlayers === 4 ? 80 : 120}`;
    document.getElementById('hud-phase').textContent = phaseLabel(pub.phase);
    document.getElementById('hud-level-a').textContent = `A: ${lobbyUI.rankLabel(pub.teamLevels.A)}`;
    document.getElementById('hud-level-b').textContent = `B: ${lobbyUI.rankLabel(pub.teamLevels.B)}`;

    renderSeats(pub);
    cardsLib.renderTrickArea(document.getElementById('trick-area'), pub.currentTrick, pub.numPlayers);
    renderHand(pub);

    const phase = pub.phase;
    const isDealer = state.seat === pub.dealerSeat;
    const kittySize = pub.numPlayers === 4 ? 8 : 6;

    setVisible('action-declare', phase === 'DEAL');
    setVisible('action-kitty', phase === 'KITTY' && isDealer);
    setVisible('action-play', phase === 'PLAY');
    setVisible('action-newgame', !!pub.over);

    const hint = document.getElementById('action-hint');
    if (phase === 'DEAL') {
      if (pub.declaration) {
        const s = pub.declaration.trumpSuit ? cardsLib.SUIT_GLYPH[pub.declaration.trumpSuit] : 'NT';
        hint.textContent = `Current declaration: ${s} by ${seatDisplayName(pub.declaration.seat)} — override with a higher declaration`;
      } else {
        hint.textContent = 'Dealing… select a trump-rank card and click Declare to claim trump suit';
      }
    } else if (phase === 'KITTY' && isDealer) {
      const sel = selectedIds.size;
      hint.textContent = `Select ${kittySize} cards for the kitty (${sel}/${kittySize} selected)`;
    } else if (phase === 'KITTY' && !isDealer) {
      hint.textContent = `${seatDisplayName(pub.dealerSeat)} is setting the kitty…`;
    } else if (phase === 'PLAY') {
      const turn = expectedSeat(pub.currentTrick, pub.numPlayers);
      hint.textContent = turn === state.seat ? '⬆ Your turn — select cards and click Play' :
        `Waiting for ${seatDisplayName(turn)}…`;
    } else if (phase === 'DONE') {
      hint.textContent = 'Hand over. Next hand starts in ~4s…';
    } else {
      hint.textContent = '';
    }
  }

  function setVisible(id, visible) {
    const el = document.getElementById(id);
    if (el) el.style.display = visible ? '' : 'none';
  }

  function phaseLabel(phase) {
    return { INIT: 'Init', DEAL: 'Dealing', KITTY: 'Kitty', PLAY: 'Playing', DONE: 'Done', IDLE: 'Idle' }[phase] || phase;
  }

  function expectedSeat(trick, numPlayers) {
    if (!trick) return -1;
    return (trick.leader - trick.plays.length + numPlayers) % numPlayers;
  }

  function trumpLabel(pub) {
    if (!pub.trumpRank) return '—';
    const rank = lobbyUI.rankLabel(pub.trumpRank);
    if (!pub.trumpSuit) return `${rank} NT`;
    return `${rank} ${cardsLib.SUIT_GLYPH[pub.trumpSuit]}`;
  }

  function renderSeats(pub) {
    const seats = document.getElementById('seats');
    seats.innerHTML = '';
    const n = pub.numPlayers;
    const yourSeat = state.seat ?? 0;
    for (let i = 0; i < n; i++) {
      const rel = (i - yourSeat + n) % n;
      // Place seats around an ellipse; 0=bottom (you), 1=left, 2=top, 3=right for 4p.
      const angle = Math.PI / 2 + (2 * Math.PI * rel) / n;
      const cx = 50 + 40 * Math.cos(angle);
      const cy = 50 + 40 * Math.sin(angle);
      const team = i % 2 === 0 ? 'a' : 'b';
      const nameInfo = seatDisplayName(i);
      const handCount = pub.handSizes?.[i] ?? 0;
      const isTurn = pub.phase === 'PLAY' && expectedSeat(pub.currentTrick, n) === i;
      const isDealer = pub.dealerSeat === i;
      const badge = document.createElement('div');
      badge.className = `seat-badge team-${team}${isTurn ? ' turn' : ''}${isDealer ? ' dealer' : ''}`;
      badge.style.left = `${cx}%`;
      badge.style.top = `${cy}%`;
      badge.style.transform = 'translate(-50%, -50%)';
      const youTag = i === state.seat ? ' <em>(you)</em>' : '';
      badge.innerHTML = `<div><b>${nameInfo}</b>${youTag}</div><div>${handCount} cards</div>`;
      seats.appendChild(badge);
    }
  }

  function renderHand(pub) {
    const container = document.getElementById('hand-fan');
    // Sort hand: put trumps together at right side, then by suit+rank.
    const sorted = [...myHand].sort((a, b) => {
      const tr = pub ? pub.trumpRank : null;
      const ts = pub ? pub.trumpSuit : null;
      const aTrump = isTrumpCard(a, tr, ts);
      const bTrump = isTrumpCard(b, tr, ts);
      if (aTrump !== bTrump) return aTrump ? 1 : -1;
      if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
      return b.rank - a.rank;
    });
    const sel = selectedIds;
    container.innerHTML = '';
    sorted.forEach((card) => {
      const html = cardsLib.cardLabelHtml(card);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const el = tmp.firstChild;
      if (sel.has(card.id)) el.classList.add('selected');
      el.addEventListener('click', () => {
        if (sel.has(card.id)) sel.delete(card.id);
        else sel.add(card.id);
        renderHand(pub);
      });
      container.appendChild(el);
    });
  }

  function isTrumpCard(card, tr, ts) {
    if (!tr) return false;
    if (card.suit === 'J') return true;
    if (card.rank === tr) return true;
    if (ts && card.suit === ts) return true;
    return false;
  }

  function showHandSummary(result) {
    const rl = lobbyUI.rankLabel;
    let msg = `Hand over! Opponents: ${result.opponentPoints} pts`;
    if (result.kittyBonus) msg += ` (+${result.kittyBonus} kitty bonus)`;
    if (result.declarerDelta > 0) msg += ` · Declarers +${result.declarerDelta} levels`;
    if (result.opponentDelta > 0) msg += ` · Opponents +${result.opponentDelta} levels`;
    if (!result.declarersKeepLabel) msg += ` · Opponents take control`;
    showToast(msg, 6000);
  }

  function showToast(msg, duration = 2500) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  return { init, onRoomState };
})();

window.gameUI = gameUI;
