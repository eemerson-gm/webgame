import * as ex from "excalibur";
import { Player } from "../actors/Player";
import { Slime } from "../actors/Slime";
import { separateEntityBodies } from "../actors/MovingActor";
import { ClientWorldLivingEntities } from "./ClientWorldLivingEntities";
import { GameClient } from "../classes/GameClient";
import { messageTypes } from "../classes/GameWire";
import type {
  EntityState,
  PlayerState,
  WorldTerrain,
} from "../classes/GameWire";
import { TerrainTileMap } from "../classes/TerrainTileMap";
import { TileLightingOverlay } from "../classes/TileLightingOverlay";
import {
  resolveWeaponHits,
  WeaponHitMemory,
  type WeaponHitAttacker,
} from "../combat/WeaponCombat";
import { HUDManager } from "../ui/HUDManager";
import { MainMenuUI } from "../ui/MainMenuUI";
import { PlayerListUI } from "../ui/PlayerListUI";
import { TILE_PX } from "../world/worldConfig";

type GameViewSize = {
  width: number;
  height: number;
};

const remotePlayerPositionTolerance = 0.5;
const remotePlayerSnapDistance = TILE_PX * 2;
const pingIntervalMs = 2000;
const entitySeparationPadding = 1;
const entitySeparationMaxMoveX = 0.3;
const entitySeparationPasses = 2;

export class ClientWorldSession {
  private readonly engine: ex.Engine;
  private readonly client: GameClient;
  private readonly myPlayerId: string;
  private readonly viewSize: GameViewSize;
  private readonly menuUi: MainMenuUI;
  private readonly playerListUi: PlayerListUI;
  private readonly weaponHitMemory = new WeaponHitMemory();
  private readonly worldLivingEntities = new ClientWorldLivingEntities();

  private localPlayer: Player | null = null;
  private devSlime: Slime | null = null;
  private readonly remotePlayers: Record<string, Player> = {};
  private terrain: TerrainTileMap | null = null;
  private dummyTileMap: ex.TileMap | null = null;
  private pingIntervalId: number | null = null;

  private constructor(
    engine: ex.Engine,
    client: GameClient,
    myPlayerId: string,
    viewSize: GameViewSize,
    menuUi: MainMenuUI,
    playerListUi: PlayerListUI,
  ) {
    this.engine = engine;
    this.client = client;
    this.myPlayerId = myPlayerId;
    this.viewSize = viewSize;
    this.menuUi = menuUi;
    this.playerListUi = playerListUi;
  }

  public static begin(
    engine: ex.Engine,
    client: GameClient,
    myPlayerId: string,
    playersData: Record<string, PlayerState>,
    entitiesData: Record<string, EntityState>,
    world: WorldTerrain,
    viewSize: GameViewSize,
    menuUi: MainMenuUI,
  ): ClientWorldSession | null {
    void entitiesData;
    const playerListUi = new PlayerListUI();
    const session = new ClientWorldSession(
      engine,
      client,
      myPlayerId,
      viewSize,
      menuUi,
      playerListUi,
    );
    session.start(world, playersData);
    return session;
  }

  public removeRemotePlayer(playerId: string): void {
    this.remotePlayers[playerId]?.kill();
    delete this.remotePlayers[playerId];
    this.worldLivingEntities.unregister(playerId);
    this.playerListUi.removePlayer(playerId);
    this.refreshPlayerList();
  }

