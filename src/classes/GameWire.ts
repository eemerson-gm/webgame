import { z } from "zod";

export const messageTypes = {
  connected: "_connected",
  disconnected: "_disconnected",
  listWorlds: "list_worlds",
  worldsUpdated: "worlds_updated",
  createWorld: "create_world",
  joinWorld: "join_world",
  leaveWorld: "leave_world",
  createPlayer: "create_player",
  updatePlayer: "update_player",
  updatePing: "update_ping",
  knockbackPlayer: "knockback_player",
  damagePlayer: "damage_player",
  damageEntity: "damage_entity",
  createEntity: "create_entity",
  updateEntity: "update_entity",
  updateEntities: "update_entities",
  ping: "ping",
  pong: "pong",
} as const;

const terrainTileKindSchema = z.enum([
  "bedrock",
  "dirt",
  "grass",
  "lamp",
  "mushroom",
  "pillarBottom",
  "pillarMiddle",
  "pillarTop",
  "spawn",
  "spawnOrb",
  "stone",
  "whiteWool",
]);

const playerStateSchema = z.object({
  id: z.string().optional(),
  x: z.union([z.number(), z.string()]).optional(),
  y: z.union([z.number(), z.string()]).optional(),
  keyLeft: z.boolean().optional(),
  keyRight: z.boolean().optional(),
  keyJump: z.boolean().optional(),
  keyDown: z.boolean().optional(),
  keyAttack: z.boolean().optional(),
  attackCycle: z.number().optional(),
  facingLeft: z.boolean().optional(),
  isPaused: z.boolean().optional(),
  isFlying: z.boolean().optional(),
  horizontalSpeed: z.number().optional(),
  verticalSpeed: z.number().optional(),
  health: z.number().optional(),
  pingMs: z.number().optional(),
});

const emptyPayloadSchema = z.object({}).strict();

const joinWorldPayloadSchema = z.object({
  worldId: z.string(),
});

const worldTerrainSchema = z.object({
  columns: z.number(),
  rows: z.number(),
  playerSpawn: z.object({
    x: z.number(),
    y: z.number(),
  }),
  surfaceStartByColumn: z.array(z.number()),
  solidTiles: z.array(z.string()).optional(),
  protectedTiles: z.array(z.string()).optional(),
  terrainTiles: z.record(z.string(), terrainTileKindSchema).optional(),
});

const slimeEntityStateSchema = z.object({
  type: z.literal("slime"),
  ownerId: z.string(),
  wanderSign: z.number().optional(),
  facingLeft: z.boolean().optional(),
  health: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  jump: z.boolean().optional(),
});

const slimeEntityPatchSchema = slimeEntityStateSchema.partial().extend({
  knockbackFromLeft: z.boolean().optional(),
});

const entitiesSnapshotSchema = z.object({
  entitiesData: z.record(z.string(), slimeEntityPatchSchema),
  removedEntityIds: z.array(z.string()).optional(),
  replaceExisting: z.boolean().optional(),
});

const worldSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  playerCount: z.number(),
});

const connectedPayloadSchema = z.object({
  id: z.string(),
  playersData: z.record(z.string(), playerStateSchema),
  entitiesData: z.record(z.string(), slimeEntityStateSchema),
  world: worldTerrainSchema,
});

const disconnectedPayloadSchema = z.object({
  id: z.string(),
});

const worldsUpdatedPayloadSchema = z.object({
  worlds: z.array(worldSummarySchema),
});

const playerKnockbackPayloadSchema = z.object({
  id: z.string().optional(),
  targetId: z.string(),
});

const playerDamageOutboundSchema = z.object({
  targetId: z.string(),
  damage: z.number().optional(),
});

const playerDamageInboundSchema = z.object({
  id: z.string(),
  targetId: z.string(),
  damage: z.number(),
});

const entityCreatePayloadSchema = z.object({
  type: z.string().optional(),
  x: z.number(),
  y: z.number(),
});

const entityUpdatePayloadSchema = z.object({
  entityId: z.string(),
  wanderSign: z.number().optional(),
  facingLeft: z.boolean().optional(),
  health: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  jump: z.boolean().optional(),
  knockbackFromLeft: z.boolean().optional(),
});

const entityDamagePayloadSchema = z.object({
  entityId: z.string(),
  damage: z.number().optional(),
  facingLeft: z.boolean().optional(),
});

const clientSendSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(messageTypes.listWorlds),
    payload: emptyPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.createWorld),
    payload: emptyPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.joinWorld),
    payload: joinWorldPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.leaveWorld),
    payload: emptyPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.createPlayer),
    payload: playerStateSchema,
  }),
  z.object({
    type: z.literal(messageTypes.updatePlayer),
    payload: playerStateSchema,
    statePatch: playerStateSchema.optional(),
  }),
  z.object({
    type: z.literal(messageTypes.updatePing),
    payload: playerStateSchema,
  }),
  z.object({
    type: z.literal(messageTypes.knockbackPlayer),
    payload: playerKnockbackPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.damagePlayer),
    payload: playerDamageOutboundSchema,
  }),
  z.object({
    type: z.literal(messageTypes.damageEntity),
    payload: entityDamagePayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.createEntity),
    payload: entityCreatePayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.updateEntity),
    payload: entityUpdatePayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.ping),
    payload: z.object({ sentAt: z.number() }),
  }),
]);

const serverToClientSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(messageTypes.connected),
    payload: connectedPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.disconnected),
    payload: disconnectedPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.worldsUpdated),
    payload: worldsUpdatedPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.createPlayer),
    payload: playerStateSchema,
  }),
  z.object({
    type: z.literal(messageTypes.updatePlayer),
    payload: playerStateSchema,
  }),
  z.object({
    type: z.literal(messageTypes.updatePing),
    payload: playerStateSchema,
  }),
  z.object({
    type: z.literal(messageTypes.knockbackPlayer),
    payload: playerKnockbackPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.damagePlayer),
    payload: playerDamageInboundSchema,
  }),
  z.object({
    type: z.literal(messageTypes.updateEntities),
    payload: entitiesSnapshotSchema,
  }),
  z.object({
    type: z.literal(messageTypes.updateEntity),
    payload: entityUpdatePayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.pong),
    payload: z.object({
      sentAt: z.number().optional(),
      id: z.string().optional(),
    }),
  }),
]);

const clientToServerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(messageTypes.listWorlds),
    payload: emptyPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.createWorld),
    payload: emptyPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.joinWorld),
    payload: joinWorldPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.leaveWorld),
    payload: emptyPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.createPlayer),
    payload: playerStateSchema,
  }),
  z.object({
    type: z.literal(messageTypes.updatePlayer),
    payload: playerStateSchema,
    statePatch: playerStateSchema.optional(),
  }),
  z.object({
    type: z.literal(messageTypes.updatePing),
    payload: playerStateSchema,
  }),
  z.object({
    type: z.literal(messageTypes.knockbackPlayer),
    payload: playerKnockbackPayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.damagePlayer),
    payload: playerDamageOutboundSchema,
  }),
  z.object({
    type: z.literal(messageTypes.damageEntity),
    payload: entityDamagePayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.createEntity),
    payload: entityCreatePayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.updateEntity),
    payload: entityUpdatePayloadSchema,
  }),
  z.object({
    type: z.literal(messageTypes.ping),
    payload: z.object({ sentAt: z.number() }),
  }),
]);

export type PlayerState = z.infer<typeof playerStateSchema>;
export type WorldTerrain = z.infer<typeof worldTerrainSchema>;
export type TerrainTileKind = z.infer<typeof terrainTileKindSchema>;
export type EntityState = z.infer<typeof slimeEntityStateSchema>;
export type EntityPatch = z.infer<typeof slimeEntityPatchSchema>;
export type SlimeEntityState = EntityState;
export type WorldSummary = z.infer<typeof worldSummarySchema>;
export type ClientSend = z.infer<typeof clientSendSchema>;
export type ServerToClient = z.infer<typeof serverToClientSchema>;
export type ClientToServer = z.infer<typeof clientToServerSchema>;

export type RelayAudience = "all" | "player" | "others";
export type RelayValidate = "playerDamage";

export type RelayRule = {
  audience: RelayAudience;
  mergesState?: boolean;
  attachPlayerId?: boolean;
  outboundType?: (typeof messageTypes)[keyof typeof messageTypes];
  drop?: boolean;
  validate?: RelayValidate;
};

export const relayRules: Record<
  (typeof messageTypes)[keyof typeof messageTypes],
  RelayRule | undefined
