import * as ex from "excalibur";
import { BlockTargetingHighlight } from "./actors/BlockTargetingHighlight";
import { Player } from "./actors/Player";
import { PlayerHealthDisplay } from "./actors/PlayerHealthDisplay";
import { Slime } from "./actors/Slime";
import { SmashParticleActor } from "./actors/SmashParticleActor";
import { Resources } from "./resource";
import { GameClient } from "./classes/GameClient";
import { messageTypes } from "./classes/GameProtocol";
import { toolbarSelection } from "./classes/ToolbarSelection";
import type {
  Data,
  EntitiesSnapshotPayload,
  EntityState,
  ParticleCreatePayload,
  PlayerDamageUpdate,
  PlayerKnockbackUpdate,
  TerrainBlockBreakUpdate,
  PlayerState,
  TerrainBlockUpdate,
  WorldTerrainPayload,
} from "./classes/GameProtocol";
import { TerrainTileMap } from "./classes/TerrainTileMap";
import { TileLightingOverlay } from "./classes/TileLightingOverlay";
import { DynamicLightSource } from "./classes/DynamicLightSource";
import { TILE_PX } from "./world/worldConfig";

const localPlayerSlot = { player: null as Player | null };
const playerById: Record<string, Player> = {};
const playerLightById: Record<string, DynamicLightSource> = {};
const playerPingById: Record<string, number | undefined> = {};
const pingLoopSlot = { intervalId: null as number | null };
const slimeById: Record<string, Slime> = {};
const worldSession = {
  terrain: null as TerrainTileMap | null,
  dynamicLighting: null as TileLightingOverlay | null,
};
const blockTargetingSlot = {
  highlight: null as BlockTargetingHighlight | null,
};
const remotePlayerPositionTolerance = 0.5;
const pingIntervalMs = 2000;
const syncLocalPauseState = (isPaused: boolean = document.hidden) => {
  localPlayerSlot.player?.syncPauseState(isPaused);
};
const expireLocalPowerup = () => {
  localPlayerSlot.player?.stopBlockBreakAction();
  localPlayerSlot.player?.syncPowerupState("none");
};
const addLocalPauseListeners = () => {
  document.addEventListener("visibilitychange", () => syncLocalPauseState());
  window.addEventListener("pagehide", () => syncLocalPauseState(true));
  window.addEventListener("pageshow", () => syncLocalPauseState(false));
  document.addEventListener("freeze", () => syncLocalPauseState(true));
  document.addEventListener("resume", () => syncLocalPauseState(false));
};

const loader = new ex.DefaultLoader({
  loadables: Object.values(Resources),
});

const viewWidth = 320;
const viewHeight = 180;
const browserActionGameKeyCodes = [
  "Tab",
  "Space",
  "KeyR",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
];

const game = new ex.Engine({
  width: viewWidth,
  height: viewHeight,
  canvasElementId: "game",
  antialiasing: false,
  backgroundColor: ex.Color.fromHex("#54C0CA"),
  pixelArt: true,
  snapToPixel: false,
  pixelRatio: 3,
  displayMode: ex.DisplayMode.FitContainer,
  fixedUpdateFps: 60,
});

const focusGameCanvas = (engine: ex.Engine) => {
  engine.canvas.tabIndex = 0;
  engine.canvas.addEventListener("pointerdown", () => engine.canvas.focus());
  engine.canvas.addEventListener("keydown", (event) => {
    if (!browserActionGameKeyCodes.includes(event.code)) {
      return;
    }
    event.preventDefault();
    if (event.code !== "KeyR") {
      return;
    }
    toolbarSelection.setPowerup("miner");
    localPlayerSlot.player?.syncPowerupState("miner");
  });
};

const playerListElement = () => document.getElementById("player-list");

const playerDisplayName = (playerId: string) => {
  if (playerId === clientSlot.client?.clientId) {
    return `Player ${playerId} (you)`;
  }
  return `Player ${playerId}`;
};

