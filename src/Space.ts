import { type Body } from "planck";

import { Middleware } from "polymatic";

import { Calc } from "./Calc";
import { type MainContext } from "./Main";
import { type FrameLoopEvent } from "./FrameLoop";

export const SPACE_WIDTH = 16;
export const SPACE_HEIGHT = 9;

const FIRE_RELOAD_TIME = 400;
const BULLET_LIFE_TIME = 1000;
const SHIP_RESPAWN_DELAY = 1000;
const CRASH_SHIELD_TIME = 2000;

const ASTEROID_RADIUS = 0.2;

export interface Point {
  x: number;
  y: number;
}

export interface Ship {
  key: string;
  type: "ship";
  // position and angle, updated by physics
  x: number;
  y: number;
  angle: number;
  // controls
  left?: boolean;
  right?: boolean;
  forward?: boolean;
}

export interface Bullet {
  key: string;
  type: "bullet";
  x: number;
  y: number;
  angle: number;
  dieTime: number;
  ship: Ship;
}

export interface Asteroid {
  key: string;
  type: "asteroid";
  size: number;
  x: number;
  y: number;
  angle: number;
  // polygon shape, relative to position
  path: Point[];
}

export type Entity = Ship | Bullet | Asteroid;

/**
 * Game logic: rules, lifecycles and timers. Physics and rendering agnostic.
 */
export class Space extends Middleware<MainContext> {
  globalTime = 0;
  allowCrashTime = 0;
  allowFireTime = 0;
  shipRespawnTime: number | null = null;

  constructor() {
    super();
    this.on("activate", this.handleActivate);
    this.on("game-start", this.handleGameStart);
    this.on("game-end", this.handleGameEnd);
    this.on("frame-update", this.handleFrameUpdate);
    this.on("collide-ship-asteroid", this.collideShipAsteroid);
    this.on("collide-bullet-asteroid", this.collideBulletAsteroid);
  }

  handleActivate = () => {
    this.context.gameover = true;
    this.context.level = 0;
    this.context.lives = 0;
    this.context.ship = null;
    this.context.bullets = [];
    this.context.asteroids = [];

    this.emit("game-start");
  };

  handleGameStart = () => {
    this.context.gameover = false;
    this.context.level = 1;
    this.context.lives = 3;
    this.shipRespawnTime = null;

    this.setupShip();
    this.initAsteroids(4);
  };

  handleGameEnd = () => {
    this.context.gameover = true;
  };

  setupShip() {
    this.context.ship = {
      key: "ship",
      type: "ship",
      x: 0,
      y: 0,
      angle: 0,
    };
    this.allowCrashTime = this.globalTime + CRASH_SHIELD_TIME;
  }

  handleFrameUpdate = (ev: FrameLoopEvent) => {
    const { ship, activeKeys, gameover } = this.context;
    this.globalTime += ev.dt;

    if (ship) {
      ship.left = activeKeys["ArrowLeft"] && !activeKeys["ArrowRight"];
      ship.right = activeKeys["ArrowRight"] && !activeKeys["ArrowLeft"];
      ship.forward = activeKeys["ArrowUp"];
      if (activeKeys["Space"]) {
        this.fireBullet();
      }
    } else if (this.shipRespawnTime !== null && this.globalTime >= this.shipRespawnTime && !gameover) {
      this.shipRespawnTime = null;
      this.setupShip();
    }

    const bullets = this.context.bullets;
    for (let i = bullets.length - 1; i >= 0; i--) {
      const bullet = bullets[i];
      if (bullet.dieTime <= this.globalTime) {
        this.deleteBullet(bullet);
      }
    }
  };

  fireBullet() {
    const ship = this.context.ship;
    if (this.allowFireTime > this.globalTime || !ship) {
      return;
    }
    this.allowFireTime = this.globalTime + FIRE_RELOAD_TIME;
    this.context.bullets.push({
      key: "bullet-" + Math.random(),
      type: "bullet",
      x: ship.x,
      y: ship.y,
      angle: ship.angle,
      dieTime: this.globalTime + BULLET_LIFE_TIME,
      ship,
    });
  }

  initAsteroids(count: number) {
    this.context.asteroids.length = 0;

    for (let i = 0; i < count; i++) {
      this.addAsteroid(4, Calc.random(SPACE_WIDTH), Calc.random(SPACE_HEIGHT));
    }
  }

  addAsteroid(size: number, x: number, y: number) {
    this.context.asteroids.push({
      key: "asteroid-" + Math.random(),
      type: "asteroid",
      size,
      x,
      y,
      angle: Calc.random() * Math.PI,
      path: makeAsteroidPath(size * ASTEROID_RADIUS),
    });
  }

  splitAsteroid(parentData: Asteroid, parentBody: Body) {
    const splitSize = parentData.size - 1;
    if (splitSize === 0) {
      return;
    }

    const radius = splitSize * ASTEROID_RADIUS;
    const angleDisturb = (Math.PI / 2) * Math.random();
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 2) * i + angleDisturb;
      const sp = parentBody.getWorldPoint({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
      this.addAsteroid(splitSize, sp.x, sp.y);
    }
  }

  deleteShip(): boolean {
    if (!this.context.ship) return false;
    this.context.ship = null;
    return true;
  }

  deleteBullet(data: Bullet): boolean {
    const index = this.context.bullets.indexOf(data);
    if (index !== -1) {
      this.context.bullets.splice(index, 1);
      return true;
    }
    return false;
  }

  deleteAsteroid(data: Asteroid): boolean {
    const index = this.context.asteroids.indexOf(data);
    if (index !== -1) {
      this.context.asteroids.splice(index, 1);
      return true;
    }
    return false;
  }

  collideShipAsteroid = () => {
    if (this.allowCrashTime > this.globalTime) {
      return;
    }

    this.context.lives--;
    this.deleteShip();

    if (this.context.lives <= 0) {
      this.emit("game-end");
    } else {
      this.shipRespawnTime = this.globalTime + SHIP_RESPAWN_DELAY;
    }
  };

  collideBulletAsteroid = ({ bullet, asteroid }: { bullet: Body; asteroid: Body }) => {
    const asteroidData = asteroid.getUserData() as Asteroid;
    const bulletData = bullet.getUserData() as Bullet;

    const deletedAsteroid = this.deleteAsteroid(asteroidData);
    const deletedBullet = this.deleteBullet(bulletData);

    if (deletedAsteroid && deletedBullet) {
      this.splitAsteroid(asteroidData, asteroid);
    }

    if (this.context.asteroids.length === 0) {
      this.context.level++;
      this.initAsteroids(this.context.level);
    }
  };
}

/** Random rocky polygon around the origin. */
function makeAsteroidPath(radius: number) {
  const n = 8;
  const path: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    path.push({
      x: radius * (Math.sin(a) + Calc.random(0.3)),
      y: radius * (Math.cos(a) + Calc.random(0.3)),
    });
  }
  return path;
}
