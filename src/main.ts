import * as ex from "excalibur";
import { Player } from "./actors/Player";
import { HUDManager } from "./ui/HUDManager";
import { SmashParticleActor } from "./actors/SmashParticleActor";
import { Resources } from "./resource";
import { GameClient, type MessageEvents } from "./classes/GameClient";
import { messageTypes } from "./classes/GameProtocol";
import type {
  Data,
  EntityState,
  ParticleCreatePayload,
  PlayerDamageUpdate,
  PlayerKnockbackUpdate,
  PlayerState,
  WorldSummary,
  WorldTerrainPayload,
  WorldsUpdatedPayload,
} from "./classes/GameProtocol";
import { TerrainTileMap } from "./classes/TerrainTileMap";
import { TileLightingOverlay } from "./classes/TileLightingOverlay";
import { separateEntityBodies } from "./actors/MovingActor";
import type { EntitySeparationBody } from "./actors/MovingActor";
import { TILE_PX } from "./world/worldConfig";

const localPlayerSlot = { player: null as Player | null };
const playerById: Record<string, Player> = {};
const playerPingById: Record<string, number | undefined> = {};
const pingLoopSlot = { intervalId: null as number | null };
const worldSession = {
  terrain: null as TerrainTileMap | null,
  dynamicLighting: null as TileLightingOverlay | null,
};
const dummyTileMapSlot = { tilemap: null as ex.TileMap | null };
const remotePlayerPositionTolerance = 0.5;
const remotePlayerSnapDistance = TILE_PX * 2;
const pingIntervalMs = 2000;
const entitySeparationPadding = 1;
const entitySeparationMaxMoveX = 0.5;
const entitySeparationPasses = 1;

type EntitySeparationEntry = {
  body: EntitySeparationBody;
  applySeparatedX: (x: number) => void;
};

const syncLocalPauseState = (isPaused: boolean = document.hidden) => {
  localPlayerSlot.player?.syncPauseState(isPaused);
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
  //pixelArt: true,
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
  });
};

const playerListElement = () => document.getElementById("player-list");
const playerListPanelElement = () =>
  document.querySelector<HTMLElement>(".player-list");
const mainMenuElement = () => document.getElementById("main-menu");
const worldListElement = () => document.getElementById("world-list");
const createWorldButtonElement = () =>
  document.getElementById("create-world") as HTMLButtonElement | null;
const mainMenuStatusElement = () => document.getElementById("main-menu-status");

const setMenuStatus = (text: string) => {
  const status = mainMenuStatusElement();
  if (!status) {
    return;
  }
  status.textContent = text;
};

const setCreateWorldButtonDisabled = (isDisabled: boolean) => {
  const button = createWorldButtonElement();
  if (!button) {
    return;
  }
  button.disabled = isDisabled;
};

const showMainMenu = () => {
  mainMenuElement()?.removeAttribute("hidden");
  playerListPanelElement()?.setAttribute("hidden", "");
};

const hideMainMenu = () => {
  mainMenuElement()?.setAttribute("hidden", "");
  playerListPanelElement()?.removeAttribute("hidden");
};

const createJoinWorldButton = (world: WorldSummary, client: GameClient) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Join";
  button.addEventListener("click", () => {
    setMenuStatus(`Joining ${world.name}...`);
    client.send(messageTypes.joinWorld, { worldId: world.id });
  });
  return button;
};

const createWorldCard = (world: WorldSummary, client: GameClient) => {
  const card = document.createElement("div");
  const details = document.createElement("div");
  const name = document.createElement("div");
  const count = document.createElement("div");
  card.className = "world-card";
  name.className = "world-card__name";
  count.className = "world-card__count";
  name.textContent = world.name;
  count.textContent = `${world.playerCount} player${world.playerCount === 1 ? "" : "s"}`;
  details.replaceChildren(name, count);
  card.replaceChildren(details, createJoinWorldButton(world, client));
  return card;
};

const renderWorldList = (worlds: WorldSummary[], client: GameClient) => {
  const list = worldListElement();
  if (!list) {
    return;
  }
  list.replaceChildren(
    ...worlds.map((world) => createWorldCard(world, client)),
  );
  setMenuStatus(worlds.length === 0 ? "No worlds available" : "Select a world");
};

const wireMainMenu = (client: GameClient) => {
  const button = createWorldButtonElement();
  if (!button) {
    return;
  }
  button.disabled = true;
  button.addEventListener("click", () => {
    setMenuStatus("Creating world...");
    button.disabled = true;
    client.send(messageTypes.createWorld, {});
  });
};

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