const playerPingText = (playerId: string) => {
  const pingMs = playerPingById[playerId];
  if (pingMs === undefined) {
    return "-- ms";
  }
  return `${Math.round(pingMs)} ms`;
};

const playerListIds = () =>
  [
    clientSlot.client?.clientId,
    ...Object.keys(playerById),
    ...Object.keys(playerPingById),
  ]
    .filter((playerId): playerId is string => !!playerId)
    .filter(
      (playerId, index, playerIds) => playerIds.indexOf(playerId) === index,
    )
    .sort((a, b) => Number(a) - Number(b));

const createPlayerListRow = (playerId: string) => {
  const row = document.createElement("div");
  const name = document.createElement("span");
  const ping = document.createElement("span");
  row.className = "player-list__row";
  ping.className = "player-list__ping";
  name.textContent = playerDisplayName(playerId);
  ping.textContent = playerPingText(playerId);
  row.replaceChildren(name, ping);
  return row;
};

const renderPlayerList = () => {
  const list = playerListElement();
  if (!list) {
    return;
  }
  list.replaceChildren(...playerListIds().map(createPlayerListRow));
};

const rememberPlayerPings = (playersData: Record<string, PlayerState>) => {
  Object.entries(playersData).forEach(([playerId, state]) => {
    playerPingById[playerId] = state.pingMs;
  });
};

const isWorldTerrainPayload = (w: Data): w is WorldTerrainPayload => {
  if (!w) {
    return false;
  }
  if (typeof w.columns !== "number" || typeof w.rows !== "number") {
    return false;
  }
  if (!Array.isArray(w.surfaceStartByColumn)) {
    return false;
  }
  if (w.surfaceStartByColumn.length !== w.columns) {
    return false;
  }
  if (!w.playerSpawn) {
    return false;
  }
  if (typeof w.playerSpawn.x !== "number") {
    return false;
  }
  if (w.protectedTiles !== undefined && !Array.isArray(w.protectedTiles)) {
    return false;
  }
  return typeof w.playerSpawn.y === "number";
};

const removePlayerLight = (playerId: string) => {
  const source = playerLightById[playerId];
  if (!source) {
    return;
  }
  worldSession.dynamicLighting?.removeDynamicLight(source);
  delete playerLightById[playerId];
};

const addPlayerLight = (playerId: string, player: Player) => {
  const lighting = worldSession.dynamicLighting;
  if (!lighting) {
    return;
  }
  removePlayerLight(playerId);
  const source = DynamicLightSource.forActor(player, {
    radius: TILE_PX * 7,
    intensity: 0.9,
    isEnabled: () => player.isAlive(),
  });
  playerLightById[playerId] = source;
  lighting.addDynamicLight(source);
};

const spawnPlayerAt = (
  game: ex.Engine,
  terrain: TerrainTileMap,
  playerId: string,
  x: number,
  y: number,
) => {
  playerById[playerId] = new Player(
    ex.vec(x, y),
    terrain.map,
    undefined,
    terrain.tileCollisionWorld(),
  );
  game.add(playerById[playerId]);
  addPlayerLight(playerId, playerById[playerId]);
  return playerById[playerId];
};

const applyPositionFromPayloadIfPresent = (
  player: Player,
  payload: PlayerState,
  tolerance: number = remotePlayerPositionTolerance,
) => {
  if (payload.x === undefined && payload.y === undefined) {
    return;
  }
  const nextPosition = ex.vec(
    payload.x === undefined ? player.pos.x : Number(payload.x),
    payload.y === undefined ? player.pos.y : Number(payload.y),
  );
  if (player.pos.distance(nextPosition) < tolerance) {
    return;
  }
  player.pos = nextPosition;
};

