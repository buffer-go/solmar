// SOLMAR — Streets of Solmar: tuning, palette, city constants, missions.
// Everything the sim and the renderer agree on lives here, in one place.

export const WORLD = { w: 3600, h: 2600, beachX: 320, seaX: 0 };

export const ROADS_X = [560, 960, 1360, 1760, 2160, 2560, 2960, 3360];
export const ROADS_Y = [360, 760, 1160, 1560, 1960, 2360];
export const ROAD_W = 96;
export const SIDEWALK = 26;

export const PLACES = {
  garage: { name: 'Garage Marina', x: 960, y: 360 },
  hotel: { name: 'Hotel Mirada', x: 2560, y: 760 },
  port: { name: 'Port Solmar', x: 3360, y: 2360 },
  hideout: { name: 'Hideout', x: 560, y: 1960 },
  bank: { name: 'Solmar Bank', x: 1760, y: 1160 },
  hospital: { name: 'Solmar General', x: 2160, y: 360 },
  station: { name: 'Police Station', x: 1360, y: 2360 },
};

export const START_CASH = 120;
export const START_POS = { x: 620, y: 1900 };

export const PLAYER = {
  walk: 210,
  run: 330,
  radius: 14,
  health: 100,
  punchDamage: 10,
  punchRange: 46,
};

export const CAR = {
  length: 64,
  width: 32,
  accel: 560,
  maxSpeed: 560,
  reverseMax: 180,
  steer: 2.6,
  health: 100,
  axle: 20,
  axleRadius: 18,
  wallDamage: 8,
  wallDamageCooldown: 0.6,
  wallSpeedCut: 0.55,
  wallDamageSpeed: 180,
};

export const TRAFFIC_COUNT = 12;
export const PED_COUNT = 16;
export const PICKUP_COUNT = 8;
export const PICKUP_VALUE = 50;
export const PICKUP_RESPAWN = 25;
export const PARTICLE_MAX = 48;

export const POLICE = {
  chaseSpeed: 520,
  ramDamage: 6,
  ramCooldown: 2.0,
  maxCars: 4,
  spawnDist: 800,
  footHoldTime: 2.0,
  footSpeed: 240,
  copHealth: 30,
};

export const WANTED = {
  max: 5,
  decaySeconds: 14,
  quietRadius: 400,
};

export const GUN = { mag: 12, reserve: 48, damage: 25, range: 520 };

export const MISSIONS = [
  {
    id: 'hot-wheels',
    name: 'Hot Wheels',
    giver: 'Mama Luz',
    reward: 300,
    brief: 'Steal a car and bring it to Garage Marina.',
    stages: ['Steal any car', 'Drive to Garage Marina'],
  },
  {
    id: 'sunset-courier',
    name: 'Sunset Courier',
    giver: 'Mama Luz',
    reward: 500,
    brief: 'Pick up the package at Port Solmar, deliver to Hotel Mirada in 75 s.',
    stages: ['Pick up at Port Solmar', 'Deliver to Hotel Mirada — 75 s'],
    timeLimit: 75,
  },
  {
    id: 'lose-the-heat',
    name: 'Lose the Heat',
    giver: 'Mama Luz',
    reward: 700,
    brief: 'Get the heat up to 3 stars, then shake it all off.',
    stages: ['Reach 3 wanted stars', 'Lose every star'],
  },
  {
    id: 'the-big-one',
    name: 'The Big One',
    giver: 'Mama Luz',
    reward: 1500,
    brief: 'Four drops are out while the heat is on. Grab them all, then vanish at the hideout.',
    stages: ['Collect 4 drops while wanted', 'Return to the Hideout'],
    drops: 4,
  },
];

export const COLORS = {
  sea: '#2fa8a0',
  seaDeep: '#1f8a94',
  sand: '#e8d5a3',
  grass: '#7fae62',
  grassDark: '#6d9c55',
  sidewalk: '#c9c2b4',
  road: '#3a3f4a',
  roadLine: '#e8d44d',
  park: '#5d9b4e',
  buildingRoof: ['#e07856', '#e8a34c', '#7fb3d5', '#c98bb0', '#8ec9a3', '#d5c06a', '#9a8fd0'],
  buildingWall: '#f2e8d5',
  tree: '#3f7d3a',
  treeDark: '#2f6130',
  player: '#f5c518',
  police: '#20242e',
  policeLight: '#e23b3b',
  policeLight2: '#3b6fe2',
  hudBg: 'rgba(10, 14, 22, 0.72)',
  hudText: '#f5f1e6',
  banner: '#f5c518',
};