const spawnPlayerAt = (
  game: ex.Engine,
  terrain: TerrainTileMap,
  dummyTileMap: ex.TileMap,
  playerId: string,
  x: number,
  y: number,
) => {
  playerById[playerId] = new Player(
    ex.vec(x, y),
    dummyTileMap,
    undefined,
    terrain.tileCollisionWorld(),
  );
  game.add(playerById[playerId]);
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
  if (!Number.isFinite(nextPosition.x) || !Number.isFinite(nextPosition.y)) {
    return;
  }
  if (player.pos.distance(nextPosition) < tolerance) {
    return;
  }
  player.applyRemotePositionCorrection(nextPosition, remotePlayerSnapDistance);
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
  if (payload.health !== undefined) {
    player.syncHealth(payload.health);
  }
  player.hspeed = payload.horizontalSpeed ?? player.hspeed;
  player.vspeed = payload.verticalSpeed ?? player.vspeed;
};

const localPlayerSeparationEntries = (): EntitySeparationEntry[] => {
  const localPlayer = localPlayerSlot.player;
  const localPlayerId = clientSlot.client?.clientId;
  if (!localPlayer || !localPlayerId) {
    return [];
  }
  return [
    {
      body: localPlayer.entitySeparationBody(localPlayerId, true),
      applySeparatedX: (x) => localPlayer.applySeparatedX(x),
    },
  ];
};

const remotePlayerSeparationEntries = (): EntitySeparationEntry[] =>
  Object.entries(playerById).map(([playerId, player]) => ({
    body: player.entitySeparationBody(playerId, true),
    applySeparatedX: (x) => player.applySeparatedX(x),
  }));

const entitySeparationEntries = () => [
  ...localPlayerSeparationEntries(),
  ...remotePlayerSeparationEntries(),
];

const separateEntityActors = () => {
  const world = worldSession.terrain?.tileCollisionWorld();
  if (!world) {
    return;
  }
  const entries = entitySeparationEntries();
  const separatedBodies = separateEntityBodies(
    entries.map((entry) => entry.body),
    {
      world,
      padding: entitySeparationPadding,
      maxMoveX: entitySeparationMaxMoveX,
      passes: entitySeparationPasses,
    },
  );
  const separatedBodyById = Object.fromEntries(
    separatedBodies.map((body) => [body.id, body]),
  );
  entries
    .filter((entry) => entry.body.canSeparate)
    .forEach((entry) => {
      const separatedBody = separatedBodyById[entry.body.id];
      if (!separatedBody) {
        return;
      }
      entry.applySeparatedX(separatedBody.x);
    });
};

game.on("postupdate", separateEntityActors);

const applyRemotePlayerUpdate = (payload: Data) => {
  const playerState = payload as PlayerState;
  const playerId = playerState.id as string;
  const player = playerById[playerId];
  if (!player) {
    return;
  }
  const localPlayerId = clientSlot.client?.clientId;
  const isLocalPlayerUpdate =
    localPlayerId !== undefined && playerId === localPlayerId;
  if (isLocalPlayerUpdate) {
    if (playerState.isPaused !== undefined) {
      player.setPaused(playerState.isPaused);
    }
    if (playerState.health !== undefined) {
      player.syncHealth(playerState.health);
    }
    return;
  }
  applyPositionFromPayloadIfPresent(player, playerState);
  syncMovementFieldsFromPayload(player, playerState);
};

const joinExistingRemotePlayers = (
  game: ex.Engine,
  terrain: TerrainTileMap,
  dummyTileMap: ex.TileMap,
  myPlayerId: string,
  playersData: Record<string, PlayerState>,
) => {
  Object.entries(playersData).forEach(([peerId, row]) => {
    if (peerId === myPlayerId) {
      return;
    }
    const x = Number(row.x);
    const y = Number(row.y);
    const player = spawnPlayerAt(game, terrain, dummyTileMap, peerId, x, y);
    syncMovementFieldsFromPayload(player, row);
  });
};

