import * as Phaser from "phaser";
import { Player } from "../entities/Player";
import { Worker } from "../entities/Worker";
import {
  SPRITE_KEY,
  SPRITE_PATH,
  FRAME_WIDTH,
  FRAME_HEIGHT,
  SHEET_COLUMNS,
  WORKER_SPRITES,
  type Direction,
} from "../config/animations";
import { gameEvents } from "@/lib/events";

// Tight interaction radius so terminal only activates at chair notch.
const INTERACT_DISTANCE = 34;

interface SeatDef {
  x: number;
  y: number;
  facing: Direction;
}

export class OfficeScene extends Phaser.Scene {
  private player!: Player;
  private terminalZone: { x: number; y: number } | null = null;
  private promptText: Phaser.GameObjects.Text | null = null;
  private eKey!: Phaser.Input.Keyboard.Key;
  private terminalOpen = false;

  /** All worker agents sitting at desks */
  private workers: Worker[] = [];
  /** runId → Worker mapping for active tasks */
  private runWorkerMap = new Map<string, Worker>();

  constructor() {
    super({ key: "OfficeScene" });
  }

  preload() {
    this.load.tilemapTiledJSON("office", "/maps/office.json");
    this.load.image("room_builder", "/tilesets/Room_Builder_Office_48x48.png");
    this.load.image("modern_office", "/tilesets/Modern_Office_48x48.png");
    this.load.image(SPRITE_KEY, SPRITE_PATH);

    for (const ws of WORKER_SPRITES) {
      this.load.image(ws.key, ws.path);
    }
  }

