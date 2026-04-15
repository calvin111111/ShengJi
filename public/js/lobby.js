// Lobby + room-waiting view controllers.

const lobbyUI = (() => {
  function showView(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
  }

  function init(state) {
    // Name entry
    const nameInput = document.getElementById('name-input');
    nameInput.value = net.loadName();
    document.getElementById('name-submit').addEventListener('click', () => {
      const name = (nameInput.value || 'Player').trim().slice(0, 16);
      state.name = name;
      net.saveName(name);
      showView('view-lobby');
      net.emit('lobby:list');
    });

    document.getElementById('create-submit').addEventListener('click', () => {
      const numPlayers = Number(document.getElementById('create-players').value);
      const startLevel = Number(document.getElementById('create-startlevel').value);
      net.emit('lobby:create', { numPlayers, startLevel, name: state.name });
    });

    document.getElementById('join-submit').addEventListener('click', () => {
      const code = (document.getElementById('join-code').value || '').toUpperCase().trim();
      if (!code) return;
      net.emit('lobby:join', { code, name: state.name });
    });

    document.getElementById('start-game').addEventListener('click', () => {
      net.emit('lobby:start');
    });
    document.getElementById('leave-room').addEventListener('click', () => {
      net.emit('lobby:leave');
      if (state.code) net.clearToken(state.code);
      state.code = null;
      state.seat = null;
      showView('view-lobby');
      net.emit('lobby:list');
    });

    net.on('lobby:state', ({ rooms }) => {
      const list = document.getElementById('rooms');
      list.innerHTML = '';
      const openRooms = rooms.filter((r) => r.status === 'LOBBY');
      if (openRooms.length === 0) {
        list.innerHTML = '<li><em>No open rooms. Create one.</em></li>';
      }
      for (const r of openRooms) {
        const li = document.createElement('li');
        const filled = r.seats.filter((s) => s.occupied).length;
        li.innerHTML = `<span class="code">${r.code}</span>
          <span>${filled}/${r.numPlayers} players · start lv ${r.startLevel}</span>
          <button data-code="${r.code}">Join</button>`;
        li.querySelector('button').addEventListener('click', () => {
          net.emit('lobby:join', { code: r.code, name: state.name });
        });
        list.appendChild(li);
      }
    });

    net.on('room:you', ({ code, seat, token }) => {
      state.code = code;
      state.seat = seat;
      state.token = token;
      net.saveToken(code, token);
    });

    net.on('room:state', ({ room }) => {
      state.room = room;
      if (room.status === 'LOBBY') {
        showView('view-room');
        document.getElementById('room-code').textContent = room.code;
        document.getElementById('room-meta-players').textContent =
          `${room.numPlayers} players · ${room.numDecks} decks · start lv ${room.startLevel}`;
        document.getElementById('room-level-a').textContent = rankLabel(room.teamLevels.A);
        document.getElementById('room-level-b').textContent = rankLabel(room.teamLevels.B);
        const seatList = document.getElementById('seat-list');
        seatList.innerHTML = '';
        for (const s of room.seats) {
          const li = document.createElement('li');
          li.className = `team-${s.team.toLowerCase()}`;
          const youTag = s.index === state.seat ? ' (you)' : '';
          li.innerHTML = `<span>Seat ${s.index} · Team ${s.team}</span><span>${s.name || '<em>empty</em>'}${youTag}</span>`;
          seatList.appendChild(li);
        }
        const startBtn = document.getElementById('start-game');
        const full = room.seats.every((s) => s.occupied);
        startBtn.disabled = !full;
        startBtn.textContent = full ? 'Start game' : `Waiting (${room.seats.filter((s) => s.occupied).length}/${room.numPlayers})`;
      } else if (room.status === 'PLAYING') {
        showView('view-game');
        gameUI.onRoomState(room, state);
      }
    });

    net.on('error', ({ msg }) => {
      const toast = document.getElementById('toast');
      toast.textContent = `Error: ${msg}`;
      toast.classList.add('show', 'error');
      clearTimeout(toast._errTimer);
      toast._errTimer = setTimeout(() => {
        toast.classList.remove('show', 'error');
      }, 3500);
    });
  }

  function rankLabel(r) {
    return { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r);
  }

  return { init, showView, rankLabel };
})();

window.lobbyUI = lobbyUI;
