// Message types
export const MSG = {
  // Client -> Server
  C_JOIN:         0x01,
  C_INPUT:        0x02,
  C_CHAT:         0x03,
  C_PING:         0x04,

  // Server -> Client
  S_WELCOME:      0x10,
  S_PLAYER_JOIN:  0x11,
  S_PLAYER_LEAVE: 0x12,
  S_SNAPSHOT:     0x13,
  S_EVENT:        0x14,
  S_PONG:         0x15,
  S_CHAT:         0x16,
};

// Event subtypes
export const EVT = {
  KILL:       'kill',
  RESPAWN:    'respawn',
  WEAPON_PICKUP: 'weapon_pickup',
};

// Player states
export const PLAYER_STATE = {
  ALIVE:      0,
  DEAD:       1,
  RESPAWNING: 2,
};