  private start(
    world: WorldTerrain,
    playersData: Record<string, PlayerState>,
  ): void {
    this.menuUi.hide();
    this.menuUi.setCreateWorldEnabled(false);
    this.playerListUi.rememberPings(playersData);
    const myPing = playersData[this.myPlayerId]?.pingMs;
    if (myPing !== undefined) {
      this.playerListUi.setPing(this.myPlayerId, myPing);
    }
    this.refreshPlayerList();
    this.startPingLoop();
    const terrain = new TerrainTileMap({
      pos: ex.vec(0, 0),
      tileWidth: TILE_PX,
      tileHeight: TILE_PX,
      viewSize: ex.vec(this.viewSize.width, this.viewSize.height),
      columns: world.columns,
      rows: world.rows,
      surfaceStartByColumn: world.surfaceStartByColumn,
      solidTiles: world.solidTiles,
      protectedTiles: world.protectedTiles,
      terrainTiles: world.terrainTiles,
    });
    const lighting = new TileLightingOverlay(
      terrain,
      ex.vec(this.viewSize.width, this.viewSize.height),
    );
    this.terrain = terrain;
    this.engine.add(terrain.renderer);
    this.engine.add(lighting);

    const playerSpawn = ex.vec(world.playerSpawn.x, world.playerSpawn.y);
    const dummyTileMap = new ex.TileMap({
      pos: ex.vec(0, 0),
      tileWidth: TILE_PX,
      tileHeight: TILE_PX,
      columns: 1,
      rows: 1,
      renderFromTopOfGraphic: true,
    });
    this.dummyTileMap = dummyTileMap;
    this.localPlayer = new Player(
      playerSpawn,
      dummyTileMap,
      this.client,
      terrain.tileCollisionWorld(),
    );
    this.engine.add(this.localPlayer);
    const localPlayerId = this.client.clientId;
    if (localPlayerId) {
      this.registerPlayerLivingEntity(localPlayerId, this.localPlayer);
    }
    this.devSlime = new Slime(
      playerSpawn,
      dummyTileMap,
      terrain.tileCollisionWorld(),
      this.localPlayer,
    );
    this.engine.add(this.devSlime);
    this.registerSlimeLivingEntity(this.devSlime);
    this.engine.add(
      new HUDManager(() => {
        const player = this.localPlayer;
        if (!player) {
          return null;
        }
        return {
          health: player.health,
          maxHealth: player.maxHealth,
        };
      }),
    );
    this.client.send({
      type: messageTypes.createPlayer,
      payload: {
        x: playerSpawn.x,
        y: playerSpawn.y,
      },
    });
    this.addLocalPauseListeners();
    this.syncLocalPauseState();
    console.log("Players:", playersData);
    this.joinExistingRemotePlayers(terrain, dummyTileMap, playersData);
    this.refreshPlayerList();
    this.engine.on("preupdate", () => {
      this.separateEntityActors();
    });
    this.engine.on("postupdate", () => {
      this.resolveLocalWeaponCombat();
    });
    this.registerWorldHandlers();
  }

  private registerWorldHandlers(): void {
    this.client.setWorldHandlers({
      [messageTypes.createPlayer]: (msg) => {
        this.handleCreatePlayer(msg.payload);
      },
      [messageTypes.updatePlayer]: (msg) => {
        this.applyRemotePlayerUpdate(msg.payload);
      },
      [messageTypes.updatePing]: (msg) => {
        this.applyPlayerPingUpdate(msg.payload);
      },
      [messageTypes.knockbackPlayer]: (msg) => {
        this.applyPlayerKnockbackUpdate(msg.payload);
      },
      [messageTypes.damagePlayer]: (msg) => {
        this.applyPlayerDamageUpdate(msg.payload);
      },
      [messageTypes.updateEntities]: (msg) => {
        this.applyEntitiesSnapshot(msg.payload);
      },
      [messageTypes.pong]: (msg) => {
        this.applyPongUpdate(msg.payload);
      },
    });
  }

  private refreshPlayerList(): void {
    this.playerListUi.render(
      this.client.clientId,
      Object.keys(this.remotePlayers),
    );
  }

