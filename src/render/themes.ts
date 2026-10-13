export interface Theme {
  id: string;
  name: string;
  blurb: string;
  grass: number;
  grassDark: number;
  grassLight: number;
  ground: number;
  water: number;
  waterLight: number;
  sand: number;
  tree: number;
  treeDark: number;
  treeLight: number;
  asphalt: number;
  taxiway: number;
  apron: number;
  stand: number;
  shoulder: number;
  roof: number;
  roofAccent: number;
  glass: number;
  background: number;
  snow?: boolean;
  unlockLevel: number;
  cost: number;
}

export const THEMES: Theme[] = [
  {
    id: 'meadow',
    name: 'Meadowfield International',
    blurb: 'Rolling green fields, a lazy river and blossoming trees.',
    grass: 0x86c06c,
    grassDark: 0x79b562,
    grassLight: 0x93ca78,
    ground: 0x7aa95f,
    water: 0x4dabf7,
    waterLight: 0x74c0fc,
    sand: 0xe9d8a6,
    tree: 0x40916c,
    treeDark: 0x2d6a4f,
    treeLight: 0x52b788,
    asphalt: 0x3b424d,
    taxiway: 0x535c69,
    apron: 0xaab3bd,
    stand: 0xb9c1ca,
    shoulder: 0x9aa59c,
    roof: 0xe9eef3,
    roofAccent: 0xcfd8e2,
    glass: 0x7ec8f0,
    background: 0x6fa95a,
    unlockLevel: 1,
    cost: 0,
  },
  {
    id: 'coral',
    name: 'Coral Bay Airport',
    blurb: 'A sunny island airfield surrounded by turquoise lagoons.',
    grass: 0x9ccc65,
    grassDark: 0x8bbd55,
    grassLight: 0xadd67a,
    ground: 0xe6d5a8,
    water: 0x22b8cf,
    waterLight: 0x66d9e8,
    sand: 0xf3e3b5,
    tree: 0x2f9e44,
    treeDark: 0x2b8a3e,
    treeLight: 0x69db7c,
    asphalt: 0x3d4450,
    taxiway: 0x56606c,
    apron: 0xb3bcc4,
    stand: 0xc1c8cf,
    shoulder: 0xd8cfa8,
    roof: 0xfff8ef,
    roofAccent: 0xf1dfc8,
    glass: 0x66d9e8,
    background: 0x1fa6bd,
    unlockLevel: 3,
    cost: 800,
  },
  {
    id: 'desert',
    name: 'Sunsand Desert Hub',
    blurb: 'Golden dunes, palm oases and dazzling sunsets.',
    grass: 0xe3c58d,
    grassDark: 0xd8b77a,
    grassLight: 0xecd3a2,
    ground: 0xdcbc82,
    water: 0x3bc9db,
    waterLight: 0x99e9f2,
    sand: 0xf0d9a8,
    tree: 0x5c940d,
    treeDark: 0x2b8a3e,
    treeLight: 0x94d82d,
    asphalt: 0x45403c,
    taxiway: 0x5f5852,
    apron: 0xc2b6a6,
    stand: 0xcfc4b5,
    shoulder: 0xd6c39b,
    roof: 0xfaf3e6,
    roofAccent: 0xe9d8bd,
    glass: 0x8ce0e8,
    background: 0xd9b67c,
    unlockLevel: 5,
    cost: 1500,
  },
  {
    id: 'frost',
    name: 'Frostpeak Alpine',
    blurb: 'Snow-dusted pines, frozen lakes and crisp mountain air.',
    grass: 0xe9f0f5,
    grassDark: 0xdde7ee,
    grassLight: 0xf4f8fb,
    ground: 0xdfe7ee,
    water: 0x9ccbe8,
    waterLight: 0xc5e1f2,
    sand: 0xf8fafc,
    tree: 0x2f6f5a,
    treeDark: 0x1e4d3f,
    treeLight: 0x3d8a71,
    asphalt: 0x363d47,
    taxiway: 0x4e5763,
    apron: 0xa5aeb8,
    stand: 0xb2bac3,
    shoulder: 0xc8d2db,
    roof: 0xf8fbfd,
    roofAccent: 0xdce5ec,
    glass: 0x8fd1f5,
    background: 0xdfe8ef,
    snow: true,
    unlockLevel: 7,
    cost: 2200,
  },
];

export const THEME_BY_ID: Record<string, Theme> = Object.fromEntries(THEMES.map((t) => [t.id, t]));
