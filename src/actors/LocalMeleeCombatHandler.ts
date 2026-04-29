import * as ex from "excalibur";
import type { GameClient } from "../classes/GameClient";
import { messageTypes } from "../classes/GameProtocol";
import type { EntityActor } from "./EntityActor";
import type { Player } from "./Player";

type RemotePlayerEntry = {
  id: string;
  player: Player;
};

type LocalPlayerProvider = () => Player | null;
type RemotePlayersProvider = () => RemotePlayerEntry[];
type EntityProvider = () => EntityActor[];

const swordDamage = 1;

export class LocalMeleeCombatHandler {
  private readonly client: GameClient;
  private readonly getLocalPlayer: LocalPlayerProvider;
  private readonly getRemotePlayers: RemotePlayersProvider;
  private readonly getEntities: EntityProvider;
  private readonly entitiesHitByCurrentSwordSwing = new Set<EntityActor>();
  private readonly playersHitByCurrentSwordSwing = new Set<Player>();

  constructor(
    client: GameClient,
    getLocalPlayer: LocalPlayerProvider,
    getRemotePlayers: RemotePlayersProvider,
    getEntities: EntityProvider,
  ) {
    this.client = client;
    this.getLocalPlayer = getLocalPlayer;
    this.getRemotePlayers = getRemotePlayers;
    this.getEntities = getEntities;
  }

  public startSwordUse() {
    const localPlayer = this.getLocalPlayer();
    if (!localPlayer) {
      return;
    }
    if (!localPlayer.useSword()) {
      return;
    }
    this.hitEntitiesTouchingSword();
    this.hitPlayersTouchingSword();
  }

  public update() {
    this.hitEntitiesTouchingSword();
    this.hitPlayersTouchingSword();
    this.damageLocalPlayerTouchingEntities();
  }

  private hitEntitiesTouchingSword() {
    const localPlayer = this.getLocalPlayer();
    const swordBounds = localPlayer?.swordHitBounds();
    if (!localPlayer || localPlayer.isPaused || !swordBounds) {
      this.entitiesHitByCurrentSwordSwing.clear();
      return;
    }
    this.getEntities()
      .filter((entity) => !this.entitiesHitByCurrentSwordSwing.has(entity))
      .filter((entity) => entity.overlapsWorldBounds(swordBounds))
      .slice(0, 1)
      .forEach((entity) => {
        this.entitiesHitByCurrentSwordSwing.add(entity);
        if (!entity.takeDamageFrom(localPlayer, swordDamage)) {
          return;
        }
        this.client.send(messageTypes.damageEntity, {
          entityId: entity.entityId(),
          damage: swordDamage,
        });
        this.sendSmashParticleAt(this.actorCenter(entity));
      });
  }

  private hitPlayersTouchingSword() {
    const localPlayer = this.getLocalPlayer();
    const swordBounds = localPlayer?.swordHitBounds();
    if (!localPlayer || localPlayer.isPaused || !swordBounds) {
      this.playersHitByCurrentSwordSwing.clear();
      return;
    }
    this.getRemotePlayers()
      .filter(({ player }) => !this.playersHitByCurrentSwordSwing.has(player))
      .filter(({ player }) => !player.isPaused)
      .filter(({ player }) => player.overlapsWorldBounds(swordBounds))
      .slice(0, 1)
      .forEach(({ id, player }) => {
        this.playersHitByCurrentSwordSwing.add(player);
        if (!player.takeDamageFrom(localPlayer, swordDamage)) {
          return;
        }
        this.client.send(messageTypes.damagePlayer, {
          targetId: id,
          damage: swordDamage,
        });
        this.sendSmashParticleAt(this.actorCenter(player));
      });
  }

  private damageLocalPlayerTouchingEntities() {
    const localPlayer = this.getLocalPlayer();
    if (!localPlayer || localPlayer.isPaused) {
      return;
    }
    this.getEntities()
      .filter((entity) => entity.isAlive())
      .filter((entity) => localPlayer.overlapsWorldBounds(this.actorBounds(entity)))
      .slice(0, 1)
      .forEach((entity) => {
        if (!localPlayer.takeDamageFrom(entity, entity.contactDamage())) {
          return;
        }
        this.sendSmashParticleAt(this.actorCenter(localPlayer));
      });
  }

  private sendSmashParticleAt(position: ex.Vector) {
    this.client.send(messageTypes.createParticle, {
      kind: "smash",
      x: position.x,
      y: position.y,
    });
  }

  private actorCenter(actor: ex.Actor) {
    return ex.vec(actor.pos.x + actor.width / 2, actor.pos.y + actor.height / 2);
  }

  private actorBounds(actor: ex.Actor) {
    return {
      left: actor.pos.x,
      right: actor.pos.x + actor.width,
      top: actor.pos.y,
      bottom: actor.pos.y + actor.height,
    };
  }
}
