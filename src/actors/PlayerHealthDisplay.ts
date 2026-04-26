import * as ex from "excalibur";
import { Resources } from "../resource";

type HealthProvider = () => {
  health: number;
  maxHealth: number;
} | null;

const heartCount = 3;
const heartWidth = 8;
const heartSpacing = 9;
const displayPosition = ex.vec(4, 4);

export class PlayerHealthDisplay extends ex.ScreenElement {
  private readonly getHealth: HealthProvider;
  private readonly heartActors: ex.Actor[];

  constructor(getHealth: HealthProvider) {
    super({
      pos: displayPosition,
      anchor: ex.vec(0, 0),
      z: 1000,
    });
    this.getHealth = getHealth;
    this.heartActors = Array.from({ length: heartCount }, (_value, index) => {
      const actor = new ex.Actor({
        pos: ex.vec(index * heartSpacing, 0),
        anchor: ex.vec(0, 0),
        width: heartWidth,
        height: heartWidth,
      });
      actor.graphics.anchor = ex.vec(0, 0);
      return actor;
    });
  }

  override onInitialize() {
    this.heartActors.forEach((actor) => this.addChild(actor));
    this.syncHearts();
  }

  override onPostUpdate() {
    this.syncHearts();
  }

  private syncHearts() {
    const health = this.getHealth();
    const currentHealth = health?.health ?? 0;
    this.heartActors.forEach((actor, index) => {
      actor.graphics.use(this.heartSpriteFor(currentHealth - index * 2));
    });
  }

  private heartSpriteFor(heartHealth: number) {
    if (heartHealth >= 2) {
      return Resources.HeartFull.toSprite();
    }
    if (heartHealth >= 1) {
      return Resources.HeartHalf.toSprite();
    }
    return Resources.HeartEmpty.toSprite();
  }
}
