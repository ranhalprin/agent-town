import * as Phaser from "phaser";

const BUBBLE_PAD_X = 10;
const BUBBLE_PAD_Y = 6;
const BUBBLE_MAX_WIDTH = 220;
const BUBBLE_RADIUS = 6;
const TAIL_SIZE = 6;
const FADE_DURATION = 400;
const DEFAULT_TTL = 5000;
const BUBBLE_FONT_SIZE = 12;
const BUBBLE_FONT_FAMILY = '"ArkPixel", monospace';

// Shared canvas context for text measurement across all ChatBubble instances
let sharedMeasureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (!sharedMeasureCtx) {
    sharedMeasureCtx = document.createElement("canvas").getContext("2d");
    if (sharedMeasureCtx) {
      sharedMeasureCtx.font = `${BUBBLE_FONT_SIZE}px ${BUBBLE_FONT_FAMILY}`;
    }
  }
  return sharedMeasureCtx;
}

export class ChatBubble {
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private scene: Phaser.Scene;
  private fadeTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, depth = 25) {
    this.scene = scene;
    this.bg = scene.add.graphics();
    this.text = scene.add.text(0, 0, "", {
      fontFamily: BUBBLE_FONT_FAMILY,
      fontSize: `${BUBBLE_FONT_SIZE}px`,
      color: "#1a1a2e",
      lineSpacing: 6,
      stroke: "#1a1a2e",
      strokeThickness: 0.5,
    });
    this.text.setOrigin(0, 0);

    this.container = scene.add.container(0, 0, [this.bg, this.text]);
    this.container.setDepth(depth);
    this.container.setVisible(false);
  }

  private wrapText(input: string) {
    const maxWidth = BUBBLE_MAX_WIDTH - BUBBLE_PAD_X * 2;
    const ctx = getMeasureCtx();
    if (!ctx) return input;

    const wrappedLines: string[] = [];
    for (const paragraph of input.split("\n")) {
      if (!paragraph) {
        wrappedLines.push("");
        continue;
      }

      let line = "";
      for (const char of paragraph) {
        const candidate = line + char;
        if (line && ctx.measureText(candidate).width > maxWidth) {
          wrappedLines.push(line);
          line = char;
        } else {
          line = candidate;
        }
      }
      if (line) wrappedLines.push(line);
    }

    return wrappedLines.join("\n");
  }

  show(message: string, anchorX: number, anchorY: number, ttl = DEFAULT_TTL) {
    if (this.fadeTimer) {
      this.fadeTimer.destroy();
      this.fadeTimer = null;
    }
    this.scene.tweens.killTweensOf(this.container);

    const displayText = message.length > 100 ? message.slice(0, 97) + "..." : message;
    this.text.setText(this.wrapText(displayText));

    const textW = Math.min(this.text.width, BUBBLE_MAX_WIDTH - BUBBLE_PAD_X * 2);
    const textH = this.text.height;
    const bubbleW = textW + BUBBLE_PAD_X * 2;
    const bubbleH = textH + BUBBLE_PAD_Y * 2;

    this.text.setPosition(
      -bubbleW / 2 + BUBBLE_PAD_X,
      -bubbleH - TAIL_SIZE + BUBBLE_PAD_Y
    );

    this.bg.clear();
    // Bubble background
    this.bg.fillStyle(0xffffff, 0.95);
    this.bg.fillRoundedRect(
      -bubbleW / 2,
      -bubbleH - TAIL_SIZE,
      bubbleW,
      bubbleH,
      BUBBLE_RADIUS
    );
    // Border
    this.bg.lineStyle(2, 0x1a1a2e, 0.6);
    this.bg.strokeRoundedRect(
      -bubbleW / 2,
      -bubbleH - TAIL_SIZE,
      bubbleW,
      bubbleH,
      BUBBLE_RADIUS
    );
    // Tail triangle
    this.bg.fillStyle(0xffffff, 0.95);
    this.bg.fillTriangle(
      -TAIL_SIZE / 2, -TAIL_SIZE,
      TAIL_SIZE / 2, -TAIL_SIZE,
      0, 0
    );

    this.container.setPosition(anchorX, anchorY);
    this.container.setVisible(true);
    this.container.setAlpha(1);

    if (ttl > 0) {
      this.fadeTimer = this.scene.time.delayedCall(ttl, () => {
        this.fadeTimer = null;
        this.scene.tweens.add({
          targets: this.container,
          alpha: 0,
          duration: FADE_DURATION,
          onComplete: () => this.container.setVisible(false),
        });
      });
    }
  }

  updatePosition(anchorX: number, anchorY: number) {
    this.container.setPosition(anchorX, anchorY);
  }

  hide() {
    if (this.fadeTimer) {
      this.fadeTimer.destroy();
      this.fadeTimer = null;
    }
    this.scene.tweens.killTweensOf(this.container);
    this.container.setVisible(false);
  }

  destroy() {
    if (this.fadeTimer) this.fadeTimer.destroy();
    this.scene.tweens.killTweensOf(this.container);
    this.container.destroy();
  }
}
