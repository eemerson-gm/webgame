import * as ex from "excalibur";
import { Resources } from "../resource";
import type { EntityState } from "../classes/GameProtocol";
import { TILE_PX } from "../world/worldConfig";
import type { WorldBounds } from "../simulation/entityPhysics";
import type { EntityActor } from "./EntityActor";
import type { Player } from "./Player";

type SlimeSnapshot = {
  state: EntityState;
  receivedAt: number;
};

const interpolationDelayMs = 120;
const maxSnapshotAgeMs = 1000;
const snapDistance = TILE_PX * 1.5;

export class Slime extends ex.Actor implements EntityActor {
  private state: EntityState;
  private snapshots: SlimeSnapshot[] = [];

  constructor(state: EntityState) {
    super({
      pos: ex.vec(state.x, state.y),
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: 2,
    });
    this.state = state;
    this.syncFromState(state);
  }

  override onInitialize() {
    this.graphics.use(Resources.Slime.toSprite());
  }

  public syncFromState(state: EntityState) {
    const snapshot = {
      state,
      receivedAt: performance.now(),
    };
    this.snapshots = [...this.snapshots, snapshot];
    if (this.snapshots.length === 1) {
      this.renderSnapshot(snapshot);
    }
  }

  public overlapsWorldBounds(bounds: WorldBounds) {
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
    void _player;
  }

  override onPostUpdate(_engine: ex.Engine, _delta: number) {
    void _engine;
    void _delta;
    const renderTime = performance.now() - interpolationDelayMs;
    const previousSnapshot = this.previousSnapshotAt(renderTime);
    const nextSnapshot = this.nextSnapshotAt(renderTime);
    if (!previousSnapshot || !nextSnapshot) {
      return;
    }
    this.snapshots = this.snapshots.filter(
      (snapshot) =>
        snapshot.receivedAt >= renderTime - maxSnapshotAgeMs ||
        snapshot === previousSnapshot,
    );
    if (previousSnapshot === nextSnapshot) {
      this.renderSnapshot(previousSnapshot);
      return;
    }
    this.renderInterpolatedSnapshot(previousSnapshot, nextSnapshot, renderTime);
  }

  private previousSnapshotAt(renderTime: number) {
    return (
      this.snapshots
        .filter((snapshot) => snapshot.receivedAt <= renderTime)
        .at(-1) ?? this.snapshots[0]
    );
  }

  private nextSnapshotAt(renderTime: number) {
    return (
      this.snapshots.find((snapshot) => snapshot.receivedAt >= renderTime) ??
      this.snapshots.at(-1)
    );
  }

  private renderSnapshot(snapshot: SlimeSnapshot) {
    this.state = snapshot.state;
    this.moveToRenderedPosition(ex.vec(snapshot.state.x, snapshot.state.y));
    this.graphics.flipHorizontal = this.state.facingLeft;
  }

  private renderInterpolatedSnapshot(
    previousSnapshot: SlimeSnapshot,
    nextSnapshot: SlimeSnapshot,
    renderTime: number,
  ) {
    const snapshotDuration = nextSnapshot.receivedAt - previousSnapshot.receivedAt;
    if (snapshotDuration <= 0) {
      this.renderSnapshot(nextSnapshot);
      return;
    }
    const ratio =
      (renderTime - previousSnapshot.receivedAt) / snapshotDuration;
    const renderedPosition = ex.vec(
      interpolate(previousSnapshot.state.x, nextSnapshot.state.x, ratio),
      interpolate(previousSnapshot.state.y, nextSnapshot.state.y, ratio),
    );
    this.state = nextSnapshot.state;
    this.moveToRenderedPosition(renderedPosition);
    this.graphics.flipHorizontal = this.state.facingLeft;
  }

  private moveToRenderedPosition(position: ex.Vector) {
    if (this.pos.distance(position) > snapDistance) {
      this.pos = position;
      return;
    }
    this.pos.x = position.x;
    this.pos.y = position.y;
  }
}

const interpolate = (start: number, end: number, ratio: number) =>
  start + (end - start) * Math.min(Math.max(ratio, 0), 1);