const syncMovementFieldsFromPayload = (
  player: Player,
  payload: PlayerState,
) => {
  if (payload.isPaused !== undefined) {
    player.setPaused(payload.isPaused);
  }
  player.keyLeft = payload.keyLeft ?? player.keyLeft;
  player.keyRight = payload.keyRight ?? player.keyRight;
  player.keyJump = payload.keyJump ?? player.keyJump;
  player.keyDown = payload.keyDown ?? player.keyDown;
  if (payload.activePowerup !== undefined) {
    player.syncPowerupState(payload.activePowerup);
  }
  if (payload.isUsingPowerup !== undefined) {
    player.syncBlockBreakActionState(
      payload.isUsingPowerup,
      undefined,
      payload.activePowerup,
    );
  }
  if (payload.health !== undefined) {
    player.syncHealth(payload.health);
  }
  player.isFlying = payload.isFlying ?? player.isFlying;
  player.hspeed = payload.horizontalSpeed ?? player.hspeed;
  player.vspeed = payload.verticalSpeed ?? player.vspeed;
};

const playerStateFromActor = (
  playerId: string,
  player: Player,
): [string, PlayerState] => [
  playerId,
  {
    id: playerId,
    x: player.pos.x,
    y: player.pos.y,
    isPaused: player.isPaused,
    isFlying: player.isFlying,
    isUsingPowerup: player.isUsingPowerup,
    horizontalSpeed: player.hspeed,
    verticalSpeed: player.vspeed,
    health: player.health,
    pingMs: playerPingById[playerId],
    activePowerup: player.currentPowerup(),
  },
];

const localPlayerStateEntries = (): [string, PlayerState][] => {
  const localPlayer = localPlayerSlot.player;
  const localPlayerId = clientSlot.client?.clientId;
  if (!localPlayer || !localPlayerId) {
    return [];
  }
  return [playerStateFromActor(localPlayerId, localPlayer)];
};

const currentPlayersData = () =>
  Object.fromEntries([
    ...localPlayerStateEntries(),
    ...Object.entries(playerById).map(([playerId, player]) =>
      playerStateFromActor(playerId, player),
    ),
  ]);

const applyRemotePlayerUpdate = (payload: Data) => {
  const playerState = payload as PlayerState;
  const playerId = playerState.id as string;
  const player = playerById[playerId];
  if (!player) {
    return;
  }
  applyPositionFromPayloadIfPresent(player, playerState);
  if (playerState.isPaused) {
    blockTargetingSlot.highlight?.removeRemoteBreakAnimation(playerId);
  }
  syncMovementFieldsFromPayload(player, playerState);
};

const joinExistingRemotePlayers = (
  game: ex.Engine,
  terrain: TerrainTileMap,
  myPlayerId: string,
  playersData: Record<string, PlayerState>,
) => {
  Object.entries(playersData).forEach(([peerId, row]) => {
    if (peerId === myPlayerId) {
      return;
    }
    const x = Number(row.x);
    const y = Number(row.y);
    const player = spawnPlayerAt(game, terrain, peerId, x, y);
    syncMovementFieldsFromPayload(player, row);
  });
};

const spawnSlimeFromState = (game: ex.Engine, state: EntityState) => {
  const slime = new Slime(state, {
    world: () => worldSession.terrain?.tileCollisionWorld() ?? null,
    playersData: currentPlayersData,
    clientId: () => clientSlot.client?.clientId ?? "",
    sendState: (entity) =>
      clientSlot.client?.send(messageTypes.updateEntity, { entity }),
  });
  slimeById[state.id] = slime;
  game.add(slime);
  return slime;
};

const applyEntityState = (state: EntityState) => {
  if (state.type !== "slime") {
    return;
  }
  if (state.health <= 0) {
    const slime = slimeById[state.id];
    slime?.kill();
    delete slimeById[state.id];
    return;
  }
  const slime = slimeById[state.id];
  if (slime) {
    slime.syncFromState(state);
    return;
  }
  const terrain = worldSession.terrain;
  if (!terrain) {
    return;
  }
  spawnSlimeFromState(game, state);
};

