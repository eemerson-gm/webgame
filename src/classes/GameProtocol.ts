export type Data = Record<string, any>;

export type GameMessage = {
  type: string;
  payload: Data;
  statePatch?: Data;
};

export type WireMessage = {
  type: string;
  payload: Data;
  statePatch?: Data;
};

export type PlayerState = {
  id?: string;
  x?: number | string;
  y?: number | string;
  keyLeft?: boolean;
  keyRight?: boolean;
  keyJump?: boolean;
  keyDown?: boolean;
  isUsingPowerup?: boolean;
  isPaused?: boolean;
  isFlying?: boolean;
  horizontalSpeed?: number;
  verticalSpeed?: number;
  health?: number;
  pingMs?: number;
  activePowerup?: PlayerPowerup;
};

export type PlayerPowerup = "none" | "miner";

export type EntityType = "slime";

export type EntityState = {
  id: string;
  type: EntityType;
  ownerId?: string;
  x: number;
  y: number;
  horizontalSpeed: number;
  verticalSpeed: number;
  facingLeft: boolean;
  isGrounded: boolean;
  isJumping: boolean;
  health: number;
  knockbackMs: number;
  targetPlayerId?: string;
};

export type EntitiesSnapshotPayload = {
  entitiesData: Record<string, EntityState>;
  removedEntityIds?: string[];
  replaceExisting?: boolean;
};

export type EntityUpdatePayload = {
  entity: EntityState;
};

export type EntityCreatePayload = {
  type: EntityType;
  x: number;
  y: number;
};

export type TerrainTileKind =
  | "bedrock"
  | "dirt"
  | "grass"
  | "lamp"
  | "pillarBottom"
  | "pillarMiddle"
  | "pillarTop"
  | "spawn"
  | "spawnOrb"
  | "stone"
  | "whiteWool";

export type WorldTerrainPayload = {
  columns: number;
  rows: number;
  playerSpawn: {
    x: number;
    y: number;
  };
  surfaceStartByColumn: number[];
  solidTiles?: string[];
  protectedTiles?: string[];
  terrainTiles?: Record<string, TerrainTileKind>;
};

export type TerrainBlockUpdate = {
  id?: string;
  column: number;
  row: number;
  solid: boolean;
  kind?: TerrainTileKind;
};

export type TerrainBlockBreakUpdate = {
  id?: string;
  column: number;
  row: number;
  isBreaking: boolean;
  breakDurationMs?: number;
};

export type PlayerKnockbackUpdate = {
  id?: string;
  targetId: string;
};

export type PlayerDamageUpdate = {
  id?: string;
  targetId: string;
  damage?: number;
};

export type EntityDamageUpdate = {
  id?: string;
  entityId: string;
  damage?: number;
};

export type ParticleKind = "smash";

export type ParticleCreatePayload = {
  id?: string;
  kind: ParticleKind;
  x: number;
  y: number;
};

export type ConnectedPayload = {
  id: string;
  playersData: Record<string, PlayerState>;
  entitiesData: Record<string, EntityState>;
  world: Data;
};

export const messageTypes = {
  connected: "_connected",
  disconnected: "_disconnected",
  createPlayer: "create_player",
  updatePlayer: "update_player",
  updatePing: "update_ping",
  updateBlock: "update_block",
  updateBlockBreak: "update_block_break",
  knockbackPlayer: "knockback_player",
  damagePlayer: "damage_player",
  damageEntity: "damage_entity",
  createEntity: "create_entity",
  updateEntity: "update_entity",
  updateEntities: "update_entities",
  createParticle: "create_particle",
  ping: "ping",
  pong: "pong",
} as const;

export const encodeMessage = (message: GameMessage) => {
  const wireMessage: WireMessage = {
    type: message.type,
    payload: message.payload,
  };
  if (message.statePatch !== undefined) {
    return JSON.stringify({
      ...wireMessage,
      statePatch: message.statePatch,
    });
  }
  return JSON.stringify(wireMessage);
};

export const decodeMessage = (json: string): GameMessage => {
  const wireMessage = JSON.parse(json) as WireMessage;
  const message = {
    type: wireMessage.type,
    payload: wireMessage.payload ?? {},
  };
  if (wireMessage.statePatch !== undefined) {
    return {
      ...message,
      statePatch: wireMessage.statePatch,
    };
  }
  return message;
};
