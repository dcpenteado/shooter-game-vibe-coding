import { Game } from './Game.js';

const canvas = document.getElementById('game-canvas');
const lobby = document.getElementById('lobby');
const lobbyStatus = document.getElementById('lobby-status');

// Step 1: Name
const stepName = document.getElementById('step-name');
const playerNameInput = document.getElementById('player-name');
const btnRandomName = document.getElementById('btn-random-name');
const btnConfirmName = document.getElementById('btn-confirm-name');

// Step 2: Rooms
const stepRooms = document.getElementById('step-rooms');
const greetingName = document.getElementById('greeting-name');
const btnChangeName = document.getElementById('btn-change-name');
const roomNameInput = document.getElementById('room-name');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnRefresh = document.getElementById('btn-refresh');
const roomListEl = document.getElementById('room-list');

const RANDOM_NAMES = ['Rocket', 'Neko', 'Bala', 'Fogo', 'Shadow', 'Pixel', 'Batata'];

const game = new Game(canvas);
let confirmedName = '';

// --- Step 1: Name flow ---

function updateConfirmButton() {
  btnConfirmName.disabled = playerNameInput.value.trim().length === 0;
}

playerNameInput.addEventListener('input', updateConfirmButton);

playerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !btnConfirmName.disabled) {
    btnConfirmName.click();
  }
});

btnRandomName.addEventListener('click', () => {
  const current = playerNameInput.value.trim();
  let name;
  do {
    name = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
  } while (name === current && RANDOM_NAMES.length > 1);
  playerNameInput.value = name;
  updateConfirmButton();
  playerNameInput.focus();
});

btnConfirmName.addEventListener('click', () => {
  confirmedName = playerNameInput.value.trim();
  if (!confirmedName) return;

  greetingName.textContent = confirmedName;
  stepName.classList.add('hidden');
  stepRooms.classList.remove('hidden');

  // Request fresh room list
  if (game.net && game.net.connected) {
    game.refreshRooms();
  }
});

btnChangeName.addEventListener('click', () => {
  stepRooms.classList.add('hidden');
  stepName.classList.remove('hidden');
  playerNameInput.focus();
  playerNameInput.select();
});

// --- Step 2: Room list ---

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

  roomListEl.querySelectorAll('.room-row:not(.room-full)').forEach(row => {
    row.addEventListener('click', () => {
      lobbyStatus.textContent = 'Joining...';
      game.joinRoom(confirmedName, row.dataset.roomId);
    });
  });
}

// --- Callbacks ---

game.onRoomListUpdate = (data) => {
  if (data.error) {
    lobbyStatus.textContent = data.error;
    lobbyStatus.classList.add('error');
    setTimeout(() => lobbyStatus.classList.remove('error'), 3000);
  } else {
    lobbyStatus.textContent = '';
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

// --- Room UI events ---

btnCreateRoom.addEventListener('click', () => {
  if (!confirmedName) return;
  const roomName = roomNameInput.value.trim() || 'Game Room';
  lobbyStatus.textContent = 'Creating room...';
  game.createRoom(confirmedName, roomName);
});

roomNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnCreateRoom.click();
});

btnRefresh.addEventListener('click', () => {
  game.refreshRooms();
});

// Auto-refresh room list every 3s while in room step
setInterval(() => {
  if (lobby.style.display !== 'none' && !stepRooms.classList.contains('hidden') && game.net && game.net.connected) {
    game.refreshRooms();
  }
}, 3000);

// --- Boot ---

async function boot() {
  await game.init();
  lobbyStatus.textContent = 'Connecting...';

  try {
    await game.connectToServer();
    lobbyStatus.textContent = '';
    playerNameInput.focus();
  } catch (err) {
    lobbyStatus.textContent = 'Cannot reach server. Refresh to retry.';
  }
}

boot();
