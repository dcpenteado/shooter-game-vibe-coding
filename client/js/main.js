import { Game } from './Game.js';

const canvas = document.getElementById('game-canvas');
const lobby = document.getElementById('lobby');
const btnConnect = document.getElementById('btn-connect');
const playerNameInput = document.getElementById('player-name');
const lobbyStatus = document.getElementById('lobby-status');

const game = new Game(canvas);

async function boot() {
  await game.init();
  lobbyStatus.textContent = 'Ready. Enter your name and connect.';
}

btnConnect.addEventListener('click', async () => {
  const name = playerNameInput.value.trim() || 'Player';
  btnConnect.disabled = true;
  lobbyStatus.textContent = 'Connecting...';

  try {
    await game.connect(name);
    lobby.style.display = 'none';
    // Click canvas to engage pointer lock for mouse aiming
    canvas.addEventListener('click', () => {
      if (!document.pointerLockElement) {
        canvas.requestPointerLock();
      }
    });
  } catch (err) {
    lobbyStatus.textContent = 'Failed to connect. Is the server running?';
    btnConnect.disabled = false;
  }
});

playerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnConnect.click();
});

boot();
