import type { TileCollisionWorld } from "../../physics/entityPhysics";
import {
  simCollisionBounds,
  simEntityHeight,
  simEntityWidth,
  slimeVitality,
  slimeWalkingTuning,
} from "./simConfig";
import { SimWalkingEntity } from "./SimWalkingEntity";
import { NetworkedEntityState } from "./NetworkedEntityState";
import { SlimeLocomotionSimulator } from "./locomotion/SlimeLocomotionSimulator";
import { SlimeWanderController } from "./SlimeWanderController";

export class SimSlime extends SimWalkingEntity {
  public readonly id: string;
  public readonly ownerId: string;
  public isDead: boolean = false;

  public readonly wander: SlimeWanderController;
  private readonly simState = new NetworkedEntityState();
  private readonly locomotion = new SlimeLocomotionSimulator(
    this.simState,
    slimeWalkingTuning,
  );
  private readonly rng: () => number;
  private lastWorld: TileCollisionWorld | null = null;

  constructor(
    id: string,
    ownerId: string,
    x: number,
    y: number,
    rng: () => number = Math.random,
  ) {
    super(x, y, slimeWalkingTuning, slimeVitality);
    this.id = id;
    this.ownerId = ownerId;
    this.rng = rng;
    this.wander = new SlimeWanderController(rng);
    this.syncSimStateFromEntity();
  }

  public get wanderSign(): number {
    return this.wander.wanderSign;
  }

  protected override canSeparate(): boolean {
    return !this.isDead && this.isAlive();
  }

  protected override separationKind(): "entity" {
    return "entity";
  }

  protected override horizontalMoveSign(): number {
    if (this.isDead) {
      return 0;
    }
    return this.wander.wanderSign;
  }

  public tickWanderDecision(deltaMs: number) {
    this.wander.tickDecision(deltaMs, this.rng, this.isDead);
    this.facingLeft = this.wander.facingLeft;
  }

  protected override stepLocomotion(
    moveSign: number,
    deltaMs: number,
    world: TileCollisionWorld,
  ) {
    this.syncSimStateFromEntity();
    const dt = deltaMs / 1000;
    this.locomotion.stepLocomotion(moveSign, deltaMs, {
      collisionBounds: simCollisionBounds,
      world,
      dt,
      positionScale: this.tuning.positionScale,
    });
    this.syncEntityFromSimState();
  }

  protected override tryJump() {
    if (
      this.isDead ||
      this.wander.wanderSign === 0 ||
      !this.isGrounded ||
      !this.lastWorld
    ) {
      return;
    }
    this.syncSimStateFromEntity();
    if (
      !this.locomotion.shouldJumpForTileAhead(
        this.wander.wanderSign,
        this.lastWorld,
        simCollisionBounds,
      )
    ) {
      return;
    }
    this.locomotion.tryJump();
    this.syncEntityFromSimState();
  }

  public markDead() {
    this.isDead = true;
    this.health = 0;
    this.horizontalSpeed = 0;
    this.verticalSpeed = 0;
  }

  public override stepPhysics(deltaMs: number, world: TileCollisionWorld) {
    this.lastWorld = world;
    super.stepPhysics(deltaMs, world);
  }

  private syncSimStateFromEntity() {
    this.simState.apply({
      x: this.x,
      y: this.y,
      horizontalSpeed: this.horizontalSpeed,
      verticalSpeed: this.verticalSpeed,
      width: simEntityWidth,
      height: simEntityHeight,
      isGrounded: this.isGrounded,
      isJumping: this.isJumping,
    });
  }

  private syncEntityFromSimState() {
    this.x = this.simState.x;
    this.y = this.simState.y;
    this.horizontalSpeed = this.simState.horizontalSpeed;
    this.verticalSpeed = this.simState.verticalSpeed;
    this.isGrounded = this.simState.isGrounded;
    this.isJumping = this.simState.isJumping;
  }
}
