import * as ex from "excalibur";
import { Resources } from "../resource";
import type { PlayerPowerup } from "../classes/GameProtocol";
import { TILE_PX } from "../world/worldConfig";
import type { Player } from "./Player";

type PlayerProvider = () => Player | null;
type PowerupPickupOptions = {
  pos: ex.Vector;
  powerup: PlayerPowerup;
  player: PlayerProvider;
  onCollect: (powerup: PlayerPowerup) => void;
};

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

export class PowerupPickup extends ex.Actor {
  private readonly powerup: PlayerPowerup;
  private readonly player: PlayerProvider;
  private readonly onCollect: (powerup: PlayerPowerup) => void;
  private isCollected = false;

  constructor(options: PowerupPickupOptions) {
    super({
      pos: options.pos,
      anchor: ex.vec(0, 0),
      width: TILE_PX,
      height: TILE_PX,
      z: 4,
    });
    this.powerup = options.powerup;
    this.player = options.player;
    this.onCollect = options.onCollect;
  }

  override onInitialize() {
    this.graphics.use(Resources.MinerPowerup.toSprite());
  }

  override onPostUpdate() {
    this.collectWhenTouchingPlayer();
  }

  private collectWhenTouchingPlayer() {
    if (this.isCollected) {
      return;
    }
    const player = this.player();
    if (!player) {
      return;
    }
    if (!player.isAlive()) {
      return;
    }
    if (!overlaps(this, player)) {
      return;
    }
    this.isCollected = true;
    this.onCollect(this.powerup);
    this.kill();
  }
}
