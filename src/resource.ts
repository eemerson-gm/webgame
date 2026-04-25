import * as ex from "excalibur";

export const Resources = {
  Player: new ex.ImageSource("./assets/player.png"),
  PlayerWalk1: new ex.ImageSource("./assets/player_walk1.png"),
  PlayerWalk2: new ex.ImageSource("./assets/player_walk2.png"),
  PlayerJump: new ex.ImageSource("./assets/player_jump.png"),
  PlayerCrouch: new ex.ImageSource("./assets/player_crouch.png"),
  PlayerLookUp: new ex.ImageSource("./assets/player_look_up.png"),
  Block: new ex.ImageSource("./assets/block.png"),
  Grass: new ex.ImageSource("./assets/grass.png"),
  Dirt: new ex.ImageSource("./assets/dirt.png"),
  Stone: new ex.ImageSource("./assets/stone.png"),
  Bedrock: new ex.ImageSource("./assets/bedrock.png"),
} as const;
