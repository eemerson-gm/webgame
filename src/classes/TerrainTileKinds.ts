import type { TerrainTileKind } from "./GameProtocol";

export const terrainTileKinds = [
  "bedrock",
  "dirt",
  "grass",
  "lamp",
  "pillarBottom",
  "pillarMiddle",
  "pillarTop",
  "spawn",
  "spawnOrb",
  "stone",
  "whiteWool",
] as const satisfies readonly TerrainTileKind[];

const solidTerrainTileKinds: readonly TerrainTileKind[] = [
  "bedrock",
  "dirt",
  "grass",
  "lamp",
  "spawn",
  "stone",
  "whiteWool",
] as const;

const breakableTerrainTileKinds: readonly TerrainTileKind[] = [
  "dirt",
  "grass",
  "lamp",
  "stone",
  "whiteWool",
] as const;

export const isTerrainTileKind = (kind: unknown): kind is TerrainTileKind =>
  terrainTileKinds.includes(kind as TerrainTileKind);

export const isSolidTerrainTileKind = (kind: TerrainTileKind) =>
  solidTerrainTileKinds.includes(kind);

export const isBreakableTerrainTileKind = (kind: TerrainTileKind) =>
  breakableTerrainTileKinds.includes(kind);

export const solidTerrainTileKeys = (
  terrainTiles: Record<string, TerrainTileKind>,
) =>
  Object.entries(terrainTiles)
    .filter(([_key, kind]) => isSolidTerrainTileKind(kind))
    .map(([key]) => key);
