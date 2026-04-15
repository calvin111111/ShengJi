// Sheng Ji server entry point.
//
// Serves static client files and attaches the Socket.IO event router. A
// single Node process handles both HTTP and WebSocket traffic on the same
// port, which means Railway's single-port HTTPS proxy works without CORS
// configuration and players on different networks all share the same lobby.

const http = require('http');
const path = require('path');
const express = require('express');
const { Server } = require('socket.io');
const { attach } = require('./src/events');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  // Same-origin; no CORS config needed.
  serveClient: true,
});

attach(io);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Sheng Ji server listening on 0.0.0.0:${PORT}`);
});
