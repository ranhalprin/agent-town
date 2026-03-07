import * as Phaser from "phaser";
import {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  MOVE_SPEED,
  makeAnims,
  type Direction,
} from "../config/animations";
import {
  EMOTE_SHEET_KEY,
  EMOTE_ANIMS,
} from "../config/emotes";
import { ChatBubble } from "./ChatBubble";
import { Pathfinder, type PathPoint } from "../utils/Pathfinder";
import { buildSpriteFrames, type POIDef } from "../utils/MapHelpers";
import {
  WANDER_MIN_DELAY,
  WANDER_MAX_DELAY,
  WANDER_STAGGER_MS,
  WANDER_INITIAL_MIN,
  WANDER_INITIAL_MAX,
  TASK_RESULT_HOLD_MS,
  TASK_BUBBLE_MS,
  TASK_THINK_DELAY_MS,
  ARRIVE_THRESHOLD,
  WORKER_SPEED_FACTOR,
  STUCK_FRAME_LIMIT,
  STUCK_MOVE_THRESHOLD,
  POI_WANDER_CHANCE,
  POI_STAY_MIN,
  POI_STAY_MAX,
  STAGGER_EXTRA_MIN,
  STAGGER_EXTRA_MAX,
  EMOTE_Y_OFFSET,
  BUBBLE_Y_OFFSET,
  BODY_SIZE_RATIO_W,
  BODY_SIZE_RATIO_H,
  BODY_OFFSET_RATIO_X,
  BODY_OFFSET_RATIO_Y,
  SEAT_ACTIVITIES,
  POI_BUBBLE_TEXTS,
} from "@/lib/constants";

export type WorkerStatus = "idle" | "working" | "done" | "failed";

export type POI = POIDef;

type QueuedTask = {
  runId: string;
  message: string;
  onReady?: () => void;
};

const WORKER_SPEED = MOVE_SPEED * WORKER_SPEED_FACTOR;
const BODY_WIDTH = FRAME_WIDTH * BODY_SIZE_RATIO_W;
const BODY_HEIGHT = FRAME_HEIGHT * BODY_SIZE_RATIO_H;
const BODY_OFFSET_X = FRAME_WIDTH * BODY_OFFSET_RATIO_X;
const BODY_OFFSET_Y = FRAME_HEIGHT * BODY_OFFSET_RATIO_Y;
const HOME_NAV_OFFSET_X = BODY_OFFSET_X + BODY_WIDTH / 2 - FRAME_WIDTH / 2;
const HOME_NAV_OFFSET_Y = BODY_OFFSET_Y + BODY_HEIGHT / 2 - FRAME_HEIGHT / 2;

const wanderClock = { lastStartedAt: -Infinity };

export function resetWanderClock() {
  wanderClock.lastStartedAt = -Infinity;
}

export class Worker {

  sprite: Phaser.Physics.Arcade.Sprite;
  bubble: ChatBubble;
  readonly seatId: string;
  readonly label: string;
  readonly spriteKey: string;

  /** Spawn (home seat) position — worker returns here on task */
  readonly homeX: number;
  readonly homeY: number;

  private scene: Phaser.Scene;
  private _status: WorkerStatus = "idle";
  private facing: Direction;
  private readonly initialFacing: Direction;
  private nameTag: Phaser.GameObjects.Text;
  private statusDot: Phaser.GameObjects.Arc;

  /** Emote sprite shown above head */
  private emoteSprite: Phaser.GameObjects.Sprite | null = null;
  private currentEmoteKey: string | null = null;

  /** Movement / path-following */
  private moveTarget: { x: number; y: number } | null = null;
  private currentPath: PathPoint[] = [];
  private pathIndex = 0;
  private isReturningHome = false;
  private faceTarget: { x: number; y: number } | null = null;
  private arrivalFacing: Direction | null = null;
  private onArrival: (() => void) | null = null;
  private stuckFrames = 0;
  private lastX = 0;
  private lastY = 0;