  create() {
    this.buildSpriteFrames(SPRITE_KEY);
    for (const ws of WORKER_SPRITES) {
      this.buildSpriteFrames(ws.key);
    }

    const map = this.make.tilemap({ key: "office" });

    const roomTileset = map.addTilesetImage("room_builder", "room_builder")!;
    const officeTileset = map.addTilesetImage("modern_office", "modern_office")!;
    const allTilesets = [roomTileset, officeTileset];

    map.createLayer("floor", allTilesets)!;
    map.createLayer("walls", allTilesets)!;
    map.createLayer("ground", allTilesets)!;
    map.createLayer("furniture", allTilesets)!;
    map.createLayer("objects", allTilesets)!;

    this.renderTileObjectLayer(map, "desktop", allTilesets, 5);

    const overheadLayer = map.createLayer("overhead", allTilesets)!;
    overheadLayer.setDepth(10);

    // Collisions
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

    // Read spawn points from Tiled map
    const { bossSpawn, workerSpawns } = this.parseSpawns(map);

    // Player (boss)
    this.player = new Player(this, bossSpawn.x, bossSpawn.y);
    this.physics.add.collider(this.player.sprite, collisionGroup);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.player.sprite.setCollideWorldBounds(true);

    // Camera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setBackgroundColor("#1a1a2e");
    cam.startFollow(this.player.sprite, true, 0.1, 0.1);

    this.input.on(
      "wheel",
      (_p: Phaser.Input.Pointer, _gx: number[], _gy: number, _gz: number, dy: number) => {
        cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.5, 2));
      }
    );

    // Boss seat terminal interaction (near boss spawn)
    this.initBossSeat(bossSpawn);

    // Worker seats (from spawn points)
    this.initWorkers(workerSpawns);

    // Game events
    this.initGameEvents();
  }

  // ── Spawns ───────────────────────────────────────────────

  private parseSpawns(map: Phaser.Tilemaps.Tilemap) {
    const spawnsLayer = map.getObjectLayer("spawns");
    const fallback = { x: map.widthInPixels / 2, y: map.heightInPixels / 2 };

    if (!spawnsLayer || spawnsLayer.objects.length === 0) {
      return { bossSpawn: fallback, workerSpawns: [] as SeatDef[] };
    }

    const getFacing = (obj: Phaser.Types.Tilemaps.TiledObject): Direction => {
      const props = obj.properties as Array<{ name: string; value: string }> | undefined;
      const fp = props?.find((p) => p.name === "facing");
      return (fp?.value as Direction) ?? "down";
    };

    // Boss = object named "boss"; fallback to rightmost
    let bossObj = spawnsLayer.objects.find((o) => o.name === "boss");
    if (!bossObj) {
      const sorted = [...spawnsLayer.objects].sort((a, b) => a.x! - b.x!);
      bossObj = sorted.pop()!;
    }

    const bossSpawn = { x: bossObj.x!, y: bossObj.y! };

    const workerSpawns: SeatDef[] = spawnsLayer.objects
      .filter((obj) => obj !== bossObj)
      .map((obj) => ({
        x: obj.x!,
        y: obj.y!,
        facing: getFacing(obj),
      }));

    return { bossSpawn, workerSpawns };
  }

  // ── Workers ──────────────────────────────────────────────

  private initWorkers(seats: SeatDef[]) {
    const available = WORKER_SPRITES.slice(0, seats.length);

    for (let i = 0; i < available.length; i++) {
      const seat = seats[i];
      const cfg = available[i];
      const facing: Direction = cfg.label === "Eve" ? "right" : seat.facing;
      const worker = new Worker(
        this,
        seat.x,
        seat.y,
        cfg.key,
        `seat-${i}`,
        cfg.label,
        facing,
      );
      this.workers.push(worker);
    }
  }

  // ── Game events bridge (React store → Phaser) ──────────

  private initGameEvents() {
    gameEvents.on("task-assigned", (runId: unknown, message: unknown) => {
      const worker = this.findIdleWorker();
      if (!worker) return;
      worker.assignTask(runId as string, message as string);
      this.runWorkerMap.set(runId as string, worker);
    });

    gameEvents.on("task-bubble", (runId: unknown, text: unknown, ttl: unknown) => {
      const worker = this.runWorkerMap.get(runId as string);
      if (worker) worker.showBubble(text as string, (ttl as number) ?? 5000);
    });

    gameEvents.on("task-completed", (runId: unknown) => {
      const worker = this.runWorkerMap.get(runId as string);
      if (worker) {
        worker.completeTask();
        this.runWorkerMap.delete(runId as string);
      }
    });

    gameEvents.on("task-failed", (runId: unknown) => {
      const worker = this.runWorkerMap.get(runId as string);
      if (worker) {
        worker.failTask();
        this.runWorkerMap.delete(runId as string);
      }
    });

    gameEvents.on("subagent-assigned", (runId: unknown, parentRunId: unknown, label: unknown) => {
      const worker = this.findIdleWorker();
      if (!worker) return;
      worker.assignTask(runId as string, `[Sub] ${label as string}`);
      this.runWorkerMap.set(runId as string, worker);
    });

    gameEvents.on("terminal-closed", () => {
      this.terminalOpen = false;
    });
  }

  private findIdleWorker(): Worker | null {
    const idle = this.workers.filter((w) => w.status === "idle");
    if (idle.length === 0) return null;
    return idle[Math.floor(Math.random() * idle.length)];
  }

  // ── Boss seat ──────────────────────────────────────────

  private initBossSeat(bossSpawn: { x: number; y: number }) {
    this.terminalZone = { x: bossSpawn.x, y: bossSpawn.y };

    this.promptText = this.add
      .text(bossSpawn.x + 40, bossSpawn.y - 16, "Press E", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#facc15",
        backgroundColor: "rgba(0,0,0,0.8)",
        padding: { x: 6, y: 4 },
        align: "center",
      })
      .setOrigin(0, 0.5)
      .setDepth(20)
      .setVisible(false);

    this.eKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  }

  // ── Tile object layer rendering ────────────────────────

  private buildSpriteFrames(key: string) {
    const tex = this.textures.get(key);
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

  // ── Update ─────────────────────────────────────────────

  update() {
    if (this.terminalOpen) return;

    this.player.update();

    if (this.terminalZone && this.promptText) {
      const dist = Phaser.Math.Distance.Between(
        this.player.sprite.x,
        this.player.sprite.y,
        this.terminalZone.x,
        this.terminalZone.y
      );
      const near = dist < INTERACT_DISTANCE;
      this.promptText.setVisible(near);

      if (near && Phaser.Input.Keyboard.JustDown(this.eKey)) {
        this.terminalOpen = true;
        this.promptText.setVisible(false);
        gameEvents.emit("open-terminal");
      }
    }
  }
}
