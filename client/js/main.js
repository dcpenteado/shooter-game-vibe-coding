import { Game } from './Game.js';

const canvas = document.getElementById('game-canvas');
const lobby = document.getElementById('lobby');
const playerNameInput = document.getElementById('player-name');
const roomNameInput = document.getElementById('room-name');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnRefresh = document.getElementById('btn-refresh');
const roomListEl = document.getElementById('room-list');
const lobbyStatus = document.getElementById('lobby-status');

const game = new Game(canvas);

// --- Room list rendering ---

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function renderRoomList(rooms) {
  if (rooms.length === 0) {
    roomListEl.innerHTML = '<div id="room-list-empty">No rooms yet. Create one!</div>';
    return;
  }

  roomListEl.innerHTML = rooms.map(room => {
    const full = room.players >= room.maxPlayers;
    return `<div class="room-row${full ? ' room-full' : ''}" data-room-id="${room.id}">
      <span class="room-name">${escapeHtml(room.name)}</span>
      <span class="room-players${full ? ' full' : ''}">${room.players}/${room.maxPlayers}</span>
    </div>`;
  }).join('');

  // Click to join (non-full rooms only)
  roomListEl.querySelectorAll('.room-row:not(.room-full)').forEach(row => {
    row.addEventListener('click', () => {
      const roomId = row.dataset.roomId;
      const playerName = playerNameInput.value.trim() || 'Player';
      lobbyStatus.textContent = 'Joining...';
      game.joinRoom(playerName, roomId);
    });
  });
}

// --- Callbacks ---

game.onRoomListUpdate = (data) => {
  if (data.error) {
    lobbyStatus.textContent = data.error;
  }
  renderRoomList(data.rooms || []);
};

game.onJoinedRoom = () => {
  lobby.style.display = 'none';
  canvas.addEventListener('click', () => {
    if (!document.pointerLockElement) {
      canvas.requestPointerLock();
    }
  });
};

// --- UI Events ---

btnCreateRoom.addEventListener('click', () => {
  const playerName = playerNameInput.value.trim() || 'Player';
  const roomName = roomNameInput.value.trim() || 'Game Room';
  lobbyStatus.textContent = 'Creating room...';
  game.createRoom(playerName, roomName);
});

btnRefresh.addEventListener('click', () => {
  game.refreshRooms();
});

// Auto-refresh room list every 3s while lobby is visible
setInterval(() => {
  if (lobby.style.display !== 'none' && game.net && game.net.connected) {
    game.refreshRooms();
  }
}, 3000);

// --- Boot ---

async function boot() {
  await game.init();
  lobbyStatus.textContent = 'Connecting to server...';

  try {
    await game.connectToServer();
    lobbyStatus.textContent = 'Select a room or create one.';
  } catch (err) {
    lobbyStatus.textContent = 'Cannot reach server. Refresh to retry.';
  }
}

boot();
