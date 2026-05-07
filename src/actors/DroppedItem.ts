import * as ex from "excalibur";
import type {
  EntityState,
  ItemEntityState,
  PlayerState,
} from "../classes/GameProtocol";
import { blockItemSpriteForKind } from "../classes/BlockItemSprites";
import { isPlaceableBlockKind } from "../classes/ToolbarSelection";
import {
  itemCollisionBounds,
  stepItemEntity,
} from "../simulation/itemEntityBehavior";
import type {
  EntitySeparationBody,
  TileCollisionWorld,
} from "../simulation/entityPhysics";
import type { Player } from "./Player";
import { NetworkedEntityBehavior } from "../simulation/NetworkedEntityBehavior";

import { PowerupItemRaster } from "../ui/PowerupItemRaster";

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
  private collectRetryMsRemaining = 0;
  private readonly networkedBehavior: NetworkedEntityBehavior<ItemEntityState>;

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
    this.networkedBehavior = new NetworkedEntityBehavior(providers);
  }

  override onInitialize() {
    const item = this.state.item;
    const blockKind =
      item.type === "block" && isPlaceableBlockKind(item.kind)
        ? item.kind
        : null;
    if (
      item.type === "block" &&
      !blockKind
    ) {
      this.kill();
      return;
    }
    if (blockKind) {
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
    }
    this.graphics.anchor = ex.vec(0, 0);
    if (item.type === "powerup") {
      this.graphics.use(new PowerupItemRaster());
    }
    if (blockKind) {
      this.graphics.use(blockItemSpriteForKind(blockKind, itemSize));
    }
    this.renderState();
  }

  public syncFromState(state: ItemEntityState) {
    const isBecomingLocalOwner =
      !this.networkedBehavior.isOwnedByLocal(this.state) && state.ownerId === this.networkedBehavior.localClientId();
    if (isBecomingLocalOwner) {
      this.state = { ...state };
      this.renderState();
      return;
    }
    if (this.networkedBehavior.isOwnedByLocal(this.state) && state.ownerId === this.networkedBehavior.localClientId()) {
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

  public entitySeparationBody(): EntitySeparationBody {
    return {
      id: `item:${this.state.id}`,
      x: this.state.x,
      y: this.state.y,
      horizontalSpeed: this.state.horizontalSpeed,
      verticalSpeed: this.state.verticalSpeed,
      width: this.width,
      height: this.height,
      isGrounded: this.state.isGrounded,
      isJumping: this.state.isJumping,
      collisionBounds: itemCollisionBounds,
      canSeparate: this.networkedBehavior.isOwnedByLocal(this.state) && !this.isKilled(),
    };
  }

  public applySeparatedX(x: number) {
    if (!this.networkedBehavior.isOwnedByLocal(this.state)) {
      return;
    }
    if (this.state.x === x) {
      return;
    }
    this.state = {
      ...this.state,
      x,
    };
    this.networkedBehavior.resetSettledState();
    this.renderState();
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
    this.networkedBehavior.syncOwnerStatePeriodically(delta, this.state, this.isSettled());
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

  private isSettled() {
    if (!this.state.isGrounded) {
      return false;
    }
    if (Math.abs(this.state.horizontalSpeed) > settledSpeedThreshold) {
      return false;
    }
    return Math.abs(this.state.verticalSpeed) <= settledSpeedThreshold;
  }
}
