---
name: excalibur-objects
description: Lists practical Excalibur object types and when to use them. Use when choosing Excalibur objects, asking what Excalibur objects exist, or deciding which engine type should represent gameplay, graphics, physics, input, assets, or scenes.
---

# Excalibur Objects

Use this as the practical Excalibur object map. It lists the main game-building objects, not every internal engine export.

## Core Game Objects

- `Engine`: The game runtime; owns the canvas, loop, input, scenes, and rendering.
- `Scene`: A level, screen, menu, or game state container. Only one scene is active at a time.
- `Actor`: The main visible/updatable object. Use for players, enemies, platforms, bullets, pickups, triggers, and similar world objects.
- `Entity`: Lower-level ECS object. Use when custom component/system behavior is needed without Actor defaults.
- `Component`: Data or behavior attached to an entity.
- `System`: Logic that runs over entities matching certain components.
- `Camera`: Controls the visible part of a scene, including follow, zoom, bounds, shake, and movement.
- `Timer`: Runs logic after a delay or on an interval.
- `Clock`: Drives game loop timing.

## Actor-Like Objects

- `Actor`: General world object with transform, motion, graphics, and collision support.
- `ScreenElement`: UI-style actor that stays in screen coordinates instead of world coordinates.
- `Trigger`: Invisible collision/sensor-style actor for detecting entry and exit areas.
- `ParticleEmitter`: Emits particles for effects like smoke, sparks, fire, or explosions.
- `TileMap`: Grid-based map made of tiles, useful for levels and collision surfaces.

## Built-In Actor Components

- `TransformComponent`: Position, rotation, scale, and z-index.
- `MotionComponent`: Velocity, acceleration, and angular velocity.
- `GraphicsComponent`: Current graphic, opacity, materials, and drawing behavior.
- `ColliderComponent`: Collision shape attached to an entity.
- `BodyComponent`: Physics data like mass, friction, bounciness, collision type, and collision group.
- `PointerComponent`: Pointer, mouse, and touch interaction support.
- `ActionsComponent`: Actor action queue for movement, fades, delays, repeats, and similar scripted behavior.

## Graphics Objects

- `Graphic`: Base drawable object.
- `Sprite`: A drawable image region.
- `Animation`: A sequence of sprites over time.
- `SpriteSheet`: Splits an image into reusable sprites.
- `ImageSource`: Loaded image asset; usually converted into a `Sprite`.
- `Canvas`: Custom canvas drawing as an Excalibur graphic.
- `Rectangle`: Drawable rectangle graphic.
- `Circle`: Drawable circle graphic.
- `Polygon`: Drawable polygon graphic.
- `Line`: Drawable line graphic.
- `Text`: Drawable text graphic.
- `Font`: Font settings for text.
- `SpriteFont`: Pixel/image-based font.
- `GraphicsGroup`: Groups multiple graphics together.
- `Material`: Shader material applied to graphics.

## Physics and Collision Objects

- `Collider`: Collision geometry wrapper.
- `Shape`: Base idea for collision shapes.
- `CircleCollider`: Circular collision shape.
- `PolygonCollider`: Polygon collision shape.
- `EdgeCollider`: Line or edge collision shape.
- `CompositeCollider`: Multiple colliders treated as one.
- `BoundingBox`: Axis-aligned bounds used for collision, camera limits, and spatial checks.
- `CollisionGroup`: Defines which groups can collide.
- `CollisionType`: Controls collision behavior: active, fixed, passive, or prevent collision.
- `Ray`: Used for raycasting queries.
- `Contact`: Collision contact information.

## Input Objects

- `Keyboard`: Keyboard input state.
- `Pointers`: Mouse, touch, and pointer input manager.
- `Pointer`: A specific pointer interaction.
- `Gamepads`: Gamepad input manager.
- `Gamepad`: A specific controller.
- `Buttons`: Gamepad button identifiers.
- `Keys`: Keyboard key identifiers.

## Assets and Loading

- `DefaultLoader`: Standard loading screen and asset loader.
- `Loader`: Base loading interface.
- `ImageSource`: Image asset.
- `Sound`: Audio asset.
- `Resource`: Generic loadable resource.
- `FontSource`: Loadable font asset.

## Math and Utility Objects

- `Vector`: 2D position, velocity, direction, or size.
- `Color`: RGBA color.
- `Matrix`: Transform math.
- `LineSegment`: Segment math for geometry checks.
- `Random`: Random number utility.
- `EasingFunctions`: Curves for camera movement, actions, and transitions.

## Scene and Visual Flow

- `Transition`: Scene transition behavior.
- `FadeInOut`: Fade transition between scenes.
- `CrossFade`: Cross-fade transition between scenes.
- `DisplayMode`: How the canvas scales or fits the screen.
- `Screen`: Handles resolution, viewport, pixel ratio, and coordinate conversion.
