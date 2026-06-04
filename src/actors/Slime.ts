import * as ex from "excalibur";
import { TILE_PX } from "../world/worldConfig";
import {
  type LivingSeparationKind,
} from "./LivingActor";
import {
  WalkingActor,
  collisionOffsetForGraphicCenter,
} from "./WalkingActor";
import type { TileCollisionWorld, WorldBounds } from "./MovingActor";
import { SlimeVisuals } from "./slime/SlimeVisuals";
import type { LocomotionVisualsHost } from "./walking/LocomotionVisuals";
import { NetworkedEntityState } from "../game/sim/NetworkedEntityState";
import { SlimeLocomotionSimulator } from "../game/sim/locomotion/SlimeLocomotionSimulator";
import { slimeVitality, slimeWalkingTuning } from "../game/sim/simConfig";

export class Slime extends WalkingActor {
  private readonly visuals: SlimeVisuals;
  private readonly slimeId: string;
  private readonly ownerId: string;
  private readonly simState = new NetworkedEntityState();
  private readonly locomotion = new SlimeLocomotionSimulator(
    this.simState,
    slimeWalkingTuning,
  );
  private wanderSign: number = 0;
  private isDead: boolean = false;

  constructor(
    entityId: string,
    ownerId: string,
    pos: ex.Vector,
    tilemap: ex.TileMap,
    collisionWorld: TileCollisionWorld,
  ) {
    const width = TILE_PX;
    const height = TILE_PX;
    super(
      pos,
      tilemap,
      ex.vec(width, height),
      collisionOffsetForGraphicCenter(ex.vec(TILE_PX / 2, TILE_PX / 2)),
      slimeWalkingTuning,
      slimeVitality,
      collisionWorld,
    );
    this.slimeId = entityId;
    this.ownerId = ownerId;
    this.visuals = new SlimeVisuals(this);
  }

  public entityId() {
    return this.slimeId;
  }

  public slimeOwnerId() {
    return this.ownerId;
  }

  public getWanderSign() {
    return this.wanderSign;
  }

  public setWanderSign(sign: number) {
    this.wanderSign = sign;
  }

  public setFacingLeft(facingLeft: boolean) {
    this.facingLeft = facingLeft;
    this.visuals.updateFacing(facingLeft);
  }

  public syncHealth(health: unknown) {
    this.syncLivingHealth(health);
    if (this.health <= 0) {
      this.die();
    }
  }

  protected separationKind(): LivingSeparationKind {
    return "entity";
  }

  protected isLivingActive() {
    return !this.isDead;
  }

  protected separationDimensions() {
    if (!this.isAlive()) {
      return { width: 0, height: 0 };
    }
    return {
      width: this.collisionBounds.width,
      height: this.collisionBounds.height,
    };
  }

  public contactDamage() {
    return 0;
  }

  public overlapsWorldBounds(bounds: WorldBounds) {
    return super.overlapsWorldBounds(bounds);
  }

  protected override onKnockbackApplied() {
    this.isGrounded = false;
    this.isJumping = true;
  }

  protected onHealthDepleted() {
    this.die();
  }

  protected locomotionVisuals(): LocomotionVisualsHost {
    return this.visuals;
  }

  protected override syncCollisionToSprite() {
    void 0;
  }

  protected horizontalMoveSign() {
    if (this.isDead) {
      return 0;
    }
    return this.wanderSign;
  }

  protected tryJump() {
    if (this.isDead || this.wanderSign === 0) {
      return;
    }
    this.syncSimStateFromActor();
    if (
      !this.locomotion.shouldJumpForTileAhead(
        this.wanderSign,
        this.tileCollisionWorld(),
        this.collisionBounds,
      )
    ) {
      return;
    }
    this.locomotion.tryJump();
    this.syncActorFromSimState();
  }

  public simulateJumpStart() {
    if (this.jump(this.walkingTuning.jumpSpeed)) {
      return;
    }
    this.vspeed = this.walkingTuning.jumpSpeed;
    this.isGrounded = false;
    this.isJumping = true;
  }

  public applyPositionCorrection(
    position: ex.Vector,
    snapDistance: number,
    options?: { forceHardSnap?: boolean },
  ) {
    this.visuals.applyRemotePositionCorrection(position, snapDistance, options);
  }

  protected onWanderChanged() {}

  override onInitialize(engine: ex.Engine) {
    this.visuals.initialize();
    this.syncCollisionToSprite();
    this.initializeLivingActor(engine);
  }

  public die() {
    if (this.isDead) {
      return;
    }
    this.isDead = true;
    this.health = 0;
    this.hspeed = 0;
    this.vspeed = 0;
    this.graphics.opacity = 0;
    this.graphics.visible = false;
    this.collisionBounds.width = 0;
    this.collisionBounds.height = 0;
    this.pos = ex.vec(-100_000, -100_000);
    this.kill();
  }

  public isFacingLeft() {
    return this.facingLeft;
  }

  override onPostUpdate(_engine: ex.Engine, delta: number) {
    this.tickDamageFeedback(delta);
    if (this.isDead) {
      return;
    }
    this.tickWalkingFrame(delta);
  }

  private syncSimStateFromActor() {
    this.simState.apply({
      x: this.pos.x,
      y: this.pos.y,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
      width: this.width,
      height: this.height,
      isGrounded: this.isGrounded,
      isJumping: this.isJumping,
    });
  }

  private syncActorFromSimState() {
    this.pos.x = this.simState.x;
    this.pos.y = this.simState.y;
    this.hspeed = this.simState.horizontalSpeed;
    this.vspeed = this.simState.verticalSpeed;
    this.isGrounded = this.simState.isGrounded;
    this.isJumping = this.simState.isJumping;
  }
}
