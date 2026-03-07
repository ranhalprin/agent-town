import * as Phaser from "phaser";
import { Player } from "../entities/Player";
import { Worker, type POI } from "../entities/Worker";
import { InteractionMenu, type MenuOption } from "../entities/InteractionMenu";
import {
  SPRITE_KEY,
  SPRITE_PATH,
  FRAME_WIDTH,
  FRAME_HEIGHT,
  SHEET_COLUMNS,
  WORKER_SPRITES,
  type Direction,
} from "../config/animations";
import {
  EMOTE_SHEET_KEY,
  EMOTE_SHEET_PATH,
  EMOTE_FRAME_SIZE,
  EMOTE_COLS,
} from "../config/emotes";
import { Pathfinder } from "../utils/Pathfinder";
import { gameEvents } from "@/lib/events";
import type { SeatState } from "@/types/game";

const INTERACT_DISTANCE = 48;
const BOSS_INTERACT_DISTANCE = 34;

interface SeatDef {
  seatId: string;
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
  private gameEventUnsubs: Array<() => void> = [];

  private workers: Worker[] = [];
  private runWorkerMap = new Map<string, Worker>();
  private seatDefs: SeatDef[] = [];
  private collisionGroup!: Phaser.Physics.Arcade.StaticGroup;
  private pathfinder!: Pathfinder;
  private pois: POI[] = [];

  /** Interaction system */
  private interactionMenu!: InteractionMenu;
  private nearestWorker: Worker | null = null;
  private workerPromptText: Phaser.GameObjects.Text | null = null;
  private menuOpen = false;

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

    this.load.spritesheet(EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, {
      frameWidth: EMOTE_FRAME_SIZE,
      frameHeight: EMOTE_FRAME_SIZE,
    });
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

    this.collisionGroup = this.physics.add.staticGroup();
    const collisionLayer = map.getObjectLayer("collisions");
    const collisionRects: { x: number; y: number; width: number; height: number }[] = [];
    if (collisionLayer) {
      for (const obj of collisionLayer.objects) {
        const x = obj.x! + obj.width! / 2;
        const y = obj.y! + obj.height! / 2;
        const rect = this.collisionGroup.create(x, y, undefined, undefined, false) as Phaser.Physics.Arcade.Sprite;
        rect.body!.setSize(obj.width!, obj.height!);
        rect.setVisible(false);
        rect.setActive(true);
        (rect.body as Phaser.Physics.Arcade.StaticBody).enable = true;

        collisionRects.push({ x: obj.x!, y: obj.y!, width: obj.width!, height: obj.height! });
      }
    }

    // Derive room boundaries from collision layer (walls) and block
    // all exterior area so workers never path outside the room.
    let wallMinX = Infinity, wallMinY = Infinity, wallMaxX = 0, wallMaxY = 0;
    for (const r of collisionRects) {
      wallMinX = Math.min(wallMinX, r.x);
      wallMinY = Math.min(wallMinY, r.y);
      wallMaxX = Math.max(wallMaxX, r.x + r.width);
      wallMaxY = Math.max(wallMaxY, r.y + r.height);
    }
    const mapW = map.widthInPixels;
    const mapH = map.heightInPixels;
    if (wallMinX > 0)    collisionRects.push({ x: 0, y: 0, width: wallMinX, height: mapH });
    if (wallMinY > 0)    collisionRects.push({ x: 0, y: 0, width: mapW, height: wallMinY });
    if (wallMaxX < mapW)  collisionRects.push({ x: wallMaxX, y: 0, width: mapW - wallMaxX, height: mapH });
    if (wallMaxY < mapH)  collisionRects.push({ x: 0, y: wallMaxY, width: mapW, height: mapH - wallMaxY });

    this.pathfinder = new Pathfinder(map.widthInPixels, map.heightInPixels, collisionRects, 8);

    const { bossSpawn, workerSpawns } = this.parseSpawns(map);
    this.seatDefs = workerSpawns;

    this.player = new Player(this, bossSpawn.x, bossSpawn.y);
    this.physics.add.collider(this.player.sprite, this.collisionGroup);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.player.sprite.setCollideWorldBounds(true);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    cam.setBackgroundColor("#1a1a2e");
    cam.startFollow(this.player.sprite, true, 0.1, 0.1);

