import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { PlayerSession } from './server/PlayerSession.js';
import { GameRoom } from './server/GameRoom.js';
import { MSG, PLAYER_STATE } from './shared/protocol.js';
import { NET_PORT } from './shared/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load game data
const mapData = JSON.parse(readFileSync(join(__dirname, 'data/maps/dm_arena.json'), 'utf-8'));
const weaponData = JSON.parse(readFileSync(join(__dirname, 'data/weapons/assault_rifle.json'), 'utf-8'));
const charData = JSON.parse(readFileSync(join(__dirname, 'data/characters/soldier.json'), 'utf-8'));

const weaponDefs = { [weaponData.id]: weaponData };

// Express app
const app = express();

// Serve client files
app.use(express.static(join(__dirname, 'client')));

// Serve shared files (for ES module imports from client)
app.use('/shared', express.static(join(__dirname, 'shared')));

// Serve data files
app.use('/data', express.static(join(__dirname, 'data')));

// HTTP server
const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ server });

// Create game room
const room = new GameRoom(mapData, charData, weaponDefs);
room.start();

wss.on('connection', (ws) => {
  const session = new PlayerSession(ws);

  // Wait for JOIN message
  const onFirstMessage = (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === MSG.C_JOIN) {
        session.name = (msg.name || 'Player').substring(0, 16);
        room.addPlayer(session);
        ws.removeListener('message', onFirstMessage);
      }
    } catch (e) {
      // ignore
    }
  };

  ws.on('message', onFirstMessage);

  ws.on('close', () => {
    room.removePlayer(session.id);
  });
});

const port = process.env.PORT || NET_PORT;
server.listen(port, () => {
  console.log(`Soldat Web server running on http://localhost:${port}`);
});
