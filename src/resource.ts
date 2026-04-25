import * as ex from "excalibur";

export const Resources = {
  Player: new ex.ImageSource("./assets/player.png"),
  PlayerWalk1: new ex.ImageSource("./assets/player_walk1.png"),
  PlayerWalk2: new ex.ImageSource("./assets/player_walk2.png"),
  PlayerJump: new ex.ImageSource("./assets/player_jump.png"),
  PlayerCrouch: new ex.ImageSource("./assets/player_crouch.png"),
  PlayerLookUp: new ex.ImageSource("./assets/player_look_up.png"),
  PlayerUseTool: new ex.ImageSource("./assets/player_use_tool.png"),
  PlayerUseTool1: new ex.ImageSource("./assets/player_use_tool1.png"),
  PlayerUseTool2: new ex.ImageSource("./assets/player_use_tool2.png"),
  PlayerUseTool3: new ex.ImageSource("./assets/player_use_tool3.png"),
  PlayerUseTool4: new ex.ImageSource("./assets/player_use_tool4.png"),
  PlayerUseTool5: new ex.ImageSource("./assets/player_use_tool5.png"),
  Block: new ex.ImageSource("./assets/block.png"),
  Grass: new ex.ImageSource("./assets/grass.png"),
  Dirt: new ex.ImageSource("./assets/dirt.png"),
  Stone: new ex.ImageSource("./assets/stone.png"),
  Bedrock: new ex.ImageSource("./assets/bedrock.png"),
} as const;