    this.input.on(
      "wheel",
      (_p: Phaser.Input.Pointer, _gx: number[], _gy: number, _gz: number, dy: number) => {
        cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.5, 2));
      },
    );

    this.initCameraDrag(cam);

    this.parsePOIs(map);
    this.initBossSeat(bossSpawn);
    this.initInteractionUI();
    this.initGameEvents();
    gameEvents.emit("seats-discovered", workerSpawns);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupGameEvents());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanupGameEvents());
  }

  // ── Camera drag ─────────────────────────────────────────

  private cameraDragging = false;
  private cameraFollowing = true;

  private initCameraDrag(cam: Phaser.Cameras.Scene2D.Camera) {
    let dragStartX = 0;
    let dragStartY = 0;

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.cameraDragging = true;
        dragStartX = pointer.worldX;
        dragStartY = pointer.worldY;
      }
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.cameraDragging || !pointer.leftButtonDown()) return;

      const dx = dragStartX - pointer.worldX;
      const dy = dragStartY - pointer.worldY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        if (this.cameraFollowing) {
          cam.stopFollow();
          this.cameraFollowing = false;
        }
        cam.scrollX += dx;
        cam.scrollY += dy;
      }
    });

    this.input.on("pointerup", () => {
      this.cameraDragging = false;
    });
  }

  private resumeCameraFollow() {
    if (!this.cameraFollowing) {
      this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
      this.cameraFollowing = true;
    }
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

    let bossObj = spawnsLayer.objects.find((o) => o.name === "boss");
    if (!bossObj) {
      const sorted = [...spawnsLayer.objects].sort((a, b) => a.x! - b.x!);
      bossObj = sorted.pop()!;
    }

    const bossSpawn = { x: bossObj.x!, y: bossObj.y! };

    const workerSpawns: SeatDef[] = spawnsLayer.objects
      .filter((obj) => obj !== bossObj)
      .map((obj, index) => ({
        seatId: obj.name && obj.name !== "boss" ? obj.name : `seat-${index}`,
        x: obj.x!,
        y: obj.y!,
        facing: getFacing(obj),
      }));

    return { bossSpawn, workerSpawns };
  }

  // ── Points of Interest ────────────────────────────────────

  private parsePOIs(map: Phaser.Tilemaps.Tilemap) {
    const layer = map.getObjectLayer("pois");
    if (!layer) return;

    for (const obj of layer.objects) {
      if (obj.name && typeof obj.x === "number" && typeof obj.y === "number") {
        this.pois.push({ name: obj.name, x: obj.x, y: obj.y });
      }
    }
  }

  // ── Workers ──────────────────────────────────────────────

  private spawnWorker(seatDef: SeatDef, seat: SeatState) {
    if (!seat.spriteKey) return null;
    const initialFacing: Direction = seat.spriteKey === "character_06" ? "right" : seatDef.facing;
    const worker = new Worker(
      this,
      seatDef.x,
      seatDef.y,
      seat.spriteKey,
      seatDef.seatId,
      seat.label,
      initialFacing,
    );
    worker.setPOIs(this.pois);
    worker.setPathfinder(this.pathfinder);
    worker.sprite.setCollideWorldBounds(true);
    return worker;
  }

  private syncWorkers(seats: SeatState[]) {
    const nextBySeatId = new Map(
      seats
        .filter((seat) => seat.assigned && seat.spriteKey)
        .map((seat) => [seat.seatId, seat]),
    );
    const existingBySeatId = new Map(this.workers.map((worker) => [worker.seatId, worker]));
    const nextWorkers: Worker[] = [];

    for (const seatDef of this.seatDefs) {
      const seat = nextBySeatId.get(seatDef.seatId);
      const existing = existingBySeatId.get(seatDef.seatId);

      if (!seat) {
        if (existing) {
          if (existing.assignedRunId) this.runWorkerMap.delete(existing.assignedRunId);
          if (this.nearestWorker === existing) this.nearestWorker = null;
          existing.destroy();
          existingBySeatId.delete(seatDef.seatId);
        }
        continue;
      }

      const needsRecreate =
        !existing ||
        existing.spriteKey !== seat.spriteKey ||
        existing.label !== seat.label;

      if (needsRecreate) {
        if (existing) {
          if (existing.assignedRunId) this.runWorkerMap.delete(existing.assignedRunId);
          if (this.nearestWorker === existing) this.nearestWorker = null;
          existing.destroy();
          existingBySeatId.delete(seatDef.seatId);
        }
        const created = this.spawnWorker(seatDef, seat);
        if (created) nextWorkers.push(created);
        continue;
      }

      nextWorkers.push(existing);
      existingBySeatId.delete(seatDef.seatId);
    }

    for (const stale of existingBySeatId.values()) {
      if (stale.assignedRunId) this.runWorkerMap.delete(stale.assignedRunId);
      if (this.nearestWorker === stale) this.nearestWorker = null;
      stale.destroy();
    }

    this.workers = nextWorkers;
  }

  // ── Interaction UI ───────────────────────────────────────

  private initInteractionUI() {
    this.workerPromptText = this.add
      .text(0, 0, "Press E", {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "8px",
        color: "#facc15",
        backgroundColor: "rgba(0,0,0,0.8)",
        padding: { x: 6, y: 4 },
        align: "center",
      })
      .setOrigin(0.5, 1)
      .setDepth(25)
      .setVisible(false);

    this.interactionMenu = new InteractionMenu(this);
    this.interactionMenu.onClose = () => {
      this.menuOpen = false;
    };
  }

  private findNearestWorker(): Worker | null {
    let nearest: Worker | null = null;
    let minDist = Infinity;

    for (const worker of this.workers) {
      const dist = Phaser.Math.Distance.Between(
        this.player.sprite.x, this.player.sprite.y,
        worker.sprite.x, worker.sprite.y,
      );
      if (dist < INTERACT_DISTANCE && dist < minDist) {
        minDist = dist;
        nearest = worker;
      }
    }
    return nearest;
  }

  private openWorkerMenu(worker: Worker) {
    this.menuOpen = true;

    const isWorking = worker.status === "working";
    const isIdle = worker.status === "idle" || worker.status === "done";

    const options: MenuOption[] = [
      {
        label: "Assign Task",
        enabled: true,
        action: () => {
          this.menuOpen = false;
          if (isIdle) {
            gameEvents.emit("open-terminal", worker.seatId);
          } else {
            gameEvents.emit("open-terminal-queue", worker.seatId);
          }
        },
      },
      {
        label: "Stop Task",
        enabled: isWorking,
        action: () => {
          this.menuOpen = false;
          if (worker.assignedRunId) {
            gameEvents.emit("stop-task", worker.assignedRunId, worker.seatId);
          }
        },
      },
      {
        label: "Cancel",
        enabled: true,
        action: () => {
          this.menuOpen = false;
        },
      },
    ];

    if (worker.taskQueue.length > 0) {
      options.splice(2, 0, {
        label: `Queue (${worker.taskQueue.length})`,
        enabled: false,
        action: () => {},
      });
    }

    this.interactionMenu.show(worker.sprite.x, worker.sprite.y, options);
  }

  // ── Game events bridge ─────────────────────────────────

  private initGameEvents() {
    this.cleanupGameEvents();

    this.gameEventUnsubs.push(gameEvents.on("seat-configs-updated", (seats: unknown) => {
      if (!Array.isArray(seats)) return;
      this.syncWorkers(seats as SeatState[]);
    }));

    this.gameEventUnsubs.push(gameEvents.on("task-assigned", (runId: unknown, message: unknown, seatId: unknown) => {
      const targetSeatId = typeof seatId === "string" ? seatId : undefined;
      const worker = this.findWorkerBySeatId(targetSeatId) ?? this.findIdleWorker();
      if (!worker) return;
      if (targetSeatId && worker.status === "working" && worker.assignedRunId) {
        worker.enqueueTask(runId as string, message as string);
        return;
      }
      worker.assignTask(runId as string, message as string);
      this.runWorkerMap.set(runId as string, worker);
    }));

    this.gameEventUnsubs.push(gameEvents.on("task-bubble", (runId: unknown, text: unknown, ttl: unknown) => {
      const worker = this.runWorkerMap.get(runId as string);
      if (worker) worker.showBubble(text as string, (ttl as number) ?? 5000);
    }));

    this.gameEventUnsubs.push(gameEvents.on("task-completed", (runId: unknown) => {
      const worker = this.runWorkerMap.get(runId as string);
      if (worker) {
        worker.completeTask();
        this.runWorkerMap.delete(runId as string);
      }
    }));

    this.gameEventUnsubs.push(gameEvents.on("task-failed", (runId: unknown) => {
      const worker = this.runWorkerMap.get(runId as string);
      if (worker) {
        worker.failTask();
        this.runWorkerMap.delete(runId as string);
      }
    }));

    this.gameEventUnsubs.push(gameEvents.on("subagent-assigned", (runId: unknown, _parentRunId: unknown, label: unknown) => {
      const worker = this.findIdleWorker();
      if (!worker) return;
      worker.assignTask(runId as string, `[Sub] ${label as string}`);
      this.runWorkerMap.set(runId as string, worker);
    }));

    this.gameEventUnsubs.push(gameEvents.on("terminal-closed", () => {
      this.terminalOpen = false;
    }));
  }

  private cleanupGameEvents() {
    for (const unsub of this.gameEventUnsubs) unsub();
    this.gameEventUnsubs = [];
  }

  private findWorkerBySeatId(seatId?: string): Worker | null {
    if (!seatId) return null;
    return this.workers.find((worker) => worker.seatId === seatId) ?? null;
  }

  private findIdleWorker(): Worker | null {
    return this.workers.find((worker) => worker.status === "idle") ?? null;
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
      .setOrigin(0, 0)
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
          FRAME_HEIGHT,
        );
      }
    }
  }

  private renderTileObjectLayer(
    map: Phaser.Tilemaps.Tilemap,
    layerName: string,
    tilesets: Phaser.Tilemaps.Tileset[],
    depth: number,
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
      const tileW = tileset.tileWidth;
      const tileH = tileset.tileHeight;
      const srcX = (localId % tileset.columns) * tileW;
      const srcY = Math.floor(localId / tileset.columns) * tileH;

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
    // Update interaction menu even when it's open
    if (this.interactionMenu.visible) {
      this.interactionMenu.update();
      for (const worker of this.workers) worker.update();
      return;
    }

    if (this.terminalOpen) {
      for (const worker of this.workers) worker.update();
      return;
    }

    this.player.update();
    if (!this.cameraFollowing && this.player.isMoving()) {
      this.resumeCameraFollow();
    }
    for (const worker of this.workers) worker.update();

    // Worker proximity detection
    const nearest = this.findNearestWorker();

    if (nearest !== this.nearestWorker) {
      if (this.nearestWorker) this.nearestWorker.resume();
      this.nearestWorker = nearest;
    }

    if (this.workerPromptText) {
      if (nearest) {
        nearest.pause();
        this.workerPromptText.setPosition(
          nearest.sprite.x,
          nearest.sprite.y - FRAME_HEIGHT * 0.5,
        );
        this.workerPromptText.setVisible(true);
      } else {
        this.workerPromptText.setVisible(false);
      }
    }

    // E key: worker menu takes priority over boss terminal
    if (nearest && Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.openWorkerMenu(nearest);
      if (this.workerPromptText) this.workerPromptText.setVisible(false);
      return;
    }

    // Boss terminal interaction (only when no worker is nearby)
    if (!nearest && this.terminalZone && this.promptText) {
      const dist = Phaser.Math.Distance.Between(
        this.player.sprite.x, this.player.sprite.y,
        this.terminalZone.x, this.terminalZone.y,
      );
      const near = dist < BOSS_INTERACT_DISTANCE;
      this.promptText.setVisible(near);

      if (near && Phaser.Input.Keyboard.JustDown(this.eKey)) {
        this.terminalOpen = true;
        this.promptText.setVisible(false);
        gameEvents.emit("open-terminal");
      }
    } else if (this.promptText) {
      this.promptText.setVisible(false);
    }
  }
}