  private handleCreatePlayer(playerState: PlayerState): void {
    const terrain = this.terrain;
    const dummyTileMap = this.dummyTileMap;
    if (!terrain) {
      return;
    }
    if (!dummyTileMap) {
      return;
    }
    const id = String(playerState.id ?? "");
    if (id.length === 0) {
      return;
    }
    this.spawnRemotePlayer(
      terrain,
      dummyTileMap,
      id,
      Number(playerState.x),
      Number(playerState.y),
    );
    this.playerListUi.setPing(id, playerState.pingMs ?? 0);
    this.refreshPlayerList();
  }

  private spawnRemotePlayer(
    terrain: TerrainTileMap,
    dummyTileMap: ex.TileMap,
    playerId: string,
    x: number,
    y: number,
  ): Player {
    this.remotePlayers[playerId] = new Player(
      ex.vec(x, y),
      dummyTileMap,
      undefined,
      terrain.tileCollisionWorld(),
    );
    this.engine.add(this.remotePlayers[playerId]);
    this.registerPlayerLivingEntity(playerId, this.remotePlayers[playerId]);
    return this.remotePlayers[playerId];
  }

  private registerPlayerLivingEntity(entityId: string, player: Player) {
    this.worldLivingEntities.register({
      entityId,
      living: player,
      onWeaponHit: (attacker) => {
        player.takeDamageFrom(attacker, 1);
      },
    });
  }

  private registerSlimeLivingEntity(slime: Slime) {
    this.worldLivingEntities.register({
      entityId: slime.entityId(),
      living: slime,
      onWeaponHit: (attacker) => {
        slime.takeDamageFrom(attacker, 1);
      },
    });
  }

  private applyPositionFromPayloadIfPresent(
    player: Player,
    payload: PlayerState,
    tolerance: number = remotePlayerPositionTolerance,
  ): void {
    const localPlayer = this.localPlayer;
    if (localPlayer !== null && player === localPlayer) {
      return;
    }
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
  }

  private syncMovementFieldsFromPayload(
    player: Player,
    payload: PlayerState,
  ): void {
    if (payload.isPaused !== undefined) {
      player.setPaused(payload.isPaused);
    }
    player.keyLeft = payload.keyLeft ?? player.keyLeft;
    player.keyRight = payload.keyRight ?? player.keyRight;
    player.keyJump = payload.keyJump ?? player.keyJump;
    player.keyDown = payload.keyDown ?? player.keyDown;
    player.syncFacingFromNetwork(payload.facingLeft);
    player.applyRemoteAttackFromPayload(payload);
    if (payload.health !== undefined) {
      player.syncHealth(payload.health);
    }
    player.hspeed = payload.horizontalSpeed ?? player.hspeed;
    player.vspeed = payload.verticalSpeed ?? player.vspeed;
  }

  private separateEntityActors(): void {
    const world = this.terrain?.tileCollisionWorld();
    if (!world) {
      return;
    }
    const entries = this.worldLivingEntities.entitySeparationEntries();
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
  }

  private weaponHitAttackers(): WeaponHitAttacker[] {
    const localPlayer = this.localPlayer;
    const localPlayerId = this.client.clientId;
    if (!localPlayer || !localPlayerId) {
      return Object.entries(this.remotePlayers).map(([playerId, player]) => ({
        playerId,
        player,
      }));
    }
    return [
      { playerId: localPlayerId, player: localPlayer },
      ...Object.entries(this.remotePlayers)
        .filter(([playerId]) => playerId !== localPlayerId)
        .map(([playerId, player]) => ({ playerId, player })),
    ];
  }

  private resolveLocalWeaponCombat(): void {
    resolveWeaponHits({
      attackers: this.weaponHitAttackers(),
      targets: this.worldLivingEntities.weaponHitTargets(),
      hitMemory: this.weaponHitMemory,
    });
  }

  private applyRemotePlayerUpdate(playerState: PlayerState): void {
    const playerId = String(playerState.id ?? "");
    if (playerId.length === 0) {
      return;
    }
    const player = this.remotePlayers[playerId];
    if (!player) {
      return;
    }
    const localPlayerId = this.client.clientId;
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
    this.syncMovementFieldsFromPayload(player, playerState);
    this.applyPositionFromPayloadIfPresent(player, playerState);
  }

