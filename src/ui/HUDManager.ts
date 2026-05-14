import * as ex from "excalibur";
import { HeartDisplay } from "./HeartDisplay";

type HealthProvider = () => {
  health: number;
  maxHealth: number;
} | null;

const displayPosition = ex.vec(4, 4);

export class HUDManager extends ex.ScreenElement {
  private readonly getHealth: HealthProvider;

  private readonly heartDisplay: HeartDisplay;

  constructor(getHealth: HealthProvider) {
    super({
      pos: displayPosition,
      anchor: ex.vec(0, 0),
      z: 1000,
    });
    this.getHealth = getHealth;

    this.heartDisplay = new HeartDisplay(ex.vec(0, 0));
  }

  override onInitialize() {
    this.heartDisplay.getActors().forEach((actor) => this.addChild(actor));

    this.syncHearts();
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    if (!engine) {
      return;
    }

    this.syncHearts();
  }

  private syncHearts() {
    const health = this.getHealth();
    const currentHealth = health?.health ?? 0;
    this.heartDisplay.syncHearts(currentHealth);
  }
}
