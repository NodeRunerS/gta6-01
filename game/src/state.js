// The one shared game state object. main.js creates the renderer/scene/camera and
// fills the fields; every module reads and writes this same object (imported by
// reference, so there are no circular imports).
export const S = {
  // three.js core (set by main.js)
  scene: null,
  camera: null,
  renderer: null,
  // game flow: 'menu' | 'playing' | 'paused' | 'wasted' | 'busted'
  mode: 'menu',
  paused: false,
  time: 0, // seconds since the run started
  gameMinutes: 8 * 60 + 15, // in-world clock, starts 08:15
  muted: false,
  // player stats
  money: 0,
  health: 100,
  ammo: 12,
  ammoReserve: 48,
  weapon: 'pistol', // 'pistol' | 'fists'
  wanted: 0,
  lastCrimeAt: -999,
  // world registries
  colliders: [], // building AABBs {minX,maxX,minZ,maxZ}
  cars: [], // every Car instance (traffic + parked + police)
  pedestrians: [],
  enemies: [],
  // subsystems (set by main.js)
  player: null,
  traffic: null,
  trafficLights: null,
  lampCount: 0,
  police: null,
  missions: null,
  hud: null,
  sounds: null,
  // input
  keys: {},
  mouseDX: 0,
  mouseDY: 0,
  // mission progress
  missionIndex: 0, // next mission to start (0..5); 5 means all done
  completedMissions: [],
};
