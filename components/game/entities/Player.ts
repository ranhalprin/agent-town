import * as Phaser from "phaser";
import {
  SPRITE_KEY,
  MOVE_SPEED,
  ALL_ANIMS,
  FRAME_WIDTH,
  FRAME_HEIGHT,
} from "../config/animations";

type Direction = "down" | "up" | "left" | "right";

export class Player {
  sprite: Phaser.Physics.Arcade.Sprite;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: Record<string, Phaser.Input.Keyboard.Key>;
  private facing: Direction = "left";

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // Create animations once
    this.createAnimations(scene);

    // Create physics sprite
    this.sprite = scene.physics.add.sprite(x, y, SPRITE_KEY, 0);
    this.sprite.setDepth(5);

    // Physics body covers the feet area (bottom portion of the 48×96 frame)
    this.sprite.body!.setSize(FRAME_WIDTH * 0.5, FRAME_HEIGHT * 0.2);
    this.sprite.body!.setOffset(FRAME_WIDTH * 0.25, FRAME_HEIGHT * 0.75);

    // Keyboard input
    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.wasd = scene.input.keyboard!.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    // Start idle
    this.sprite.anims.play("idle-left");
  }

  private createAnimations(scene: Phaser.Scene) {
    if (scene.anims.exists("idle-down")) return;

    for (const anim of ALL_ANIMS) {
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = anim.start; i <= anim.end; i++) {
        frames.push({ key: SPRITE_KEY, frame: i });
      }
      scene.anims.create({
        key: anim.key,
        frames,
        frameRate: anim.frameRate,
        repeat: anim.repeat,
      });
    }
  }

  update() {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const speed = MOVE_SPEED;

    // Determine velocity from input
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -speed;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = speed;

    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed;

    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
      const factor = Math.SQRT1_2;
      vx *= factor;
      vy *= factor;
    }

    body.setVelocity(vx, vy);

    // Determine facing direction and animation
    const moving = vx !== 0 || vy !== 0;

    if (moving) {
      // Prefer horizontal when diagonal
      if (vx < 0) this.facing = "left";
      else if (vx > 0) this.facing = "right";
      else if (vy < 0) this.facing = "up";
      else if (vy > 0) this.facing = "down";

      const walkKey = `walk-${this.facing}`;
      if (this.sprite.anims.currentAnim?.key !== walkKey) {
        this.sprite.anims.play(walkKey);
      }
    } else {
      const idleKey = `idle-${this.facing}`;
      if (this.sprite.anims.currentAnim?.key !== idleKey) {
        this.sprite.anims.play(idleKey);
      }
    }
  }
}
