import * as ex from "excalibur";
import { toolbarSelection } from "../classes/ToolbarSelection";
import { HeartDisplay } from "./HeartDisplay";
import { ToolbarDisplay } from "./ToolbarDisplay";
import { PowerupTimerDisplay } from "./PowerupTimerDisplay";

type HealthProvider = () => {
  health: number;
  maxHealth: number;
  isFlying: boolean;
} | null;

type PowerupExpiredHandler = () => void;

const displayPosition = ex.vec(4, 4);
const viewHeight = 180;

export class HUDManager extends ex.ScreenElement {
  private readonly getHealth: HealthProvider;
  private readonly onPowerupExpired: PowerupExpiredHandler;
  
  private readonly heartDisplay: HeartDisplay;
  private readonly toolbarDisplay: ToolbarDisplay;
  private readonly powerupTimerDisplay: PowerupTimerDisplay;

  private readonly selectBlockFromWheel = (event: WheelEvent) => {
    const direction = Math.sign(event.deltaY);
    if (direction === 0) {
      return;
    }
    event.preventDefault();
    toolbarSelection.selectNextSlot(direction);
    this.toolbarDisplay.sync();
  };

  constructor(
    getHealth: HealthProvider,
    onPowerupExpired: PowerupExpiredHandler = () => {},
  ) {
    super({
      pos: displayPosition,
      anchor: ex.vec(0, 0),
      z: 1000,
    });
    this.getHealth = getHealth;
    this.onPowerupExpired = onPowerupExpired;
    
    this.heartDisplay = new HeartDisplay(ex.vec(0, 0));
    this.toolbarDisplay = new ToolbarDisplay(ex.vec(0, 0), ex.vec(0, viewHeight), this.getHealth);
    this.powerupTimerDisplay = new PowerupTimerDisplay(() => this.toolbarDisplay.getPowerupSlotPosition());
  }

  override onInitialize(engine: ex.Engine) {
    engine.canvas.addEventListener("wheel", this.selectBlockFromWheel, {
      passive: false,
    });
    
    this.heartDisplay.getActors().forEach((actor) => this.addChild(actor));
    this.toolbarDisplay.getActors().forEach((actor) => this.addChild(actor));
    this.powerupTimerDisplay.getActors().forEach((actor) => this.addChild(actor));

    this.toolbarDisplay.sync();
    this.powerupTimerDisplay.sync();
    this.syncHearts();
  }

  override onPostUpdate(engine: ex.Engine, delta: number) {
    if (!engine) {
      return;
    }
    if (toolbarSelection.updatePowerupTimer(delta)) {
      this.onPowerupExpired();
    }
    
    this.toolbarDisplay.sync();
    this.powerupTimerDisplay.sync();
    this.syncHearts();
  }

  private syncHearts() {
    const health = this.getHealth();
    const currentHealth = health?.health ?? 0;
    this.heartDisplay.syncHearts(currentHealth);
  }
}
