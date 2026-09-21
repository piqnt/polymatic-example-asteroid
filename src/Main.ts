import { type Application, type Container } from "pixi.js";
import { type World } from "planck";

import { Middleware } from "polymatic";

import { FrameLoop } from "./FrameLoop";
import { PixiManager } from "./PixiManager";
import { Terminal } from "./Terminal";
import { Physics } from "./Physics";
import { Space, type Asteroid, type Bullet, type Ship } from "./Space";

export interface MainContext {
  pixi?: Application;
  scene?: Container;

  world?: World;

  // keys currently pressed, by KeyboardEvent.code
  activeKeys?: Record<string, boolean>;

  ship?: Ship | null;
  bullets?: Bullet[];
  asteroids?: Asteroid[];

  level?: number;
  lives?: number;
  gameover?: boolean;
}

export class Main extends Middleware<MainContext> {
  constructor() {
    super();
    this.use(new FrameLoop());
    this.use(new PixiManager());
    this.on("pixi-ready", this.handlePixiReady);
  }

  handlePixiReady = () => {
    this.use(new Space());
    this.use(new Physics());
    this.use(new Terminal());
  };
}