const applyEntitiesSnapshot = (payload: Data) => {
  const {
    entitiesData,
    removedEntityIds = [],
    replaceExisting = true,
  } = payload as EntitiesSnapshotPayload;
  if (!entitiesData) {
    return;
  }
  Object.values(entitiesData).forEach((state) => applyEntityState(state));
  removedEntityIds.forEach((slimeId) => {
    slimeById[slimeId]?.kill();
    delete slimeById[slimeId];
  });
  if (!replaceExisting) {
    return;
  }
  Object.keys(slimeById)
    .filter((slimeId) => !entitiesData[slimeId])
    .forEach((slimeId) => {
      slimeById[slimeId].kill();
      delete slimeById[slimeId];
    });
};

const applyTerrainBlockUpdate = (payload: Data) => {
  const terrain = worldSession.terrain;
  if (!terrain) {
    return;
  }
  terrain.applyBlockUpdate(payload as TerrainBlockUpdate);
};

const applyTerrainBlockBreakUpdate = (payload: Data) => {
  blockTargetingSlot.highlight?.applyRemoteBreakUpdate(
    payload as TerrainBlockBreakUpdate,
  );
};

const applyParticleCreate = (payload: Data) => {
  const particle = payload as ParticleCreatePayload;
  const x = Number(particle.x);
  const y = Number(particle.y);
  if (particle.kind !== "smash") {
    return;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  game.add(new SmashParticleActor(ex.vec(x, y)));
};

const playerForKnockbackId = (playerId: string) => {
  if (clientSlot.client?.clientId === playerId) {
    return localPlayerSlot.player;
  }
  return playerById[playerId] ?? null;
};

const applyPlayerKnockbackUpdate = (payload: Data) => {
  const update = payload as PlayerKnockbackUpdate;
  if (!update.id) {
    return;
  }
  const attacker = playerForKnockbackId(update.id);
  const target = playerForKnockbackId(update.targetId);
  if (!attacker || !target) {
    return;
  }
  target.knockBackFrom(attacker);
};

const applyPlayerDamageUpdate = (payload: Data) => {
  const update = payload as PlayerDamageUpdate;
  if (!update.id) {
    return;
  }
  const attacker = playerForKnockbackId(update.id);
  const target = playerForKnockbackId(update.targetId);
  if (!attacker || !target) {
    return;
  }
  target.takeDamageFrom(attacker, update.damage, "flash");
};

const applyPlayerPingUpdate = (payload: Data) => {
  const playerId = String(payload.id ?? "");
  const pingMs = Number(payload.pingMs);
  if (!playerId || !Number.isFinite(pingMs)) {
    return;
  }
  playerPingById[playerId] = pingMs;
  renderPlayerList();
};

const applyPongUpdate = (client: GameClient, payload: Data) => {
  const sentAt = Number(payload.sentAt);
  if (!Number.isFinite(sentAt)) {
    return;
  }
  const pingMs = Math.max(0, Math.round(performance.now() - sentAt));
  playerPingById[client.clientId] = pingMs;
  renderPlayerList();
  client.send(messageTypes.updatePing, { pingMs });
};

const sendPing = (client: GameClient) => {
  client.send(messageTypes.ping, { sentAt: performance.now() });
};

const startPingLoop = (client: GameClient) => {
  if (pingLoopSlot.intervalId !== null) {
    return;
  }
  sendPing(client);
  pingLoopSlot.intervalId = window.setInterval(() => {
    sendPing(client);
  }, pingIntervalMs);
};

const clientSlot = { client: null as GameClient | null };

game.start(loader).then(() => {
  focusGameCanvas(game);
  const client = new GameClient();
  clientSlot.client = client;
  client.listen({
    onConnect: (myPlayerId, playersData, entitiesData, world) => {
      if (!isWorldTerrainPayload(world)) {
        console.error("Invalid or missing world payload from server");
        return;
      }
      rememberPlayerPings(playersData);
      playerPingById[myPlayerId] = playersData[myPlayerId]?.pingMs;
      renderPlayerList();
      startPingLoop(client);
      const terrain = new TerrainTileMap({
        pos: ex.vec(0, 0),
        tileWidth: TILE_PX,
        tileHeight: TILE_PX,
        columns: world.columns,
        rows: world.rows,
        surfaceStartByColumn: world.surfaceStartByColumn,
        solidTiles: world.solidTiles,
        protectedTiles: world.protectedTiles,
        terrainTiles: world.terrainTiles,
      });
      const tilemap = terrain.map;
      const lighting = new TileLightingOverlay(
        terrain,
        ex.vec(viewWidth, viewHeight),
      );
      worldSession.terrain = terrain;
      worldSession.dynamicLighting = lighting;
      game.add(tilemap);
      terrain.borders.forEach((border) => game.add(border));
      game.add(lighting);

      const playerSpawn = ex.vec(world.playerSpawn.x, world.playerSpawn.y);
      localPlayerSlot.player = new Player(
        playerSpawn,
        tilemap,
        client,
        terrain.tileCollisionWorld(),
      );
      game.add(localPlayerSlot.player);
      addPlayerLight(myPlayerId, localPlayerSlot.player);
      game.add(
        new PlayerHealthDisplay(() => {
          const player = localPlayerSlot.player;
          if (!player) {
            return null;
          }
          return {
            health: player.health,
            maxHealth: player.maxHealth,
            isFlying: player.isFlying,
          };
        }, expireLocalPowerup),
      );
      blockTargetingSlot.highlight = new BlockTargetingHighlight(
        terrain,
        client,
        () => localPlayerSlot.player,
        (playerId) => playerById[playerId] ?? null,
        () =>
          Object.entries(playerById).map(([id, player]) => ({
            id,
            player,
          })),
      );
      game.add(blockTargetingSlot.highlight);
      client.send(messageTypes.createPlayer, {
        x: playerSpawn.x,
        y: playerSpawn.y,
      });
      addLocalPauseListeners();
      syncLocalPauseState();
      console.log("Players:", playersData);
      joinExistingRemotePlayers(game, terrain, myPlayerId, playersData);
      renderPlayerList();
      applyEntitiesSnapshot({ entitiesData });
    },
    onDisconnect: (gonePlayerId) => {
      blockTargetingSlot.highlight?.removeRemoteBreakAnimation(gonePlayerId);
      removePlayerLight(gonePlayerId);
      playerById[gonePlayerId].kill();
      delete playerById[gonePlayerId];
      delete playerPingById[gonePlayerId];
      renderPlayerList();
    },
    listener: () => ({
      [messageTypes.createPlayer]: (payload) => {
        const terrain = worldSession.terrain;
        if (!terrain) {
          return;
        }
        const { id, x, y } = payload as PlayerState;
        if (!id) {
          return;
        }
        spawnPlayerAt(game, terrain, id, Number(x), Number(y));
        playerPingById[id] = (payload as PlayerState).pingMs;
        renderPlayerList();
      },
      [messageTypes.updatePlayer]: applyRemotePlayerUpdate,
      [messageTypes.updatePing]: applyPlayerPingUpdate,
      [messageTypes.updateBlock]: applyTerrainBlockUpdate,
      [messageTypes.updateBlockBreak]: applyTerrainBlockBreakUpdate,
      [messageTypes.knockbackPlayer]: applyPlayerKnockbackUpdate,
      [messageTypes.damagePlayer]: applyPlayerDamageUpdate,
      [messageTypes.updateEntities]: applyEntitiesSnapshot,
      [messageTypes.createParticle]: applyParticleCreate,
      [messageTypes.pong]: (payload) => applyPongUpdate(client, payload),
    }),
  });
});
