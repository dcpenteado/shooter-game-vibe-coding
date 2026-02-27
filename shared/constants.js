// Physics
export const GRAVITY = 980;               // px/s² downward
export const MAX_VELOCITY = 2000;         // px/s clamp
export const MAX_JET_UP_SPEED = 600;     // px/s max upward speed while jetting
export const POSITION_EPSILON = 0.5;      // reconciliation snap threshold

// Tick rates
export const SERVER_TICK_RATE = 30;       // Hz
export const CLIENT_TICK_RATE = 60;       // Hz
export const SERVER_TICK_DT = 1 / SERVER_TICK_RATE;
export const CLIENT_TICK_DT = 1 / CLIENT_TICK_RATE;

// Player defaults (overridden by character JSON)
export const DEFAULT_MOVE_SPEED = 280;
export const DEFAULT_MOVE_ACCEL = 1800;
export const DEFAULT_AIR_ACCEL = 600;
export const DEFAULT_JUMP_VEL = -450;
export const DEFAULT_MAX_FALL = 800;
export const DEFAULT_GROUND_FRICTION = 0.85;

// Jet boots defaults
export const DEFAULT_JET_THRUST = -700;
export const DEFAULT_JET_MAX_FUEL = 100;
export const DEFAULT_JET_CONSUME = 40;
export const DEFAULT_JET_REGEN = 25;
export const DEFAULT_JET_REGEN_DELAY = 300; // ms
export const DEFAULT_JET_H_BOOST = 0.3;

// Combat
export const DEFAULT_MAX_HP = 100;
export const RESPAWN_TIME_MS = 3000;

// Pickups
export const AMMO_PICKUP_INTERVAL = 20000;  // ms between periodic ammo spawns
export const AMMO_PICKUP_AMOUNT = 30;       // reserve bullets per periodic pickup
export const PICKUP_COLLECT_RADIUS = 30;    // px distance to collect
export const PICKUP_DESPAWN_TIME = 60000;   // ms until uncollected pickup despawns

// Rooms
export const MAX_PLAYERS_PER_ROOM = 16;

// Networking
export const NET_PORT = 3000;
export const INTERPOLATION_DELAY = 100;   // ms behind server time
