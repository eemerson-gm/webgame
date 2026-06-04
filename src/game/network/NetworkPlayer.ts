import type { Engine } from "excalibur";
import * as ex from "excalibur";
import type {
  AuthoritativePlayerSnapshot,
  PlayerState,
} from "../../classes/GameWire";
import {
  PlayerNetworkClient,
  type PlayerInputSample,
} from "../../classes/PlayerNetworkClient";
import type { GameClient } from "../../classes/GameClient";
import type { PlayerHand } from "../../combat/playerHands";
import { Player } from "../../actors/Player";
import type { TileCollisionWorld } from "../../actors/MovingActor";
import { PlayerInputBuffer } from "./PlayerInputBuffer";
import {
  OwnerAuthoritativePolicy,
  ServerCorrectedPolicy,
} from "./NetworkAuthorityPolicy";
import { NetworkCorrectionController } from "./NetworkCorrectionController";

export class NetworkPlayer extends Player {
  private readonly network: PlayerNetworkClient;
  private readonly ownerAuthority = new OwnerAuthoritativePolicy();
  private readonly serverAuthority: ServerCorrectedPolicy;
  private readonly inputBuffer = new PlayerInputBuffer();
  private attackPulse: boolean = false;
  private lastRemoteAttackCycle: number = 0;
  private hasRemoteAttackCycle: boolean = false;

  constructor(
    pos: ex.Vector,
    tilemap: ex.TileMap,
    collisionWorld: TileCollisionWorld | undefined,
    client?: GameClient,
  ) {
    super(pos, tilemap, collisionWorld);
    this.network = new PlayerNetworkClient(client);
    this.serverAuthority = new ServerCorrectedPolicy(
      new NetworkCorrectionController(this),
    );
  }

  public isLocal(): boolean {
    return this.network.hasClient();
  }

  public tryLocalAttack(hand: PlayerHand): void {
    if (!this.isLocal()) {
      return;
    }
    if (!this.attemptAttack(hand)) {
      return;
    }
    this.sendOwnerInput({ keyAttack: true });
  }

  protected override shouldRunLocalPhysics(): boolean {
    return true;
  }

  protected override onAttackStarted(hand: PlayerHand): void {
    super.onAttackStarted(hand);
    if (!this.isLocal()) {
      return;
    }
    this.attackPulse = true;
  }

  public applyRemote(payload: PlayerState): void {
    if (this.isLocal()) {
      return;
    }
    this.applyRemoteOutcomes(payload);
  }

  public applyAuthoritativeSnapshot(snapshot: AuthoritativePlayerSnapshot): void {
    if (this.isLocal()) {
      this.applyLocalAuthoritativeSnapshot(snapshot);
      return;
    }
    this.applyRemotePhysicsSnapshot(snapshot);
  }

  public applyLocalState(payload: PlayerState): void {
    if (this.isLocal()) {
      this.applyLocalAuthoritativeOutcomes(payload);
      return;
    }
    this.applyRemoteOutcomes(payload);
  }

  public tickLocal(engine: Engine): void {
    if (!this.isLocal()) {
      return;
    }
    this.readLocalControls(engine);
    this.sendOwnerInput();
    this.attackPulse = false;
  }

  private sendOwnerInput(overrides?: Partial<PlayerInputSample>): void {
    if (!this.isLocal()) {
      return;
    }
    const sample: PlayerInputSample = {
      ...this.inputSample(),
      ...overrides,
    };
    const sequence = this.network.sendInput(sample);
    if (sequence > 0) {
      this.inputBuffer.push(sequence, sample);
    }
  }

  private applyLocalAuthoritativeSnapshot(
    snapshot: AuthoritativePlayerSnapshot,
  ): void {
    this.inputBuffer.acknowledgeThrough(snapshot.lastProcessedInputSequence);
    this.applyLocalAuthoritativeOutcomes(snapshot);
    this.ownerAuthority.applySnapshotPosition(snapshot);
  }

  private applyLocalAuthoritativeOutcomes(state: { health?: number }): void {
    if (state.health !== undefined) {
      this.syncHealth(state.health);
    }
  }

  private applyRemoteOutcomes(state: { health?: number }): void {
    if (state.health !== undefined) {
      this.syncHealth(state.health);
    }
  }

  private applyRemotePhysicsSnapshot(snapshot: AuthoritativePlayerSnapshot): void {
    this.applyMovementInput(snapshot);
    this.applyRemoteOutcomes(snapshot);

    this.applyRemoteAttackFromSnapshot(snapshot);

    this.serverAuthority.applySnapshotPosition(snapshot);
  }

  private applyRemoteAttackFromSnapshot(snapshot: AuthoritativePlayerSnapshot): void {
    if (!this.hasRemoteAttackCycle) {
      this.hasRemoteAttackCycle = true;
      this.lastRemoteAttackCycle = snapshot.attackCycle;
      return;
    }
    if (snapshot.attackCycle <= this.lastRemoteAttackCycle) {
      return;
    }
    this.lastRemoteAttackCycle = snapshot.attackCycle;
    this.triggerAttack("handLeft");
  }

  private applyMovementInput(snapshot: AuthoritativePlayerSnapshot): void {
    this.applyInputSample({
      keyLeft: snapshot.keyLeft,
      keyRight: snapshot.keyRight,
      keyJump: snapshot.keyJump,
      keyDown: snapshot.keyDown,
      facingLeft: snapshot.facingLeft,
    });
  }

  private inputSample(): PlayerInputSample {
    return {
      x: this.pos.x,
      y: this.pos.y,
      horizontalSpeed: this.hspeed,
      verticalSpeed: this.vspeed,
      keyLeft: this.keyLeft,
      keyRight: this.keyRight,
      keyJump: this.keyJump,
      keyDown: this.keyDown,
      keyAttack: this.attackPulse,
      facingLeft: this.isFacingLeft(),
      isPaused: false,
    };
  }
}
