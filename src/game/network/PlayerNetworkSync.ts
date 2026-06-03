import type { PlayerState } from "../../classes/GameWire";
import {
  PlayerNetworkClient,
  type PlayerNetworkSnapshot,
} from "../../classes/PlayerNetworkClient";
import type { GameClient } from "../../classes/GameClient";
import type { Engine } from "excalibur";
import type { PlayerHand } from "../../combat/playerHands";
import { Player, playerJumpHoldDurationMs } from "../../actors/Player";
import { quantizePosition } from "./positionQuantize";
import { RemotePositionSync } from "./RemotePositionSync";

class PlayerOutboundTracker {
  private wasGrounded = true;
  private wasJumping = false;
  private lastAttackCycle = 0;

  public publish(player: Player, network: PlayerNetworkClient): void {
    if (player.isJumping && !this.wasJumping && player.vspeed < 0) {
      const position = quantizePosition(player.pos.x, player.pos.y);
      network.onJump({
        x: position.x,
        y: position.y,
        horizontalSpeed: player.hspeed,
        verticalSpeed: player.vspeed,
      });
    }
    if (player.isGrounded && !this.wasGrounded) {
      const position = quantizePosition(player.pos.x, player.pos.y);
      network.onLanded(position.x, position.y);
    }
    const attackCycle = player.swordAttackCycle();
    if (attackCycle > this.lastAttackCycle) {
      network.onAttack(attackCycle, player.isFacingLeft());
    }
    this.wasGrounded = player.isGrounded;
    this.wasJumping = player.isJumping;
    this.lastAttackCycle = attackCycle;
  }
}

export class PlayerNetworkSync {
  private readonly network: PlayerNetworkClient;
  private readonly outbound = new PlayerOutboundTracker();
  private readonly positionSync: RemotePositionSync;
  private lastAppliedRemoteAttackCycle: number = 0;

  constructor(
    private readonly player: Player,
    client?: GameClient,
  ) {
    this.network = new PlayerNetworkClient(client);
    this.positionSync = new RemotePositionSync(
      this.player,
      (position, snapDistance, correctionOptions) => {
        this.player.applyPositionCorrection(
          position,
          snapDistance,
          correctionOptions,
        );
      },
      () => {
        this.player.syncPhysicsInterpolationToCurrentPosition();
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
    if (!this.player.attemptAttack(hand)) {
      return;
    }
    this.network.onAttack(
      this.player.swordAttackCycle(),
      this.player.isFacingLeft(),
    );
    this.outbound.publish(this.player, this.network);
  }

  public applyRemote(payload: PlayerState): void {
    if (this.isLocal()) {
      return;
    }
    if (payload.isPaused !== undefined) {
      this.player.setPaused(payload.isPaused);
    }
    if (payload.keyLeft !== undefined) {
      this.player.keyLeft = payload.keyLeft;
    }
    if (payload.keyRight !== undefined) {
      this.player.keyRight = payload.keyRight;
    }
    if (payload.keyJump !== undefined) {
      this.player.keyJump = payload.keyJump;
    }
    if (payload.keyDown !== undefined) {
      this.player.keyDown = payload.keyDown;
    }
    if (payload.facingLeft !== undefined) {
      this.player.setFacingLeft(payload.facingLeft);
    } else {
      this.player.syncFacingFromKeys();
    }
    if (payload.health !== undefined) {
      this.player.syncHealth(payload.health);
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
      this.player.setPaused(payload.isPaused);
    }
    if (payload.health !== undefined) {
      this.player.syncHealth(payload.health);
    }
  }

  public syncPauseState(isPaused: boolean): void {
    this.player.setPaused(isPaused);
    if (!this.isLocal()) {
      return;
    }
    const position = quantizePosition(this.player.pos.x, this.player.pos.y);
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
    this.player.readLocalControls(engine);
    this.syncLocalInputIfChanged();
    this.outbound.publish(this.player, this.network);
    const position = quantizePosition(this.player.pos.x, this.player.pos.y);
    this.network.tickPositionBackup(frameDelta, position.x, position.y);
  }

  private applyRemoteJumpStart(payload: PlayerState): boolean {
    if (payload.keyJump !== true || this.player.isJumping || !this.player.isGrounded) {
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
    this.player.startJumpHold(playerJumpHoldDurationMs);
    return true;
  }

  private applyRemoteVelocity(payload: PlayerState): void {
    if (payload.horizontalSpeed !== undefined) {
      const horizontalSpeed = Number(payload.horizontalSpeed);
      if (Number.isFinite(horizontalSpeed)) {
        this.player.hspeed = horizontalSpeed;
      }
    }
    if (payload.verticalSpeed !== undefined) {
      const verticalSpeed = Number(payload.verticalSpeed);
      if (Number.isFinite(verticalSpeed)) {
        this.player.vspeed = verticalSpeed;
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
      this.player.setFacingLeft(payload.facingLeft);
    } else {
      this.player.syncFacingFromKeys();
    }
    const attackCycle = Number(payload.attackCycle);
    if (Number.isFinite(attackCycle) && attackCycle > 0) {
      if (attackCycle > this.lastAppliedRemoteAttackCycle) {
        this.lastAppliedRemoteAttackCycle = attackCycle;
        if (this.player.isSwordAttackActive()) {
          this.player.cancelActiveSwordAttack();
        }
        this.player.triggerAttack("handLeft");
        return;
      }
    }
    if (payload.keyAttack) {
      this.player.triggerAttack("handLeft");
    }
  }

  private syncLocalInputIfChanged(): void {
    if (!this.player.inputStateHasChanged()) {
      return;
    }
    this.network.onInputChanged(this.networkSnapshot());
    this.player.rememberInputState();
  }

  private networkSnapshot(): PlayerNetworkSnapshot {
    const position = quantizePosition(this.player.pos.x, this.player.pos.y);
    return {
      keyLeft: this.player.keyLeft,
      keyRight: this.player.keyRight,
      keyJump: this.player.keyJump,
      keyDown: this.player.keyDown,
      facingLeft: this.player.isFacingLeft(),
      isGrounded: this.player.isGrounded,
      x: position.x,
      y: position.y,
      horizontalSpeed: this.player.hspeed,
      verticalSpeed: this.player.vspeed,
      attackCycle: this.player.swordAttackCycle(),
    };
  }
}
