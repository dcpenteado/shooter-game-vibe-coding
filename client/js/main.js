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

const RANDOM_NAMES = [
  "CaptainSplat",
  "JetpackJesus",
  "SgtBoomBoom",
  "FlyingMeatball",
  "RocketButt",
  "GeneralOopsie",
  "SkyChicken",
  "BulletMagnet",
  "CrashDummy",
  "LtFriendlyFire",
  "TurboNoob",
  "KamikazKev",
  "PvtPancake",
  "BlastMyAss",
  "AirborneIdiot",
  "NoobRocket",
  "FallingWithStyle",
  "MajorMalfunction",
  "JetFuelJimmy",
  "BoomHeadshot",
  "GravityHater",
  "CorpseFlyer",
  "SkyTrash",
  "BootlegPilot",
  "RespawnKing",
  "MeatMissile",
  "WastedPilot",
  "SgtSlaughter",
  "DeadOnArrival",
  "OneHitWonder",
  "ClickAndDie",
  "ProAtDying",
  "CampingInTheSky",
  "LaggySoldier",
  "AFKandDead",
  "NotEvenClose",
  "360NoScope",
  "UpAndDead",
  "OopsWrongButton",
  "SelfDestructor",
  "FriendlyOops",
  "RagdollRandy",
  "GibMaster3000",
  "YeetSoldier",
  "RocketSurgeon",
  "PanicShooter",
  "TeamKillTony",
  "NerfMePlz",
  "BarelySurvived",
  "xXDeathFartXx"
];

// --- Lobby particles ---
function createLobbyParticles() {
  const container = document.getElementById('lobby-particles');
  if (!container) return;
  const PARTICLE_COUNT = 35;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = document.createElement('div');
    p.className = 'lobby-particle';
    const size = Math.random() * 3 + 1;
    const isRed = Math.random() > 0.6;
    p.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${Math.random() * 100}%;
      bottom: ${-10 - Math.random() * 20}%;
      background: ${isRed ? `rgba(255,${60 + Math.random() * 40},${40 + Math.random() * 30},${0.4 + Math.random() * 0.4})` : `rgba(180,210,255,${0.2 + Math.random() * 0.3})`};
      box-shadow: 0 0 ${size * 2}px ${isRed ? 'rgba(255,68,68,0.3)' : 'rgba(150,200,255,0.2)'};
      animation-duration: ${8 + Math.random() * 14}s;
      animation-delay: ${Math.random() * 10}s;
    `;
    container.appendChild(p);
  }
}
createLobbyParticles();

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

  const sorted = [...rooms].sort((a, b) => {
    const aFull = a.players >= a.maxPlayers;
    const bFull = b.players >= b.maxPlayers;
    if (aFull !== bFull) return aFull ? 1 : -1;
    return b.players - a.players;
  });

  roomListEl.innerHTML = sorted.map(room => {
    const full = room.players >= room.maxPlayers;
    const active = room.players > 1 && !full;
    const cls = full ? ' room-full' : active ? ' room-active' : '';
    return `<div class="room-row${cls}" data-room-id="${room.id}">
      <span class="room-name">${escapeHtml(room.name)}</span>
      <span class="room-info">
        ${active ? '<span class="room-live-dot"></span>' : ''}
        <span class="room-players${full ? ' full' : active ? ' active' : ''}">${room.players}/${room.maxPlayers}</span>
      </span>
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

  if (game.input.isMobile) {
    // On mobile, request fullscreen for better immersion
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  } else {
    // On desktop, use pointer lock for mouse capture
    canvas.addEventListener('click', () => {
      if (!document.pointerLockElement) {
        canvas.requestPointerLock();
      }
    });
  }
};

game.onFirstSnapshot = (snap) => {
  if (snap.players && snap.players.length <= 1) {
    const popup = document.getElementById('alone-popup');
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('hidden'), 5000);
  }
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
