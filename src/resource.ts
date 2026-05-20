import * as ex from "excalibur";

export const Resources = {
  GameFont: new ex.FontSource("./fonts/m5x7.ttf", "Game Font"),
  Bedrock: new ex.ImageSource("./assets/bedrock.png"),
  CharacterJamesActionSword: new ex.ImageSource(
    "./assets/characters/character_james_action_sword.png",
  ),
  CharacterJamesActionSword1: new ex.ImageSource(
    "./assets/characters/character_james_action_sword1.png",
  ),
  CharacterJamesActionSword2: new ex.ImageSource(
    "./assets/characters/character_james_action_sword2.png",
  ),
  CharacterJamesActionSword3: new ex.ImageSource(
    "./assets/characters/character_james_action_sword3.png",
  ),
  CharacterJamesCrouch: new ex.ImageSource(
    "./assets/characters/character_james_crouch.png",
  ),
  CharacterJamesIdle: new ex.ImageSource(
    "./assets/characters/character_james_idle.png",
  ),
  CharacterJamesJump: new ex.ImageSource(
    "./assets/characters/character_james_jump.png",
  ),
  CharacterJamesJump1: new ex.ImageSource(
    "./assets/characters/character_james_jump1.png",
  ),
  CharacterJamesJump2: new ex.ImageSource(
    "./assets/characters/character_james_jump2.png",
  ),
  CharacterJamesJump3: new ex.ImageSource(
    "./assets/characters/character_james_jump3.png",
  ),
  CharacterJamesJump4: new ex.ImageSource(
    "./assets/characters/character_james_jump4.png",
  ),
  CharacterJamesWalk1: new ex.ImageSource(
    "./assets/characters/character_james_walk1.png",
  ),
  CharacterJamesWalk2: new ex.ImageSource(
    "./assets/characters/character_james_walk2.png",
  ),
  WeaponSwordStick: new ex.ImageSource(
    "./assets/weapons/weapon_sword_stick.png",
  ),
  Dirt: new ex.ImageSource("./assets/dirt.png"),
  Grass: new ex.ImageSource("./assets/grass.png"),
  HeartEmpty: new ex.ImageSource("./assets/UI/ui_heart_empty.png"),
  HeartFull: new ex.ImageSource("./assets/UI/ui_heart_full.png"),
  HeartHalf: new ex.ImageSource("./assets/UI/ui_heart_half.png"),
  Lamp: new ex.ImageSource("./assets/spawn_orb.png"),
  PillarBottom: new ex.ImageSource("./assets/pillar_bottom.png"),
  PillarMiddle: new ex.ImageSource("./assets/pillar_middle.png"),
  PillarTop: new ex.ImageSource("./assets/pillar_top.png"),
  Spawn: new ex.ImageSource("./assets/spawn.png"),
  SpawnOrb: new ex.ImageSource("./assets/spawn_orb.png"),
  SpawnOrb1: new ex.ImageSource("./assets/spawn_orb1.png"),
  SpawnOrb2: new ex.ImageSource("./assets/spawn_orb2.png"),
  SpawnOrb3: new ex.ImageSource("./assets/spawn_orb3.png"),
  SpawnOrb4: new ex.ImageSource("./assets/spawn_orb4.png"),
  SpawnOrb5: new ex.ImageSource("./assets/spawn_orb5.png"),
  SpawnOrb6: new ex.ImageSource("./assets/spawn_orb6.png"),
  SpawnOrb7: new ex.ImageSource("./assets/spawn_orb7.png"),
  SpawnOrb8: new ex.ImageSource("./assets/spawn_orb8.png"),
  Stone: new ex.ImageSource("./assets/stone.png"),
  ThoughtBubbleSleep: new ex.ImageSource("./assets/thought_bubble_sleep.png"),
  WhiteWool: new ex.ImageSource("./assets/white_wool.png"),
  WoodSword: new ex.ImageSource("./assets/wood_sword.png"),
} as const;
