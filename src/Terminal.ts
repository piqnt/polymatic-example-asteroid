import { Container, Graphics, Text } from "pixi.js";

import { Binder, Driver, Middleware } from "polymatic";

import { type MainContext } from "./Main";
import { type Asteroid, type Bullet, type Entity, type Ship, SPACE_WIDTH, SPACE_HEIGHT } from "./Space";

const LINE_WIDTH = 0.03;
const COLOR = 0xffffff;

/**
 * Terminal: renders game data with Pixi, and reads keyboard input.
 */
export class Terminal extends Middleware<MainContext> {
  status: Text;

  constructor() {
    super();
    this.on("activate", this.handleActivate);
    this.on("deactivate", this.handleDeactivate);
    this.on("frame-render", this.handleFrameRender);
  }

  handleActivate = () => {
    const pixi = this.context.pixi;

    this.context.activeKeys = {};

    pixi.renderer.on("resize", this.handleViewport);
    this.handleViewport();

    this.status = new Text({
      text: "",
      style: { fill: COLOR, fontFamily: "monospace", fontSize: 14 },
    });
    this.status.position.set(10, 10);
    pixi.stage.addChild(this.status);

    document.addEventListener("keydown", this.handleKeydown);
    document.addEventListener("keyup", this.handleKeyup);
  };

  handleDeactivate = () => {
    this.context.pixi?.renderer.off("resize", this.handleViewport);
    document.removeEventListener("keydown", this.handleKeydown);
    document.removeEventListener("keyup", this.handleKeyup);
  };

  /**
   * Fit the space inside the screen, center the origin, and flip y-axis to point up like physics.
   */
  handleViewport = () => {
    const pixi = this.context.pixi;
    const scene = this.context.scene;

    const screenWidth = pixi.screen.width;
    const screenHeight = pixi.screen.height;

    const scale = Math.min(screenWidth / SPACE_WIDTH, screenHeight / SPACE_HEIGHT);
    scene.scale.set(scale, -scale);
    scene.position.set(screenWidth / 2, screenHeight / 2);
  };

  handleKeydown = (e: KeyboardEvent) => {
    if (!isGameKey(e.code)) return;
    e.preventDefault();
    this.context.activeKeys[e.code] = true;
    if (e.code === "Space" && this.context.gameover) {
      this.emit("game-start");
    }
  };

  handleKeyup = (e: KeyboardEvent) => {
    if (!isGameKey(e.code)) return;
    e.preventDefault();
    this.context.activeKeys[e.code] = false;
  };

  handleFrameRender = () => {
    this.binder.setData([...this.context.asteroids, ...this.context.bullets, this.context.ship]);

    const { level, lives, gameover } = this.context;
    const hint = gameover ? "Game Over! Press Space to start" : "Arrows: turn/thrust, Space: fire";
    this.status.text = `Level ${level}   Lives ${lives}\n${hint}`;
  };

  shipDriver = Driver.create<Ship, Graphics>({
    filter: (data) => data.type === "ship",
    enter: (data) => {
      const graphics = new Graphics()
        .poly([-0.15, -0.15, 0, -0.1, 0.15, -0.15, 0, 0.2])
        .stroke({ width: LINE_WIDTH, color: COLOR });
      this.context.scene.addChild(graphics);
      return graphics;
    },
    update: (data, graphics) => {
      graphics.position.set(data.x, data.y);
      graphics.rotation = data.angle;
    },
    exit: (data, graphics) => {
      graphics.removeFromParent();
      graphics.destroy();
    },
  });

  bulletDriver = Driver.create<Bullet, Graphics>({
    filter: (data) => data.type === "bullet",
    enter: (data) => {
      const graphics = new Graphics().circle(0, 0, 0.05).fill({ color: COLOR });
      this.context.scene.addChild(graphics);
      return graphics;
    },
    update: (data, graphics) => {
      graphics.position.set(data.x, data.y);
    },
    exit: (data, graphics) => {
      graphics.removeFromParent();
      graphics.destroy();
    },
  });

  asteroidDriver = Driver.create<Asteroid, Graphics>({
    filter: (data) => data.type === "asteroid",
    enter: (data) => {
      const graphics = new Graphics().poly(data.path).stroke({ width: LINE_WIDTH, color: COLOR });
      this.context.scene.addChild(graphics);
      return graphics;
    },
    update: (data, graphics) => {
      graphics.position.set(data.x, data.y);
      graphics.rotation = data.angle;
    },
    exit: (data, graphics) => {
      graphics.removeFromParent();
      graphics.destroy();
    },
  });

  binder = Binder.create<Entity>({
    key: (data) => data.key,
    drivers: [this.shipDriver, this.bulletDriver, this.asteroidDriver],
  });
}

const GAME_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"]);

function isGameKey(code: string) {
  return GAME_KEYS.has(code);
}
