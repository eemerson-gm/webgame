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
  keyUp?: boolean;
  isUsingTool?: boolean;
  isPaused?: boolean;
  isFlying?: boolean;
  horizontalSpeed?: number;
  verticalSpeed?: number;
  activeTool?: PlayerTool;
};

export type PlayerTool = "pickaxe" | "sword";

export type TerrainTileKind = "bedrock" | "dirt" | "grass" | "lamp" | "stone";

export type WorldTerrainPayload = {
  columns: number;
  rows: number;
  surfaceStartByColumn: number[];
  solidTiles?: string[];
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

export type ConnectedPayload = {
  id: string;
  playersData: Record<string, PlayerState>;
  world: Data;
};

export const messageTypes = {
  connected: "_connected",
  disconnected: "_disconnected",
  createPlayer: "create_player",
  updatePlayer: "update_player",
  updateBlock: "update_block",
  updateBlockBreak: "update_block_break",
  knockbackPlayer: "knockback_player",
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
