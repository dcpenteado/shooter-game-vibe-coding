import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { PlayerSession } from './server/PlayerSession.js';
import { RoomManager } from './server/RoomManager.js';
import { MSG } from './shared/protocol.js';
import { NET_PORT } from './shared/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load game data (shared across all rooms)
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

// Room manager (no rooms created yet — players create them on demand)
const roomManager = new RoomManager(mapData, charData, weaponDefs);

wss.on('connection', (ws) => {
  const session = new PlayerSession(ws);
  let assignedRoom = null;

  // Send room list immediately
  session.send({
    type: MSG.S_ROOM_LIST,
    rooms: roomManager.getRoomList(),
  });

  // Lobby message handler (active until player joins a room)
  const onLobbyMessage = (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === MSG.C_LIST_ROOMS) {
        session.send({
          type: MSG.S_ROOM_LIST,
          rooms: roomManager.getRoomList(),
        });
      }

      else if (msg.type === MSG.C_CREATE_ROOM) {
        session.name = (msg.name || 'Player').substring(0, 16);
        const roomName = (msg.roomName || 'Game Room').substring(0, 24);
        const room = roomManager.createRoom(roomName);
        room.addPlayer(session);
        assignedRoom = room;
        ws.removeListener('message', onLobbyMessage);
      }

      else if (msg.type === MSG.C_JOIN_ROOM) {
        session.name = (msg.name || 'Player').substring(0, 16);
        const room = roomManager.getRoom(msg.roomId);
        if (!room) {
          session.send({
            type: MSG.S_ROOM_LIST,
            error: 'Room no longer exists',
            rooms: roomManager.getRoomList(),
          });
        } else if (!room.addPlayer(session)) {
          session.send({
            type: MSG.S_ROOM_LIST,
            error: 'Room is full',
            rooms: roomManager.getRoomList(),
          });
        } else {
          assignedRoom = room;
          ws.removeListener('message', onLobbyMessage);
        }
      }
    } catch (e) {
      // ignore malformed messages
    }
  };

  ws.on('message', onLobbyMessage);

  ws.on('close', () => {
    if (assignedRoom) {
      assignedRoom.removePlayer(session.id);
    }
  });
});

const port = process.env.PORT || NET_PORT;
server.listen(port, () => {
  console.log(`Soldat Web server running on http://localhost:${port}`);
});
