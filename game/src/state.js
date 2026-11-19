// World layout and the one shared mutable state object for Solmar City:
// Streets of Gold. Two islands split by a turquoise bay, three bridges,
// a mansion island on a causeway, and an Ocean Beach strip on the east.
import { clamp } from './util.js';

const WEST = { x0: -224, x1: -56, z0: -196, z1: 196 };
const EAST = { x0: 56, x1: 224, z0: -196, z1: 196 };
const BAY = { x0: -56, x1: 56 };
const BEACH = { x0: 224, x1: 252, z0: -196, z1: 196 };
const MANSION = { x0: -26, x1: 26, z0: 178, z1: 214 };
const CAUSEWAY = { x0: 26, x1: 60, z0: 186, z1: 206 }; // widened: 2.5u shoulders so lamps stand off the road

export const WORLD = {
  west: WEST,
  east: EAST,
  bay: BAY,
  beach: BEACH,
  mansion: MANSION,
  causeway: CAUSEWAY,
  avenuesWest: [-196, -140, -84],
  avenuesEast: [84, 140, 196],
  streets: [-168, -112, -56, 0, 56, 112, 168],
  bridgeZ: [-112, 0, 112],
  bridgeHalf: 8,
  roadHalf: 5,
};

export function inRect(x, z, r) {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

export function onBridge(x, z) {
  if (x < -60 || x > 60) return false;
  for (const bz of WORLD.bridgeZ) {
    if (Math.abs(z - bz) <= WORLD.bridgeHalf) return true;
  }
  return false;
}

export function onCauseway(x, z) {
  return inRect(x, z, CAUSEWAY);
}

export function isLand(x, z) {
  return (
    inRect(x, z, WEST) ||
    inRect(x, z, EAST) ||
    inRect(x, z, MANSION) ||
    inRect(x, z, BEACH) ||
    onCauseway(x, z) ||
    onBridge(x, z)
  );
}

export function isWater(x, z) {
  return !isLand(x, z);
}

// Is (x,z) on a drivable road? Traffic, police and spawn placement use this.
export function onRoad(x, z) {
  if (onBridge(x, z) || onCauseway(x, z)) return true;
  if (!isLand(x, z)) return false;
  for (const a of [...WORLD.avenuesWest, ...WORLD.avenuesEast]) {
    if (Math.abs(x - a) <= WORLD.roadHalf) return true;
  }
  for (const s of WORLD.streets) {
    if (Math.abs(z - s) <= WORLD.roadHalf) return true;
  }
  return false;
}

export function clampToLand(x, z) {
  return { x: clamp(x, -224, 252), z: clamp(z, -196, 214) };
}

// The one shared mutable state object every module reads and writes.
export const S = {
  mode: 'menu', // menu | playing | paused | wasted | busted
  time: 0,
  clockMin: 18 * 60 + 42, // 18:42, golden-hour dusk
  paused: false,
  lowfx: false,
  scene: null,
  camera: null,
  renderer: null,
  keys: {},
  player: null,
  traffic: [],
  pedestrians: [],
  police: [],
  roadblocks: [],
  swatVans: [],
  policeHeli: null,
  boats: [],
  heli: null,
  trafficLights: null,
  cranes: null,
  shellsCollected: [],
  shellSpots: null,
  shellMeshes: null,
  lampCount: 0,
  buildingCount: 0,
  palmCount: 0,
  missionIndex: 0,
  mission: null, // { def, index, step, enemies, remaining }
  missionMarker: null,
  courier: null,
  money: 200,
  ownedBusinesses: [],
  safehouseOwned: false,
  gunshop: null,
  safehouse: null,
  businesses: [],
  radio: { on: false, station: 0 },
  audio: null,
  stats: { carsStolen: 0, kills: 0, missionsDone: 0, moneyEarned: 0 },
  saveExists: false,
  camYaw: 0,
  camPitch: 0.32,
  camDist: 9,
  menuAngle: 0,
  headlightsOn: true,
  aiming: false,
  drawCalls: 0,
  fps: 0,
};
