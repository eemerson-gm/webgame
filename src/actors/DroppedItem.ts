import * as ex from "excalibur";
import type { EntityState, ItemEntityState, PlayerState } from "../classes/GameProtocol";
import { blockItemSpriteForKind } from "../classes/BlockItemSprites";
import { isPlaceableBlockKind } from "../classes/ToolbarSelection";
import { stepItemEntity } from "../simulation/itemEntityBehavior";
import type { TileCollisionWorld } from "../simulation/entityPhysics";
import type { Player } from "./Player";

type DroppedItemProviders = {
  world: () => TileCollisionWorld | null;
  player: () => Player | null;
  playersData: () => Record<string, PlayerState>;
  clientId: () => string;
  sendState: (state: EntityState) => void;
  collect: (entityId: string) => void;
};

const itemSize = 6;
const itemOutlineWidth = 1;
const itemOutlineSize = itemSize + itemOutlineWidth * 2;
const itemOutlineColor = "#000000";
const correctionSnapDistance = 32;
const ownerStateSyncIntervalMs = 200;
const settledSpeedThreshold = 0.02;
const collectRetryDelayMs = 250;

const overlaps = (a: ex.Actor, b: ex.Actor) => {
  if (a.pos.x + a.width < b.pos.x) {
    return false;
  }
  if (a.pos.x > b.pos.x + b.width) {
    return false;
  }
  if (a.pos.y + a.height < b.pos.y) {
    return false;
  }
  return a.pos.y <= b.pos.y + b.height;
};

class DroppedItemOutlineRaster extends ex.Raster {
  constructor() {
    super({
      width: itemOutlineSize,
      height: itemOutlineSize,
      origin: ex.vec(0, 0),
      smoothing: false,
      filtering: ex.ImageFiltering.Pixel,
    });
  }

  override clone() {
    return new DroppedItemOutlineRaster();
  }

  override execute(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = itemOutlineColor;
    ctx.fillRect(1, 0, itemSize, itemOutlineWidth);
    ctx.fillRect(1, itemOutlineSize - 1, itemSize, itemOutlineWidth);
    ctx.fillRect(0, 1, itemOutlineWidth, itemSize);
    ctx.fillRect(itemOutlineSize - 1, 1, itemOutlineWidth, itemSize);
  }
}

export class DroppedItem extends ex.Actor {
  private state: ItemEntityState;
  private readonly providers: DroppedItemProviders;
  private ownerStateSyncElapsedMs = 0;
  private collectRetryMsRemaining = 0;
  private hasSentSettledState = false;

  constructor(state: ItemEntityState, providers: DroppedItemProviders) {
    super({
      pos: ex.vec(state.x, state.y),
      anchor: ex.vec(0, 0),
      width: itemOutlineSize,
      height: itemOutlineSize,
      z: 3,
    });
    this.state = { ...state };
    this.providers = providers;
  }

  override onInitialize() {
    if (!isPlaceableBlockKind(this.state.item.kind)) {
      this.kill();
      return;
    }
    const outline = new ex.Actor({
      pos: ex.vec(0, 0),
      anchor: ex.vec(0, 0),
      width: itemOutlineSize,
      height: itemOutlineSize,
      z: -1,
    });
    outline.graphics.anchor = ex.vec(0, 0);
    outline.graphics.use(new DroppedItemOutlineRaster());
    this.addChild(outline);
    this.graphics.offset = ex.vec(itemOutlineWidth, itemOutlineWidth);
    this.graphics.anchor = ex.vec(0, 0);
    this.graphics.use(blockItemSpriteForKind(this.state.item.kind, itemSize));
    this.renderState();
  }

  public syncFromState(state: ItemEntityState) {
    const isBecomingLocalOwner =
      !this.isOwnedByLocal() && state.ownerId === this.localClientId();
    if (isBecomingLocalOwner) {
      this.state = { ...state };
      this.renderState();
      return;
    }
    if (this.isOwnedByLocal() && state.ownerId === this.localClientId()) {
      this.state = {
        ...this.state,
        ownerId: state.ownerId,
        collectibleAtMs: state.collectibleAtMs,
      };
      return;
    }
    if (this.pos.distance(ex.vec(state.x, state.y)) > correctionSnapDistance) {
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

  override onPostUpdate(_engine: ex.Engine, delta: number) {
    void _engine;
    this.collectRetryMsRemaining = Math.max(
      this.collectRetryMsRemaining - delta,
      0,
    );
    this.stepLocally(delta);
    this.collectWhenTouchingPlayer();
  }

  private stepLocally(delta: number) {
    const world = this.providers.world();
    if (!world) {
      this.renderState();
      return;
    }
    this.state = stepItemEntity(this.state, {
      playersData: this.providers.playersData(),
      world,
      dt: delta / 1000,
    });
    this.renderState();
    this.syncOwnerState(delta);
  }

  private collectWhenTouchingPlayer() {
    if (this.collectRetryMsRemaining > 0) {
      return;
    }
    if (Date.now() < this.state.collectibleAtMs) {
      return;
    }
    const player = this.providers.player();
    if (!player) {
      return;
    }
    if (player.isPaused) {
      return;
    }
    if (!player.isAlive()) {
      return;
    }
    if (!overlaps(this, player)) {
      return;
    }
    this.collectRetryMsRemaining = collectRetryDelayMs;
    this.providers.collect(this.state.id);
  }

  private renderState() {
    this.pos.x = this.state.x;
    this.pos.y = this.state.y;
  }

  private syncOwnerState(delta: number) {
    if (!this.isOwnedByLocal()) {
      return;
    }
    if (this.isSettled()) {
      if (this.hasSentSettledState) {
        return;
      }
      this.hasSentSettledState = true;
      this.ownerStateSyncElapsedMs = 0;
      this.providers.sendState(this.state);
      return;
    }
    this.hasSentSettledState = false;
    this.ownerStateSyncElapsedMs += delta;
    if (this.ownerStateSyncElapsedMs < ownerStateSyncIntervalMs) {
      return;
    }
    this.ownerStateSyncElapsedMs =
      this.ownerStateSyncElapsedMs % ownerStateSyncIntervalMs;
    this.providers.sendState(this.state);
  }

  private isSettled() {
    if (!this.state.isGrounded) {
      return false;
    }
    if (Math.abs(this.state.horizontalSpeed) > settledSpeedThreshold) {
      return false;
    }
    return Math.abs(this.state.verticalSpeed) <= settledSpeedThreshold;
  }

  private isOwnedByLocal() {
    return this.state.ownerId === this.localClientId();
  }

  private localClientId() {
    return this.providers.clientId();
  }
}
