import type { EntityPhysicsState } from "../../physics/entityPhysics.js";

/** Mutable simulation state shared by client adapters and server sim entities. */
export class NetworkedEntityState {
  public x = 0;
  public y = 0;
  public horizontalSpeed = 0;
  public verticalSpeed = 0;
  public width = 0;
  public height = 0;
  public isGrounded = false;
  public isJumping = false;

  constructor(initial?: Partial<EntityPhysicsState>) {
    if (initial) {
      this.apply(initial);
    }
  }

  toPhysicsState(): EntityPhysicsState {
    return {
      x: this.x,
      y: this.y,
      horizontalSpeed: this.horizontalSpeed,
      verticalSpeed: this.verticalSpeed,
      width: this.width,
      height: this.height,
      isGrounded: this.isGrounded,
      isJumping: this.isJumping,
    };
  }

  apply(state: Partial<EntityPhysicsState>): void {
    if (state.x !== undefined) {
      this.x = state.x;
    }
    if (state.y !== undefined) {
      this.y = state.y;
    }
    if (state.horizontalSpeed !== undefined) {
      this.horizontalSpeed = state.horizontalSpeed;
    }
    if (state.verticalSpeed !== undefined) {
      this.verticalSpeed = state.verticalSpeed;
    }
    if (state.width !== undefined) {
      this.width = state.width;
    }
    if (state.height !== undefined) {
      this.height = state.height;
    }
    if (state.isGrounded !== undefined) {
      this.isGrounded = state.isGrounded;
    }
    if (state.isJumping !== undefined) {
      this.isJumping = state.isJumping;
    }
  }
}
