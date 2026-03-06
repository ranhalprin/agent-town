import * as Phaser from "phaser";
import {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  SHEET_COLUMNS,
  makeAnims,
  type Direction,
} from "../config/animations";
import { ChatBubble } from "./ChatBubble";

export type WorkerStatus = "idle" | "working" | "done";

export class Worker {
  sprite: Phaser.Physics.Arcade.Sprite;
  bubble: ChatBubble;
  readonly seatId: string;
  readonly label: string;
  readonly spriteKey: string;

  private scene: Phaser.Scene;
  private _status: WorkerStatus = "idle";
  private facing: Direction;
  private nameTag: Phaser.GameObjects.Text;
  private statusDot: Phaser.GameObjects.Arc;

  /** The runId currently assigned to this worker (null = idle) */
  assignedRunId: string | null = null;

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

    this.registerAnims(scene, spriteKey);

    this.sprite = scene.physics.add.sprite(x, y, spriteKey, 0);
    this.sprite.setDepth(5);
    this.sprite.body!.setSize(FRAME_WIDTH * 0.5, FRAME_HEIGHT * 0.2);
    this.sprite.body!.setOffset(FRAME_WIDTH * 0.25, FRAME_HEIGHT * 0.75);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    (this.sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;

    this.sprite.anims.play(`${spriteKey}:idle-${facing}`);

    // Name tag below sprite
    this.nameTag = scene.add
      .text(x, y + 16, label, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: "6px",
        color: "#e0e0e0",
        backgroundColor: "rgba(0,0,0,0.7)",
        padding: { x: 4, y: 2 },
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

    // Status dot next to name
    this.statusDot = scene.add.circle(
      x - this.nameTag.width / 2 - 6,
      y + 20,
      3,
      0x888888
    );
    this.statusDot.setDepth(20);

    this.bubble = new ChatBubble(scene);
  }

  private registerAnims(scene: Phaser.Scene, spriteKey: string) {
    if (scene.anims.exists(`${spriteKey}:idle-down`)) return;

    const tex = scene.textures.get(spriteKey);
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

  get status(): WorkerStatus {
    return this._status;
  }

  setStatus(status: WorkerStatus) {
    this._status = status;
    const colors: Record<WorkerStatus, number> = {
      idle: 0x888888,
      working: 0xfacc15,
      done: 0x22c55e,
    };
    this.statusDot.setFillStyle(colors[status]);
  }

  assignTask(runId: string, taskMessage: string) {
    this.assignedRunId = runId;
    this.setStatus("working");
    this.showBubble(`📋 ${taskMessage}`, 4000);
  }

  showBubble(message: string, ttl = 5000) {
    const bubbleX = this.sprite.x;
    const bubbleY = this.sprite.y - FRAME_HEIGHT * 0.45;
    this.bubble.show(message, bubbleX, bubbleY, ttl);
  }

  completeTask() {
    this.setStatus("done");
    this.showBubble("Done! Task completed.", 6000);

    this.scene.time.delayedCall(6000, () => {
      if (this._status === "done") {
        this.setStatus("idle");
        this.assignedRunId = null;
      }
    });
  }

  failTask() {
    this.setStatus("idle");
    this.showBubble("Task failed.", 4000);
    this.scene.time.delayedCall(4000, () => {
      this.assignedRunId = null;
    });
  }

  destroy() {
    this.sprite.destroy();
    this.nameTag.destroy();
    this.statusDot.destroy();
    this.bubble.destroy();
  }
}