const applyEntitiesSnapshot = (_payload: Data) => {
  void _payload;
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

const startWorldSession = (
  client: GameClient,
  myPlayerId: string,
  playersData: Record<string, PlayerState>,
  entitiesData: Record<string, EntityState>,
  world: Data,
) => {
  if (!isWorldTerrainPayload(world)) {
    console.error("Invalid or missing world payload from server");
    setMenuStatus("Unable to join world");
    return;
  }
  hideMainMenu();
  setCreateWorldButtonDisabled(true);
  rememberPlayerPings(playersData);
  playerPingById[myPlayerId] = playersData[myPlayerId]?.pingMs;
  renderPlayerList();
  startPingLoop(client);
  const terrain = new TerrainTileMap({
    pos: ex.vec(0, 0),
    tileWidth: TILE_PX,
    tileHeight: TILE_PX,
    viewSize: ex.vec(viewWidth, viewHeight),
    columns: world.columns,
    rows: world.rows,
    surfaceStartByColumn: world.surfaceStartByColumn,
    solidTiles: world.solidTiles,
    protectedTiles: world.protectedTiles,
    terrainTiles: world.terrainTiles,
  });
  const lighting = new TileLightingOverlay(
    terrain,
    ex.vec(viewWidth, viewHeight),
  );
  worldSession.terrain = terrain;
  worldSession.dynamicLighting = lighting;
  game.add(terrain.renderer);
  game.add(lighting);

  const playerSpawn = ex.vec(world.playerSpawn.x, world.playerSpawn.y);
  const dummyTileMap = new ex.TileMap({
    pos: ex.vec(0, 0),
    tileWidth: TILE_PX,
    tileHeight: TILE_PX,
    columns: 1,
    rows: 1,
    renderFromTopOfGraphic: true,
  });
  localPlayerSlot.player = new Player(
    playerSpawn,
    dummyTileMap,
    client,
    terrain.tileCollisionWorld(),
  );
  game.add(localPlayerSlot.player);
  game.add(
    new HUDManager(() => {
      const player = localPlayerSlot.player;
      if (!player) {
        return null;
      }
      return {
        health: player.health,
        maxHealth: player.maxHealth,
      };
    }),
  );
  client.send(messageTypes.createPlayer, {
    x: playerSpawn.x,
    y: playerSpawn.y,
  });
  addLocalPauseListeners();
  syncLocalPauseState();
  console.log("Players:", playersData);
  dummyTileMapSlot.tilemap = dummyTileMap;
  joinExistingRemotePlayers(
    game,
    terrain,
    dummyTileMap,
    myPlayerId,
    playersData,
  );
  renderPlayerList();
};

const gameMessageHandlers = (client: GameClient): MessageEvents => ({
  [messageTypes.createPlayer]: (payload) => {
    const terrain = worldSession.terrain;
    const dummyTileMap = dummyTileMapSlot.tilemap;
    if (!terrain) {
      return;
    }
    if (!dummyTileMap) {
      return;
    }
    const { id, x, y } = payload as PlayerState;
    if (!id) {
      return;
    }
    spawnPlayerAt(game, terrain, dummyTileMap, id, Number(x), Number(y));
    playerPingById[id] = (payload as PlayerState).pingMs;
    renderPlayerList();
  },
  [messageTypes.updatePlayer]: applyRemotePlayerUpdate,
  [messageTypes.updatePing]: applyPlayerPingUpdate,
  [messageTypes.knockbackPlayer]: applyPlayerKnockbackUpdate,
  [messageTypes.damagePlayer]: applyPlayerDamageUpdate,
  [messageTypes.updateEntities]: applyEntitiesSnapshot,
  [messageTypes.createParticle]: applyParticleCreate,
  [messageTypes.pong]: (payload) => applyPongUpdate(client, payload),
});

const wireGameClient = (client: GameClient) => {
  client.listen({
    onOpen: () => {
      setMenuStatus("Loading worlds...");
      setCreateWorldButtonDisabled(false);
      client.send(messageTypes.listWorlds, {});
    },
    onWorldsUpdated: (payload: WorldsUpdatedPayload) => {
      setCreateWorldButtonDisabled(false);
      renderWorldList(payload.worlds, client);
    },
    onConnect: (myPlayerId, playersData, entitiesData, world) => {
      startWorldSession(
        client,
        myPlayerId,
        playersData as Record<string, PlayerState>,
        entitiesData as Record<string, EntityState>,
        world,
      );
    },
    onDisconnect: (gonePlayerId) => {
      playerById[gonePlayerId]?.kill();
      delete playerById[gonePlayerId];
      delete playerPingById[gonePlayerId];
      renderPlayerList();
    },
    listener: () => gameMessageHandlers(client),
  });
};

game.start(loader).then(() => {
  focusGameCanvas(game);
  game.canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    const player = localPlayerSlot.player;
    if (!player) {
      return;
    }
    player.triggerSwordGroundAnimation();
  });
  game.canvas.addEventListener("pointerup", (event) => {
    if (event.button !== 0) {
      return;
    }
    const player = localPlayerSlot.player;
    if (!player) {
      return;
    }
    player.setSwordGroundHeld(false);
  });
  game.canvas.addEventListener("pointercancel", (event) => {
    if (event.button !== 0) {
      return;
    }
    const player = localPlayerSlot.player;
    if (!player) {
      return;
    }
    player.setSwordGroundHeld(false);
  });
  showMainMenu();
  const client = new GameClient();
  clientSlot.client = client;
  wireMainMenu(client);
  wireGameClient(client);
});