  private joinExistingRemotePlayers(
    terrain: TerrainTileMap,
    dummyTileMap: ex.TileMap,
    playersData: Record<string, PlayerState>,
  ): void {
    Object.entries(playersData).forEach(([peerId, row]) => {
      if (peerId === this.myPlayerId) {
        return;
      }
      const x = Number(row.x);
      const y = Number(row.y);
      const player = this.spawnRemotePlayer(
        terrain,
        dummyTileMap,
        peerId,
        x,
        y,
      );
      this.syncMovementFieldsFromPayload(player, row);
    });
  }

  private applyEntitiesSnapshot(_payload: {
    entitiesData: Record<string, EntityState>;
  }): void {
    void _payload;
  }

  private playerForId(playerId: string): Player | null {
    if (this.client.clientId === playerId) {
      return this.localPlayer;
    }
    return this.remotePlayers[playerId] ?? null;
  }

  private applyPlayerKnockbackUpdate(update: {
    id?: string;
    targetId: string;
  }): void {
    const localPlayerId = this.client.clientId;
    if (!localPlayerId || update.targetId !== localPlayerId) {
      return;
    }
    if (!update.id) {
      return;
    }
    const attacker = this.playerForId(update.id);
    const target = this.playerForId(update.targetId);
    if (!attacker || !target) {
      return;
    }
    target.knockBackFromFacing(attacker.isFacingLeft());
  }

  private applyPlayerDamageUpdate(update: {
    id: string;
    targetId: string;
    damage: number;
  }): void {
    const localPlayerId = this.client.clientId;
    if (!localPlayerId || update.targetId !== localPlayerId) {
      return;
    }
    if (!update.id) {
      return;
    }
    const attacker = this.playerForId(update.id);
    const target = this.playerForId(update.targetId);
    if (!attacker || !target) {
      return;
    }
    target.takeDamageFrom(attacker, update.damage);
  }

  private applyPlayerPingUpdate(payload: PlayerState): void {
    const playerId = String(payload.id ?? "");
    const pingMs = Number(payload.pingMs);
    if (!playerId || !Number.isFinite(pingMs)) {
      return;
    }
    this.playerListUi.setPing(playerId, pingMs);
    this.refreshPlayerList();
  }

  private applyPongUpdate(payload: { sentAt?: number }): void {
    const sentAt = Number(payload.sentAt);
    if (!Number.isFinite(sentAt)) {
      return;
    }
    const pingMs = Math.max(0, Math.round(performance.now() - sentAt));
    this.playerListUi.setPing(this.client.clientId, pingMs);
    this.refreshPlayerList();
    this.client.send({
      type: messageTypes.updatePing,
      payload: { pingMs },
    });
  }

  private sendPing(): void {
    this.client.send({
      type: messageTypes.ping,
      payload: { sentAt: performance.now() },
    });
  }

  private startPingLoop(): void {
    if (this.pingIntervalId !== null) {
      return;
    }
    this.sendPing();
    this.pingIntervalId = window.setInterval(() => {
      this.sendPing();
    }, pingIntervalMs);
  }

  private syncLocalPauseState(isPaused: boolean = document.hidden): void {
    this.localPlayer?.syncPauseState(isPaused);
  }

  private addLocalPauseListeners(): void {
    document.addEventListener("visibilitychange", () =>
      this.syncLocalPauseState(),
    );
    window.addEventListener("pagehide", () => this.syncLocalPauseState(true));
    window.addEventListener("pageshow", () => this.syncLocalPauseState(false));
    document.addEventListener("freeze", () => this.syncLocalPauseState(true));
    document.addEventListener("resume", () => this.syncLocalPauseState(false));
  }
}
