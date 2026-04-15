// Entry point: wire up lobby and game UI, attempt reconnection.

(function main() {
  const state = {
    name: net.loadName() || '',
    code: null,
    seat: null,
    token: null,
    room: null,
  };

  lobbyUI.init(state);
  gameUI.init(state);

  const last = net.loadLastToken();
  if (last) {
    // Hide name view, attempt reconnect once socket is ready (or immediately).
    document.getElementById('view-name').classList.add('hidden');
    const tryRebind = () => net.emit('lobby:rebind', { code: last.code, token: last.token });
    if (net.socket.connected) {
      tryRebind();
    } else {
      net.socket.once('connect', tryRebind);
    }
    // If rebind fails (bad token / room gone), fall back to name entry.
    net.socket.once('error', ({ msg }) => {
      if (msg && (msg.includes('reconnect') || msg.includes('token') || msg.includes('no such room'))) {
        net.clearToken(last.code);
        document.getElementById('view-name').classList.remove('hidden');
      }
    });
  } else {
    // Show name entry (already visible by default in HTML).
  }
})();
