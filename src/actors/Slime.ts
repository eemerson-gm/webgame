import * as ex from "excalibur";
import { Resources } from "../resource";
import type { EntityState, PlayerState } from "../classes/GameProtocol";
import { TILE_PX } from "../world/worldConfig";
import type { TileCollisionWorld, WorldBounds } from "../simulation/entityPhysics";
import { stepSlimeEntity } from "../simulation/slimeEntityBehavior";
import { DamageFlash } from "./DamageableActor";
import type { EntityActor } from "./EntityActor";
import type { Player } from "./Player";

type SlimeSimulationProviders = {
  world: () => TileCollisionWorld | null;
  playersData: () => Record<string, PlayerState>;
  clientId: () => string;
  sendState: (state: EntityState) => void;
};

const correctionSnapDistance = TILE_PX * 1.5;
const ownerStateSyncIntervalMs = 200;
const slimeContactDamage = 1;
const slimeSwordDamage = 1;
const slimeDamageKnockbackHorizontalSpeed = 1.5;
const slimeDamageKnockbackVerticalSpeed = -1.6;
const slimeDamageKnockbackDurationMs = 240;
const slimeDamageFlashDurationMs = 240;
const slimeDamageBlinkFrameMs = 80;

export class Slime extends ex.Actor implements EntityActor {
  private state: EntityState;
  private readonly simulationProviders: SlimeSimulationProviders;
  private readonly damageFlash: DamageFlash;
  private ownerStateSyncElapsedMs = 0;

  constructor(state: EntityState, simulationProviders: SlimeSimulationProviders) {
    super({
      pos: ex.vec(state.x, state.y),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: 2,
    });
    this.state = { ...state };
    this.simulationProviders = simulationProviders;
    this.damageFlash = new DamageFlash({
      durationMs: slimeDamageFlashDurationMs,
      blinkFrameMs: slimeDamageBlinkFrameMs,
      z: 1,
    });
  }

  override onInitialize() {
    this.graphics.use(Resources.Slime.toSprite());
    this.addChild(this.damageFlash);
    this.renderState();
  }

  public syncFromState(state: EntityState) {
    const didLoseHealth = state.health < this.state.health;
    if (state.health <= 0) {
      this.state = { ...state };
      this.kill();
      return;
    }
    if (didLoseHealth) {
      this.damageFlash.start();
    }
    if (this.isOwnedByLocal() && state.ownerId === this.localClientId()) {
      this.state = {
        ...this.state,
        ownerId: state.ownerId,
        health: state.health,
        horizontalSpeed: state.horizontalSpeed,
        verticalSpeed: state.verticalSpeed,
        knockbackMs: state.knockbackMs,
      };
      return;
    }
    const correctionPosition = ex.vec(state.x, state.y);
    if (this.pos.distance(correctionPosition) > correctionSnapDistance) {
      this.state = { ...state };
      this.renderState();
      return;
    }
    this.state = {
      ...state,
      x: this.state.x,
      y: this.state.y,
    };
  }

  public overlapsWorldBounds(bounds: WorldBounds) {
    if (!this.isAlive()) {
      return false;
    }
    if (this.pos.x + this.width < bounds.left) {
      return false;
    }
    if (this.pos.x > bounds.right) {
      return false;
    }
    if (this.pos.y + this.height < bounds.top) {
      return false;
    }
    return this.pos.y <= bounds.bottom;
  }

  public knockBackFrom(_player: Player) {
    this.takeDamageFrom(_player, 0);
  }

  public takeDamageFrom(player: Player, damage: number = slimeSwordDamage) {
    if (!this.isAlive()) {
      return false;
    }
    const nextHealth = Math.max(this.state.health - damage, 0);
    const playerCenterX = player.pos.x + player.width / 2;
    const slimeCenterX = this.pos.x + this.width / 2;
    const direction = slimeCenterX < playerCenterX ? -1 : 1;
    this.state = {
      ...this.state,
      health: nextHealth,
      horizontalSpeed: slimeDamageKnockbackHorizontalSpeed * direction,
      verticalSpeed: slimeDamageKnockbackVerticalSpeed,
      knockbackMs: slimeDamageKnockbackDurationMs,
    };
    if (damage > 0) {
      this.damageFlash.start();
    }
    this.renderState();
    if (nextHealth > 0) {
      return true;
    }
    this.kill();
    return true;
  }

  public contactDamage() {
    return slimeContactDamage;
  }

  public entityId() {
    return this.state.id;
  }

  public isAlive() {
    return this.state.health > 0 && !this.isKilled();
  }

  override onPostUpdate(_engine: ex.Engine, delta: number) {
    void _engine;
    this.damageFlash.tick(delta);
    const world = this.simulationProviders.world();
    if (!world || !this.state.ownerId) {
      this.renderState();
      return;
    }
    this.state = stepSlimeEntity(this.state, {
      playersData: this.simulationProviders.playersData(),
      world,
      dt: delta / 1000,
    });
    this.renderState();
    this.syncOwnerStatePeriodically(delta);
  }

  private renderState() {
    this.pos.x = this.state.x;
    this.pos.y = this.state.y;
    this.graphics.flipHorizontal = this.state.facingLeft;
  }

  private syncOwnerStatePeriodically(delta: number) {
    if (!this.isOwnedByLocal()) {
      return;
    }
    this.ownerStateSyncElapsedMs += delta;
    if (this.ownerStateSyncElapsedMs < ownerStateSyncIntervalMs) {
      return;
    }
    this.ownerStateSyncElapsedMs =
      this.ownerStateSyncElapsedMs % ownerStateSyncIntervalMs;
    this.simulationProviders.sendState(this.state);
  }

  private isOwnedByLocal() {
    return this.state.ownerId === this.localClientId();
  }

  private localClientId() {
    return this.simulationProviders.clientId();
  }
}