  /** Wander system */
  private initTimer: Phaser.Time.TimerEvent | null = null;
  private wanderTimer: Phaser.Time.TimerEvent | null = null;
  private activityTimer: Phaser.Time.TimerEvent | null = null;
  private taskVisualTimer: Phaser.Time.TimerEvent | null = null;
  private canWander = true;
  private isWandering = false;
  private pois: POI[] = [];
  private pathfinder: Pathfinder | null = null;

  /** Task queue */
  taskQueue: QueuedTask[] = [];

  /** The runId currently assigned to this worker (null = idle) */
  assignedRunId: string | null = null;
  private interactionLocked = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    spriteKey: string,
    seatId: string,
    label: string,
    facing: Direction = "up",
  ) {
    this.scene = scene;
    this.seatId = seatId;
    this.label = label;
    this.spriteKey = spriteKey;
    this.facing = facing;
    this.initialFacing = facing;
    this.homeX = x;
    this.homeY = y;

    this.ensureAnims(scene, spriteKey);

    this.sprite = scene.physics.add.sprite(x, y, spriteKey, 0);
    this.sprite.setDepth(5);
    this.sprite.body!.setSize(BODY_WIDTH, BODY_HEIGHT);
    this.sprite.body!.setOffset(BODY_OFFSET_X, BODY_OFFSET_Y);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.allowGravity = false;
    body.pushable = false;
    body.mass = 999;

    this.sprite.anims.play(`${spriteKey}:idle-${facing}`);

    const nameY = y + FRAME_HEIGHT / 2 + 2;
    this.nameTag = scene.add
      .text(x, nameY, label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#e0e0e0",
        backgroundColor: "rgba(0,0,0,0.7)",
        padding: { x: 4, y: 2 },
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

    this.statusDot = scene.add.circle(
      x - this.nameTag.width / 2 - 6,
      nameY + 4,
      3,
      0x888888,
    );
    this.statusDot.setDepth(20);

    this.bubble = new ChatBubble(scene);
    this.initEmoteSprite();

    const initialDelay = Phaser.Math.Between(WANDER_INITIAL_MIN, WANDER_INITIAL_MAX);
    this.initTimer = scene.time.delayedCall(initialDelay, () => {
      this.initTimer = null;
      this.scheduleWander();
    });
  }

  // ── Emote system ──────────────────────────────────────

  private initEmoteSprite() {
    if (!this.scene.textures.exists(EMOTE_SHEET_KEY)) return;

    this.emoteSprite = this.scene.add.sprite(
      this.sprite.x,
      this.sprite.y - FRAME_HEIGHT * EMOTE_Y_OFFSET,
      EMOTE_SHEET_KEY,
      0,
    );
    this.emoteSprite.setDepth(22);
    this.emoteSprite.setVisible(false);

    this.registerEmoteAnims();
  }

  private registerEmoteAnims() {
    for (const def of EMOTE_ANIMS) {
      if (this.scene.anims.exists(def.key)) continue;
      const frames = def.frames.map((f) => ({ key: EMOTE_SHEET_KEY, frame: f }));
      this.scene.anims.create({
        key: def.key,
        frames,
        frameRate: def.frameRate,
        repeat: def.repeat,
      });
    }
  }

  showEmote(emoteKey: string) {
    if (!this.emoteSprite) return;
    if (this.currentEmoteKey === emoteKey) return;

    this.bubble.hide();
    this.emoteSprite.removeAllListeners("animationcomplete");

    this.currentEmoteKey = emoteKey;
    this.emoteSprite.setVisible(true);
    this.emoteSprite.play(emoteKey);

    const anim = EMOTE_ANIMS.find((a) => a.key === emoteKey);
    if (anim && anim.repeat >= 0) {
      this.emoteSprite.once("animationcomplete", () => {
        if (!this.emoteSprite) return;
        this.emoteSprite.setVisible(false);
        this.currentEmoteKey = null;
      });
    }
  }

  hideEmote() {
    if (!this.emoteSprite) return;
    this.emoteSprite.setVisible(false);
    this.emoteSprite.stop();
    this.currentEmoteKey = null;
  }

  // ── Animation registration ────────────────────────────

  private ensureAnims(scene: Phaser.Scene, spriteKey: string) {
    if (scene.anims.exists(`${spriteKey}:idle-down`)) return;

    buildSpriteFrames(scene, spriteKey);

    const idleAnims = makeAnims(spriteKey, "idle", 1, 8);
    const walkAnims = makeAnims(spriteKey, "walk", 2, 10);
    for (const anim of [...idleAnims, ...walkAnims]) {
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = anim.start; i <= anim.end; i++) {
        frames.push({ key: spriteKey, frame: i });
      }
      scene.anims.create({
        key: anim.key,
        frames,
        frameRate: anim.frameRate,
        repeat: anim.repeat,
      });
    }
  }

  // ── Status ────────────────────────────────────────────

  get status(): WorkerStatus {
    return this._status;
  }

  setStatus(status: WorkerStatus) {
    this._status = status;
    const colors: Record<WorkerStatus, number> = {
      idle: 0x888888,
      working: 0xfacc15,
      done: 0x22c55e,
      failed: 0xef4444,
    };
    this.statusDot.setFillStyle(colors[status]);

    if (status === "idle") {
      this.canWander = true;
      this.scheduleWander();
    } else if (status === "working") {
      this.stopIdleActivity();
      this.canWander = false;
    } else if (status === "done") {
      this.canWander = false;
    } else if (status === "failed") {
      this.canWander = false;
    }
  }

  // ── Task management ───────────────────────────────────

  assignTask(runId: string, taskMessage: string, onReady?: () => void) {
    this.stopIdleActivity();
    this.assignedRunId = runId;
    this.setStatus("working");

    const beginProcessing = () => {
      this.showBubble(`📋 ${taskMessage}`, TASK_BUBBLE_MS);
      onReady?.();
      if (this.taskVisualTimer) {
        this.taskVisualTimer.destroy();
        this.taskVisualTimer = null;
      }
      this.taskVisualTimer = this.scene.time.delayedCall(TASK_THINK_DELAY_MS, () => {
        if (this._status === "working") this.showEmote("emote:thinking");
        this.taskVisualTimer = null;
      });
    };

    const shouldReturnHomeFirst = this.moveTarget !== null || !this.isAtHomePose() || this.isWandering;
    if (shouldReturnHomeFirst) {
      this.interactionLocked = true;
      this.showBubble("Returning to desk...", TASK_BUBBLE_MS);
      this.onArrival = () => {
        this.interactionLocked = false;
        beginProcessing();
      };
      this.navigateHome();
      return;
    }

    beginProcessing();
  }

  completeTask() {
    if (this.taskVisualTimer) {
      this.taskVisualTimer.destroy();
      this.taskVisualTimer = null;
    }
    this.setStatus("done");

    this.taskVisualTimer = this.scene.time.delayedCall(TASK_RESULT_HOLD_MS, () => {
      if (this._status === "done") {
        this.setStatus("idle");
        this.assignedRunId = null;
        this.processQueue();
      }
      this.taskVisualTimer = null;
    });
  }

  failTask() {
    if (this.taskVisualTimer) {
      this.taskVisualTimer.destroy();
      this.taskVisualTimer = null;
    }
    this.setStatus("failed");
    this.showBubble("Task failed.", TASK_BUBBLE_MS);
    this.taskVisualTimer = this.scene.time.delayedCall(TASK_RESULT_HOLD_MS, () => {
      this.assignedRunId = null;
      this.setStatus("idle");
      this.processQueue();
      this.taskVisualTimer = null;
    });
  }

  enqueueTask(runId: string, message: string, onReady?: () => void) {
    this.taskQueue.push({ runId, message, onReady });
    const queueSize = this.taskQueue.length;
    const preview = message.length > 18 ? `${message.slice(0, 18)}...` : message;
    this.showBubble(`Queued #${queueSize}: ${preview}`, 3000);
  }

  private processQueue() {
    if (this.taskQueue.length === 0) return;
    const next = this.taskQueue.shift()!;
    this.assignTask(next.runId, next.message, next.onReady);
  }

  private stopIdleActivity() {
    if (this.wanderTimer) {
      this.wanderTimer.destroy();
      this.wanderTimer = null;
    }
    if (this.activityTimer) {
      this.activityTimer.destroy();
      this.activityTimer = null;
    }
    this.onArrival = null;
    this.isWandering = false;
    this.interactionLocked = false;
    this.hideEmote();
    this.bubble.hide();
  }

  setPOIs(pois: POI[]) {
    this.pois = pois;
  }

  setPathfinder(pf: Pathfinder) {
    this.pathfinder = pf;
  }

  canInteract() {
    return !this.interactionLocked;
  }

  isAwayFromDesk() {
    return this.moveTarget !== null || this.isWandering || !this.isAtHomePose();
  }

  rebindAssignedRun(previousRunId: string, nextRunId: string) {
    if (this.assignedRunId === previousRunId) {
      this.assignedRunId = nextRunId;
    }
  }

  private navPoint() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    return { x: body.center.x, y: body.center.y };
  }

  private homeNavPoint() {
    return {
      x: this.homeX + HOME_NAV_OFFSET_X,
      y: this.homeY + HOME_NAV_OFFSET_Y,
    };
  }

  private isAtHomePose() {
    return Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, this.homeX, this.homeY) <= 2;
  }

  private poiFacing(poiName: string): Direction {
    return poiName.toLowerCase().includes("sofa") ? "down" : "up";
  }

  // ── Movement ──────────────────────────────────────────

  /**
   * A*-based navigation. If `facePoi` is given, the worker faces that
   * point on arrival (useful when POI itself is unreachable).
   */
  navigateTo(x: number, y: number, facePoi?: { x: number; y: number }) {
    this.faceTarget = facePoi ?? null;
    if (this.pathfinder) {
      const start = this.navPoint();
      const path = this.pathfinder.findPath(start.x, start.y, x, y);
      if (path && path.length > 1) {
        this.currentPath = path;
        this.pathIndex = 1;
        this.moveTarget = this.currentPath[1];
        return;
      }
    }
    // Pathfinding failed — stay put instead of walking through walls
    this.currentPath = [];
    this.pathIndex = 0;
    this.moveTarget = null;
    if (this.onArrival) {
      const cb = this.onArrival;
      this.onArrival = null;
      cb();
    }
  }

  navigateHome() {
    this.isReturningHome = true;
    this.faceTarget = null;
    this.arrivalFacing = null;
    const homeNav = this.homeNavPoint();
    if (this.pathfinder) {
      const start = this.navPoint();
      const path = this.pathfinder.findPath(start.x, start.y, homeNav.x, homeNav.y);
      if (path && path.length > 1) {
        path.push(homeNav);
        this.currentPath = path;
        this.pathIndex = 1;
        this.moveTarget = this.currentPath[1];
        return;
      }
    }
    this.currentPath = [];
    this.pathIndex = 0;
    this.moveTarget = homeNav;
  }

  private faceToward(tx: number, ty: number) {
    const nav = this.navPoint();
    const dx = tx - nav.x;
    const dy = ty - nav.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = dx > 0 ? "right" : "left";
    } else {
      this.facing = dy > 0 ? "down" : "up";
    }
  }

  private resetToHomePose() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.sprite.setPosition(this.homeX, this.homeY);
    body.reset(this.homeX, this.homeY);
    this.facing = this.initialFacing;
  }

  private arriveAndStop() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.moveTarget = null;
    this.currentPath = [];
    this.pathIndex = 0;
    const returningHome = this.isReturningHome;
    this.isReturningHome = false;
    this.stuckFrames = 0;

    if (returningHome) {
      this.resetToHomePose();
      this.faceTarget = null;
      this.arrivalFacing = null;
    } else if (this.arrivalFacing) {
      this.facing = this.arrivalFacing;
      this.arrivalFacing = null;
      this.faceTarget = null;
    } else if (this.faceTarget) {
      this.faceToward(this.faceTarget.x, this.faceTarget.y);
      this.faceTarget = null;
    }

    const idleKey = `${this.spriteKey}:idle-${this.facing}`;
    if (this.sprite.anims.currentAnim?.key !== idleKey) {
      this.sprite.anims.play(idleKey);
    }

    if (this.onArrival) {
      const cb = this.onArrival;
      this.onArrival = null;
      cb();
    }
  }

  private updateMovement() {
    if (!this.moveTarget) return;

    const nav = this.navPoint();
    const dx = this.moveTarget.x - nav.x;
    const dy = this.moveTarget.y - nav.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ARRIVE_THRESHOLD) {
      if (this.currentPath.length > 0 && this.pathIndex < this.currentPath.length - 1) {
        this.pathIndex++;
        this.moveTarget = this.currentPath[this.pathIndex];
        this.stuckFrames = 0;
        return;
      }
      this.arriveAndStop();
      return;
    }

    // Stuck detection: if barely moved for ~2 seconds (120 frames at 60fps),
    // skip to next waypoint or give up.
    const movedX = Math.abs(nav.x - this.lastX);
    const movedY = Math.abs(nav.y - this.lastY);
    if (movedX < STUCK_MOVE_THRESHOLD && movedY < STUCK_MOVE_THRESHOLD) {
      this.stuckFrames++;
    } else {
      this.stuckFrames = 0;
    }
    this.lastX = nav.x;
    this.lastY = nav.y;

    if (this.stuckFrames > STUCK_FRAME_LIMIT) {
      this.stuckFrames = 0;
      if (this.currentPath.length > 0 && this.pathIndex < this.currentPath.length - 1) {
        this.pathIndex++;
        this.moveTarget = this.currentPath[this.pathIndex];
        return;
      }
      this.arriveAndStop();
      return;
    }

    const vx = (dx / dist) * WORKER_SPEED;
    const vy = (dy / dist) * WORKER_SPEED;
    (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(vx, vy);

    this.faceToward(this.moveTarget.x, this.moveTarget.y);

    const walkKey = `${this.spriteKey}:walk-${this.facing}`;
    if (this.sprite.anims.currentAnim?.key !== walkKey) {
      this.sprite.anims.play(walkKey);
    }
  }

  // ── Wandering ─────────────────────────────────────────

  private scheduleWander() {
    this.stopIdleActivity();
    if (!this.canWander || this._status !== "idle") return;

    const delay = Phaser.Math.Between(WANDER_MIN_DELAY, WANDER_MAX_DELAY);
    this.wanderTimer = this.scene.time.delayedCall(delay, () => {
      this.tryStartWander();
    });
  }

  private startWander() {
    const goToPoi = this.pois.length > 0 && Math.random() < POI_WANDER_CHANCE;

    if (goToPoi) {
      this.wanderToPoi();
    } else {
      this.seatActivity();
    }
  }

  private tryStartWander() {
    if (!this.canWander || this._status !== "idle") return;

    const now = this.scene.time.now;
    const sinceLast = now - wanderClock.lastStartedAt;
    if (sinceLast < WANDER_STAGGER_MS) {
      const extraDelay = WANDER_STAGGER_MS - sinceLast + Phaser.Math.Between(STAGGER_EXTRA_MIN, STAGGER_EXTRA_MAX);
      this.wanderTimer = this.scene.time.delayedCall(extraDelay, () => {
        this.tryStartWander();
      });
      return;
    }

    wanderClock.lastStartedAt = now;
    this.startWander();
  }

  /** Walk to a random POI, stay, then return */
  private wanderToPoi() {
    const poi = Phaser.Utils.Array.GetRandom(this.pois) as POI;
    this.isWandering = true;
    this.arrivalFacing = this.poiFacing(poi.name);

    this.onArrival = () => {
      if (this._status !== "idle" || !this.canWander) return;
      this.showBubble(Worker.poiBubbleText(poi.name), POI_STAY_MIN);

      const stayDuration = Phaser.Math.Between(POI_STAY_MIN, POI_STAY_MAX);
      if (this.activityTimer) {
        this.activityTimer.destroy();
        this.activityTimer = null;
      }
      this.activityTimer = this.scene.time.delayedCall(stayDuration, () => {
        if (this._status !== "idle" || !this.canWander) return;
        this.onArrival = () => {
          this.isWandering = false;
          this.hideEmote();
          this.scheduleWander();
        };
        this.navigateHome();
        this.activityTimer = null;
      });
    };

    this.navigateTo(poi.x, poi.y, { x: poi.x, y: poi.y });
  }

  /** Do something at the seat (no movement) */
  private seatActivity() {
    const def = Phaser.Utils.Array.GetRandom(SEAT_ACTIVITIES) as typeof SEAT_ACTIVITIES[number];
    const duration = Phaser.Math.Between(def.minDuration, def.maxDuration);

    this.showEmote(def.emote);

    if (this.activityTimer) {
      this.activityTimer.destroy();
      this.activityTimer = null;
    }
    this.activityTimer = this.scene.time.delayedCall(duration, () => {
      if (this._status !== "idle" || !this.canWander) return;
      this.hideEmote();
      this.scheduleWander();
      this.activityTimer = null;
    });
  }

  private static poiBubbleText(poiName: string): string {
    const lower = poiName.toLowerCase();
    for (const [keyword, texts] of Object.entries(POI_BUBBLE_TEXTS)) {
      if (lower.includes(keyword)) {
        return texts[Math.floor(Math.random() * texts.length)];
      }
    }
    return `At ${poiName}~`;
  }


  // ── Bubble ────────────────────────────────────────────

  showBubble(message: string, ttl = 5000) {
    this.hideEmote();

    const bubbleX = this.sprite.x;
    const bubbleY = this.sprite.y - FRAME_HEIGHT * BUBBLE_Y_OFFSET;
    this.bubble.show(message, bubbleX, bubbleY, ttl);
  }

  // ── Pause / Resume (boss proximity) ──────────────────

  private paused = false;
  private savedVx = 0;
  private savedVy = 0;

  pause() {
    if (this.paused) return;
    this.paused = true;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.savedVx = body.velocity.x;
    this.savedVy = body.velocity.y;
    body.setVelocity(0, 0);

    const idleKey = `${this.spriteKey}:idle-${this.facing}`;
    if (this.sprite.anims.currentAnim?.key !== idleKey) {
      this.sprite.anims.play(idleKey);
    }
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.moveTarget) {
      const body = this.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(this.savedVx, this.savedVy);
    }
  }

  // ── Update (call from scene.update) ───────────────────

  update() {
    if (!this.paused) this.updateMovement();

    // Sync attached objects to sprite position
    const nameY = this.sprite.y + FRAME_HEIGHT / 2 + 2;
    this.nameTag.setPosition(this.sprite.x, nameY);
    this.statusDot.setPosition(
      this.sprite.x - this.nameTag.width / 2 - 6,
      nameY + 4,
    );

    if (this.emoteSprite) {
      this.emoteSprite.setPosition(
        this.sprite.x,
        this.sprite.y - FRAME_HEIGHT * EMOTE_Y_OFFSET,
      );
    }

    if (this.bubble) {
      this.bubble.updatePosition(
        this.sprite.x,
        this.sprite.y - FRAME_HEIGHT * BUBBLE_Y_OFFSET,
      );
    }
  }

  // ── Cleanup ───────────────────────────────────────────

  destroy() {
    if (this.initTimer) { this.initTimer.destroy(); this.initTimer = null; }
    this.stopIdleActivity();
    if (this.taskVisualTimer) { this.taskVisualTimer.destroy(); this.taskVisualTimer = null; }
    if (this.emoteSprite) { this.emoteSprite.removeAllListeners(); this.emoteSprite.destroy(); this.emoteSprite = null; }
    this.sprite.destroy();
    this.nameTag.destroy();
    this.statusDot.destroy();
    this.bubble.destroy();
    this.pathfinder = null;
    this.onArrival = null;
  }
}