> = {
  [messageTypes.listWorlds]: undefined,
  [messageTypes.createWorld]: undefined,
  [messageTypes.joinWorld]: undefined,
  [messageTypes.leaveWorld]: undefined,
  [messageTypes.connected]: undefined,
  [messageTypes.disconnected]: undefined,
  [messageTypes.worldsUpdated]: undefined,
  [messageTypes.createPlayer]: {
    audience: "others",
    mergesState: true,
    attachPlayerId: true,
  },
  [messageTypes.updatePlayer]: {
    audience: "others",
    mergesState: true,
    attachPlayerId: true,
  },
  [messageTypes.updatePing]: {
    audience: "others",
    mergesState: true,
    attachPlayerId: true,
  },
  [messageTypes.knockbackPlayer]: {
    audience: "all",
    attachPlayerId: true,
  },
  [messageTypes.damagePlayer]: {
    audience: "all",
    attachPlayerId: true,
    validate: "playerDamage",
  },
  [messageTypes.damageEntity]: {
    audience: "all",
    drop: true,
    outboundType: messageTypes.updateEntities,
  },
  [messageTypes.createEntity]: {
    audience: "all",
    drop: true,
    outboundType: messageTypes.updateEntities,
  },
  [messageTypes.updateEntity]: {
    audience: "all",
    drop: true,
    outboundType: messageTypes.updateEntities,
  },
  [messageTypes.updateEntities]: undefined,
  [messageTypes.ping]: {
    audience: "player",
    outboundType: messageTypes.pong,
  },
  [messageTypes.pong]: undefined,
};

export type WorldHandlers = {
  [K in ServerToClient["type"]]?: (
    msg: Extract<ServerToClient, { type: K }>,
  ) => void;
};

const lobbyInboundTypes = new Set<string>([
  messageTypes.connected,
  messageTypes.disconnected,
  messageTypes.worldsUpdated,
]);

const playerStateMessageTypes = new Set<string>([
  messageTypes.createPlayer,
  messageTypes.updatePlayer,
  messageTypes.updatePing,
]);

export class GameWire {
  public encodeClient(message: ClientSend): string {
    const validated = clientSendSchema.parse(message);
    if (validated.type === messageTypes.updatePlayer) {
      const wire: {
        type: typeof validated.type;
        payload: typeof validated.payload;
        statePatch?: typeof validated.statePatch;
      } = {
        type: validated.type,
        payload: validated.payload,
      };
      if (validated.statePatch !== undefined) {
        wire.statePatch = validated.statePatch;
      }
      return JSON.stringify(wire);
    }
    return JSON.stringify({
      type: validated.type,
      payload: validated.payload,
    });
  }

  public parseServerToClient(json: string): ServerToClient | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      console.error("Invalid JSON message");
      return null;
    }
    const result = serverToClientSchema.safeParse(parsed);
    if (!result.success) {
      console.error("Invalid server message", result.error.flatten());
      return null;
    }
    return result.data;
  }

  public encodeServer(message: ServerToClient): string {
    const validated = serverToClientSchema.parse(message);
    return JSON.stringify({
      type: validated.type,
      payload: validated.payload,
    });
  }

  public parseClientToServer(json: string): ClientToServer | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      console.error("Invalid JSON message");
      return null;
    }
    const result = clientToServerSchema.safeParse(parsed);
    if (!result.success) {
      console.error("Invalid client message", result.error.flatten());
      return null;
    }
    return result.data;
  }

  public isLobbyClientMessage(type: ClientToServer["type"]): boolean {
    if (type === messageTypes.listWorlds) {
      return true;
    }
    if (type === messageTypes.createWorld) {
      return true;
    }
    if (type === messageTypes.joinWorld) {
      return true;
    }
    if (type === messageTypes.leaveWorld) {
      return true;
    }
    return false;
  }

  public isLobbyInbound(type: string): boolean {
    return lobbyInboundTypes.has(type);
  }

  public mergesPlayerState(type: ClientToServer["type"]): boolean {
    return playerStateMessageTypes.has(type);
  }

  public playerStatePatch(message: ClientToServer): PlayerState {
    if (message.type === messageTypes.updatePlayer) {
      if (message.statePatch !== undefined) {
        return message.statePatch;
      }
      return message.payload;
    }
    if (message.type === messageTypes.createPlayer) {
      return message.payload;
    }
    if (message.type === messageTypes.updatePing) {
      return message.payload;
    }
    return {};
  }

  public validatePlayerDamage(
    payload: z.infer<typeof playerDamageOutboundSchema>,
    playerId: string,
    hasPlayerInRoom: (targetId: string) => boolean,
  ): z.infer<typeof playerDamageInboundSchema> | null {
    const targetId = payload.targetId;
    if (!targetId) {
      return null;
    }
    if (!hasPlayerInRoom(targetId)) {
      return null;
    }
    const damage = payload.damage ?? 1;
    if (!Number.isFinite(damage) || damage <= 0) {
      return null;
    }
    const result = playerDamageInboundSchema.safeParse({
      id: playerId,
      targetId,
      damage,
    });
    if (!result.success) {
      return null;
    }
    return result.data;
  }
}
