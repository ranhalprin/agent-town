import * as Phaser from "phaser";
import { Player } from "../entities/Player";
import {
  SPRITE_KEY,
  SPRITE_PATH,
  FRAME_WIDTH,
  FRAME_HEIGHT,
  SHEET_COLUMNS,
} from "../config/animations";

export class OfficeScene extends Phaser.Scene {
  private player!: Player;

  constructor() {
    super({ key: "OfficeScene" });
  }

  preload() {
    this.load.tilemapTiledJSON("office", "/maps/office.json");
    this.load.image("room_builder", "/tilesets/Room_Builder_Office_48x48.png");
    this.load.image("modern_office", "/tilesets/Modern_Office_48x48.png");
    // Load as plain image; frames are defined manually in create()
    // because the sheet has a 48px preview row before the 48×96 frames.
    this.load.image(SPRITE_KEY, SPRITE_PATH);
  }

  create() {
    // Build 48×96 spritesheet frames from the character texture
    const tex = this.textures.get(SPRITE_KEY);
    const rows = Math.floor(tex.source[0].height / FRAME_HEIGHT);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < SHEET_COLUMNS; col++) {
        tex.add(
          row * SHEET_COLUMNS + col,
          0,
          col * FRAME_WIDTH,
          row * FRAME_HEIGHT,
          FRAME_WIDTH,
          FRAME_HEIGHT
        );
      }
    }

    const map = this.make.tilemap({ key: "office" });

    const roomTileset = map.addTilesetImage("room_builder", "room_builder")!;
    const officeTileset = map.addTilesetImage(
      "modern_office",
      "modern_office"
    )!;
    const allTilesets = [roomTileset, officeTileset];

    // Tile layers — rendered bottom to top
    map.createLayer("floor", allTilesets)!;
    map.createLayer("walls", allTilesets)!;
    map.createLayer("ground", allTilesets)!;
    map.createLayer("furniture", allTilesets)!;
    map.createLayer("objects", allTilesets)!;

    // Object layer with freely-placed tile objects
    this.renderTileObjectLayer(map, "desktop", allTilesets, 5);

    // Overhead layer — rendered above player
    const overheadLayer = map.createLayer("overhead", allTilesets)!;
    overheadLayer.setDepth(10);

    // --- Collisions from object layer ---
    const collisionGroup = this.physics.add.staticGroup();
    const collisionLayer = map.getObjectLayer("collisions");
    if (collisionLayer) {
      for (const obj of collisionLayer.objects) {
        const x = obj.x! + obj.width! / 2;
        const y = obj.y! + obj.height! / 2;
        const rect = collisionGroup.create(x, y, undefined, undefined, false) as Phaser.Physics.Arcade.Sprite;
        rect.body!.setSize(obj.width!, obj.height!);
        rect.setVisible(false);
        rect.setActive(true);
        (rect.body as Phaser.Physics.Arcade.StaticBody).enable = true;
      }
    }

    // --- Spawn point ---
    const spawnsLayer = map.getObjectLayer("spawns");
    let spawnX = map.widthInPixels / 2;
    let spawnY = map.heightInPixels / 2;
    if (spawnsLayer && spawnsLayer.objects.length > 0) {
      spawnX = spawnsLayer.objects[0].x!;
      spawnY = spawnsLayer.objects[0].y!;
    }

    // --- Player ---
    this.player = new Player(this, spawnX, spawnY);
    this.physics.add.collider(this.player.sprite, collisionGroup);

    // World bounds
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.player.sprite.setCollideWorldBounds(true);

    // --- Camera ---
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setBackgroundColor("#1a1a2e");
    cam.startFollow(this.player.sprite, true, 0.1, 0.1);

    // Scroll to zoom (keep from original)
    this.input.on(
      "wheel",
      (_p: Phaser.Input.Pointer, _gx: number[], _gy: number, _gz: number, dy: number) => {
        const newZoom = Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.5, 2);
        cam.setZoom(newZoom);
      }
    );
  }

  private renderTileObjectLayer(
    map: Phaser.Tilemaps.Tilemap,
    layerName: string,
    tilesets: Phaser.Tilemaps.Tileset[],
    depth: number
  ) {
    const objectLayer = map.getObjectLayer(layerName);
    if (!objectLayer) return;

    for (const obj of objectLayer.objects) {
      if (!obj.gid) continue;

      // Find which tileset this gid belongs to
      let tileset: Phaser.Tilemaps.Tileset | null = null;
      for (let i = tilesets.length - 1; i >= 0; i--) {
        if (obj.gid >= tilesets[i].firstgid) {
          tileset = tilesets[i];
          break;
        }
      }
      if (!tileset) continue;

      const localId = obj.gid - tileset.firstgid;
      const cols = tileset.columns;
      const tileW = tileset.tileWidth;
      const tileH = tileset.tileHeight;
      const srcX = (localId % cols) * tileW;
      const srcY = Math.floor(localId / cols) * tileH;

      // Create a texture frame and render as image
      const frameKey = `${tileset.name}_${localId}`;
      if (!this.textures.exists(frameKey)) {
        const baseTexture = this.textures.get(tileset.name);
        baseTexture.add(localId, 0, srcX, srcY, tileW, tileH);
      }

      this.add
        .image(obj.x!, obj.y! - tileH, tileset.name, localId)
        .setOrigin(0, 0)
        .setDepth(depth);
    }
  }

  update() {
    this.player.update();
  }
}
