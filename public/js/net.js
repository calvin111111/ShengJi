// Socket.IO client wrapper + persistent reconnection token storage.

const net = (() => {
  const socket = io();
  const listeners = {};

  function on(event, fn) {
    (listeners[event] ||= []).push(fn);
    socket.on(event, fn);
  }
  function off(event, fn) {
    socket.off(event, fn);
  }
  function emit(event, payload) {
    socket.emit(event, payload || {});
  }

  // Tokens live in localStorage, keyed by room code, so that a page refresh
  // returns the player to the same seat.
  function saveToken(code, token) {
    localStorage.setItem(`shengji:token:${code}`, token);
    localStorage.setItem('shengji:last_code', code);
  }
  function loadLastToken() {
    const code = localStorage.getItem('shengji:last_code');
    if (!code) return null;
    const token = localStorage.getItem(`shengji:token:${code}`);
    if (!token) return null;
    return { code, token };
  }
  function clearToken(code) {
    localStorage.removeItem(`shengji:token:${code}`);
  }
  function saveName(name) {
    localStorage.setItem('shengji:name', name);
  }
  function loadName() {
    return localStorage.getItem('shengji:name') || '';
  }

  return { socket, on, off, emit, saveToken, loadLastToken, clearToken, saveName, loadName };
})();

window.net = net;
