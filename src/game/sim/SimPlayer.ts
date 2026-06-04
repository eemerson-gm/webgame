import type { TileCollisionWorld } from "../../physics/entityPhysics";
import {
  playerWalkingTuning,
  playerVitality,
  simCollisionBounds,
  simEntityHeight,
  simEntityWidth,
  swordAttackDurationMs,
} from "./simConfig";
import { SimWalkingEntity } from "./SimWalkingEntity";
import { NetworkedEntityState } from "./NetworkedEntityState";
import { PlayerLocomotionSimulator } from "./locomotion/PlayerLocomotionSimulator";

export type SimPlayerInput = {
  readonly x: number;
  readonly y: number;
  readonly horizontalSpeed: number;
  readonly verticalSpeed: number;
  readonly keyLeft: boolean;
  readonly keyRight: boolean;
  readonly keyJump: boolean;
  readonly keyDown: boolean;
  readonly keyAttack: boolean;
  readonly facingLeft: boolean;
  readonly isPaused: boolean;
};

const runSpeedMultiplier = 2;

export class SimPlayer extends SimWalkingEntity {
  public readonly id: string;
  public lastProcessedInputSequence: number = 0;
  public attackCycle: number = 0;
  public isPaused: boolean = false;

  private readonly simState = new NetworkedEntityState();
  private readonly locomotion = new PlayerLocomotionSimulator(
    this.simState,
    playerWalkingTuning,
  );
  private swordAttackTimeRemainingMs: number = 0;
  private readonly spawnX: number;
  private readonly spawnY: number;
  private displayX: number;
  private displayY: number;

  private input: SimPlayerInput = {
    x: 0,
    y: 0,
    horizontalSpeed: 0,
    verticalSpeed: 0,
    keyLeft: false,
    keyRight: false,
    keyJump: false,
    keyDown: false,
    keyAttack: false,
    facingLeft: false,
    isPaused: false,
  };

  constructor(id: string, x: number, y: number) {
    super(x, y, playerWalkingTuning, playerVitality);
    this.id = id;
    this.spawnX = x;
    this.spawnY = y;
    this.displayX = x;
    this.displayY = y;
    this.syncSimStateFromEntity();
  }

  public displayPositionForSnapshot(): { x: number; y: number } {
    return { x: this.displayX, y: this.displayY };
  }

  public inputForSnapshot(): SimPlayerInput {
    return this.input;
  }

  public applyInput(sequence: number, input: SimPlayerInput) {
    if (sequence <= this.lastProcessedInputSequence) {
      return;
    }
    this.lastProcessedInputSequence = sequence;
    this.input = input;
    this.x = input.x;
    this.y = input.y;
    this.horizontalSpeed = input.horizontalSpeed;
    this.verticalSpeed = input.verticalSpeed;
    this.displayX = input.x;
    this.displayY = input.y;
    this.isPaused = false;
    this.facingLeft = input.facingLeft;
    this.syncSimStateFromEntity();
    if (input.keyAttack) {
      this.startSwordAttack();
    }
  }

  public startSwordAttack(): void {
    if (this.swordAttackTimeRemainingMs > 0) {
      return;
    }
    this.attackCycle += 1;
    this.swordAttackTimeRemainingMs = swordAttackDurationMs;
  }

  public tickAttackTimer(deltaMs: number) {
    this.swordAttackTimeRemainingMs = Math.max(
      this.swordAttackTimeRemainingMs - deltaMs,
      0,
    );
  }

  public isSwordAttackActive(): boolean {
    return this.swordAttackTimeRemainingMs > 0;
  }

  public swordAttackElapsedRatio(): number {
    if (!this.isSwordAttackActive()) {
      return 0;
    }
    return 1 - this.swordAttackTimeRemainingMs / swordAttackDurationMs;
  }

  protected override canSeparate(): boolean {
    return !this.isPaused && this.isAlive();
  }

  protected override separationKind(): "player" {
    return "player";
  }

  protected override horizontalMoveSign(): number {
    if (this.isPaused) {
      return 0;
    }
    if (this.input.keyLeft === this.input.keyRight) {
      return 0;
    }
    if (this.input.keyLeft) {
      return -1;
    }
    return 1;
  }

  protected override stepLocomotion(
    moveSign: number,
    deltaMs: number,
    world: TileCollisionWorld,
  ) {
    this.syncSimStateFromEntity();
    const dt = deltaMs / 1000;
    this.locomotion.stepLocomotion(
      moveSign,
      deltaMs,
      {
        collisionBounds: simCollisionBounds,
        world,
        dt,
        positionScale: this.tuning.positionScale,
      },
      {
        keyJump: this.input.keyJump,
        isRunning: false,
        runSpeedMultiplier,
      },
    );
    this.syncEntityFromSimState();
  }

  protected override tryJump() {
    if (this.isPaused || !this.isGrounded || !this.input.keyJump) {
      return;
    }
    this.syncSimStateFromEntity();
    if (!this.locomotion.tryJump()) {
      return;
    }
    this.syncEntityFromSimState();
  }

  public respawn() {
    this.health = this.maxHealth;
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.displayX = this.spawnX;
    this.displayY = this.spawnY;
    this.horizontalSpeed = 0;
    this.verticalSpeed = 0;
    this.isGrounded = false;
    this.isJumping = false;
    this.locomotion.jumpHoldTimeRemainingMs = 0;
    this.knockbackTimeRemainingMs = 0;
    this.syncSimStateFromEntity();
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
