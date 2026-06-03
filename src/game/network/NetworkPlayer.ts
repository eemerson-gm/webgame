import type { Engine } from "excalibur";
import * as ex from "excalibur";
import type { PlayerState } from "../../classes/GameWire";
import {
  PlayerNetworkClient,
  type PlayerNetworkSnapshot,
} from "../../classes/PlayerNetworkClient";
import type { GameClient } from "../../classes/GameClient";
import type { PlayerHand } from "../../combat/playerHands";
import { Player, playerJumpHoldDurationMs } from "../../actors/Player";
import type { TileCollisionWorld } from "../../actors/MovingActor";
import { quantizePosition } from "./positionQuantize";
import { RemotePositionSync } from "./RemotePositionSync";

export class NetworkPlayer extends Player {
  private readonly network: PlayerNetworkClient;
  private readonly positionSync: RemotePositionSync;
  private lastAppliedRemoteAttackCycle: number = 0;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    collisionWorld: TileCollisionWorld | undefined,
    client?: GameClient,
  ) {
    super(pos, tilemap, collisionWorld);
    this.network = new PlayerNetworkClient(client);
    this.positionSync = new RemotePositionSync(
      this,
      (position, snapDistance, correctionOptions) => {
        this.applyPositionCorrection(position, snapDistance, correctionOptions);
      },
      () => {
        this.syncPhysicsInterpolationToCurrentPosition();
      },
    );
  }

  public isLocal(): boolean {
    return this.network.hasClient();
  }

  public tryLocalAttack(hand: PlayerHand): void {
    if (!this.isLocal()) {
      return;
    }
    this.attemptAttack(hand);
  }

  protected override onLand(): void {
    super.onLand();
    if (!this.network.hasClient()) {
      return;
    }
    const position = quantizePosition(this.pos.x, this.pos.y);
    this.network.onLanded(position.x, position.y);
  }

  protected override onJumpStarted(): void {
    super.onJumpStarted();
    if (!this.network.hasClient()) {
      return;
    }
    const position = quantizePosition(this.pos.x, this.pos.y);
    this.network.onJump({
      x: position.x,
      y: position.y,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
    });
  }

  protected override onAttackStarted(hand: PlayerHand): void {
    super.onAttackStarted(hand);
    if (!this.network.hasClient()) {
      return;
    }
    this.network.onAttack(this.swordAttackCycle(), this.isFacingLeft());
  }

  public applyRemote(payload: PlayerState): void {
    if (this.isLocal()) {
      return;
    }
    if (payload.isPaused !== undefined) {
      this.setPaused(payload.isPaused);
    }
    if (payload.keyLeft !== undefined) {
      this.keyLeft = payload.keyLeft;
    }
    if (payload.keyRight !== undefined) {
      this.keyRight = payload.keyRight;
    }
    if (payload.keyJump !== undefined) {
      this.keyJump = payload.keyJump;
    }
    if (payload.keyDown !== undefined) {
      this.keyDown = payload.keyDown;
    }
    if (payload.facingLeft !== undefined) {
      this.setFacingLeft(payload.facingLeft);
    } else {
      this.syncFacingFromKeys();
    }
    if (payload.health !== undefined) {
      this.syncHealth(payload.health);
    }
    this.applyRemoteAttack(payload);
    if (this.applyRemoteJumpStart(payload)) {
      return;
    }
    this.applyRemotePosition(payload);
    this.applyRemoteVelocity(payload);
  }

  public applyLocalState(payload: PlayerState): void {
    if (payload.isPaused !== undefined) {
      this.setPaused(payload.isPaused);
    }
    if (payload.health !== undefined) {
      this.syncHealth(payload.health);
    }
  }

  public syncPauseState(isPaused: boolean): void {
    this.setPaused(isPaused);
    if (!this.isLocal()) {
      return;
    }
    const position = quantizePosition(this.pos.x, this.pos.y);
    this.network.onPaused({
      isPaused,
      x: position.x,
      y: position.y,
    });
  }

  public tickLocal(engine: Engine, frameDelta: number): void {
    if (!this.isLocal()) {
      return;
    }
    this.readLocalControls(engine);
    this.syncLocalInputIfChanged();
    const position = quantizePosition(this.pos.x, this.pos.y);
    this.network.tickPositionBackup(frameDelta, position.x, position.y);
  }

  private applyRemoteJumpStart(payload: PlayerState): boolean {
    if (payload.keyJump !== true || this.isJumping || !this.isGrounded) {
      return false;
    }
    const verticalSpeed = Number(payload.verticalSpeed);
    if (!Number.isFinite(verticalSpeed) || verticalSpeed >= 0) {
      return false;
    }
    if (payload.x === undefined || payload.y === undefined) {
      return false;
    }
    this.positionSync.applyPartial(
      { x: payload.x, y: payload.y },
      {
        resetVelocity: false,
        forceHardSnap: true,
      },
    );
    this.applyRemoteVelocity(payload);
    this.startJumpHold(playerJumpHoldDurationMs);
    return true;
  }

  private applyRemoteVelocity(payload: PlayerState): void {
    if (payload.horizontalSpeed !== undefined) {
      const horizontalSpeed = Number(payload.horizontalSpeed);
      if (Number.isFinite(horizontalSpeed)) {
        this.hspeed = horizontalSpeed;
      }
    }
    if (payload.verticalSpeed !== undefined) {
      const verticalSpeed = Number(payload.verticalSpeed);
      if (Number.isFinite(verticalSpeed)) {
        this.vspeed = verticalSpeed;
      }
    }
  }

  private applyRemotePosition(payload: PlayerState): void {
    this.positionSync.applyPartial(
      { x: payload.x, y: payload.y },
      { resetVelocity: false },
    );
  }

  private applyRemoteAttack(payload: PlayerState): void {
    if (payload.facingLeft !== undefined) {
      this.setFacingLeft(payload.facingLeft);
    } else {
      this.syncFacingFromKeys();
    }
    const attackCycle = Number(payload.attackCycle);
    if (Number.isFinite(attackCycle) && attackCycle > 0) {
      if (attackCycle > this.lastAppliedRemoteAttackCycle) {
        this.lastAppliedRemoteAttackCycle = attackCycle;
        if (this.isSwordAttackActive()) {
          this.cancelActiveSwordAttack();
        }
        this.triggerAttack("handLeft");
        return;
      }
    }
    if (payload.keyAttack) {
      this.triggerAttack("handLeft");
    }
  }

  private syncLocalInputIfChanged(): void {
    if (!this.inputStateHasChanged()) {
      return;
    }
    this.network.onInputChanged(this.networkSnapshot());
    this.rememberInputState();
  }

  private networkSnapshot(): PlayerNetworkSnapshot {
    const position = quantizePosition(this.pos.x, this.pos.y);
    return {
      keyLeft: this.keyLeft,
      keyRight: this.keyRight,
      keyJump: this.keyJump,
      keyDown: this.keyDown,
      facingLeft: this.isFacingLeft(),
      isGrounded: this.isGrounded,
      x: position.x,
      y: position.y,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
      attackCycle: this.swordAttackCycle(),
    };
  }
}
