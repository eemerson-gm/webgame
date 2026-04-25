export type Data = Record<string, any>;

export type GameMessage = {
  type: string;
  payload: Data;
  statePatch?: Data;
};

export type WireMessage = {
  _t: string;
  _p: Data;
  _d?: Data;
};

export type PlayerState = {
  id?: string;
  x?: number | string;
  y?: number | string;
  keyLeft?: boolean;
  keyRight?: boolean;
  keyJump?: boolean;
  horizontalSpeed?: number;
  verticalSpeed?: number;
};

export type TerrainTileKind = "bedrock" | "dirt" | "grass" | "stone";

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
} as const;

const fieldAliases = [
  { readable: "keyLeft", wire: "kl" },
  { readable: "keyRight", wire: "kr" },
  { readable: "keyJump", wire: "kj" },
  { readable: "horizontalSpeed", wire: "sh" },
  { readable: "verticalSpeed", wire: "sv" },
] as const;

const wireFieldByReadableField = Object.fromEntries(
  fieldAliases.map(({ readable, wire }) => [readable, wire]),
) as Record<string, string>;

const readableFieldByWireField = Object.fromEntries(
  fieldAliases.map(({ readable, wire }) => [wire, readable]),
) as Record<string, string>;

const isData = (value: unknown): value is Data => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const hasFields = (data: Data) => {
  return Object.keys(data).length > 0;
};

const translateFields = (
  value: unknown,
  fieldNames: Record<string, string>,
) => {
  if (Array.isArray(value)) {
    return value.map((item) => translateFields(item, fieldNames));
  }
  if (!isData(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([fieldName, fieldValue]) => [
      fieldNames[fieldName] ?? fieldName,
      translateFields(fieldValue, fieldNames),
    ]),
  );
};

export const encodePayload = (payload: Data) => {
  return translateFields(payload, wireFieldByReadableField) as Data;
};

export const decodePayload = (payload: Data) => {
  return translateFields(payload, readableFieldByWireField) as Data;
};

export const encodeMessage = (message: GameMessage) => {
  const wireMessage: WireMessage = {
    _t: message.type,
    _p: encodePayload(message.payload),
  };
  if (message.statePatch && hasFields(message.statePatch)) {
    return JSON.stringify({
      ...wireMessage,
      _d: encodePayload(message.statePatch),
    });
  }
  return JSON.stringify(wireMessage);
};

export const decodeMessage = (json: string): GameMessage => {
  const wireMessage = JSON.parse(json) as WireMessage;
  return {
    type: wireMessage._t,
    payload: decodePayload(wireMessage._p ?? {}),
    statePatch: decodePayload(wireMessage._d ?? {}),
  };
};
