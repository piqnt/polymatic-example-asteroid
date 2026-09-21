import { World, Circle, Polygon, type Body, type Contact } from "planck";

import { Binder, Driver, Middleware } from "polymatic";

import { Calc } from "./Calc";
import { type MainContext } from "./Main";
import { type FrameLoopEvent } from "./FrameLoop";
import { type Asteroid, type Bullet, type Entity, type Ship, SPACE_WIDTH, SPACE_HEIGHT } from "./Space";

const ASTEROID_SPEED = 2;
const BULLET_SPEED = 5;

const TIME_STEP = 1 / 60;
const MAX_FRAME_TIME = 50;

/**
 * Physics: maps game data to bodies, steps the world, and turns collisions into game events.
 */
export class Physics extends Middleware<MainContext> {
  static SHIP_BITS = 2;
  static BULLET_BITS = 4;
  static ASTEROID_BITS = 4;

  world: World;
  timeAccumulator = 0;

  constructor() {
    super();
    this.on("activate", this.handleActivate);
    this.on("frame-update", this.handleFrameUpdate);
  }

  handleActivate = () => {
    this.world = new World({ gravity: { x: 0, y: 0 } });
    this.world.on("begin-contact", this.handleContact);
    this.context.world = this.world;
  };

  handleFrameUpdate = (ev: FrameLoopEvent) => {
    this.binder.setData([...this.context.asteroids, ...this.context.bullets, this.context.ship]);

    // fixed time step
    this.timeAccumulator += Math.min(ev.dt, MAX_FRAME_TIME) / 1000;
    while (this.timeAccumulator >= TIME_STEP) {
      this.world.step(TIME_STEP);
      this.timeAccumulator -= TIME_STEP;
    }

    // wrap bodies around the screen, and copy position and angle to game data
    for (let body = this.world.getBodyList(); body; body = body.getNext()) {
      const data = body.getUserData() as Entity | null;
      if (!data) continue;
      const p = body.getPosition();
      const x = Calc.wrap(p.x, -SPACE_WIDTH / 2, SPACE_WIDTH / 2);
      const y = Calc.wrap(p.y, -SPACE_HEIGHT / 2, SPACE_HEIGHT / 2);
      if (x !== p.x || y !== p.y) {
        body.setPosition({ x, y });
      }
      data.x = x;
      data.y = y;
      data.angle = body.getAngle();
    }
  };

  shipDriver = Driver.create<Ship, Body>({
    filter: (data) => data.type === "ship",
    enter: (data) => this.createShip(data),
    update: (data, body) => {
      if (data.left) {
        body.applyAngularImpulse(0.1, true);
      }
      if (data.right) {
        body.applyAngularImpulse(-0.1, true);
      }
      if (data.forward) {
        const f = body.getWorldVector({ x: 0, y: 1 });
        const p = body.getWorldPoint({ x: 0, y: 2 });
        body.applyLinearImpulse(f, p, true);
      }
    },
    exit: (data, body) => {
      this.world.destroyBody(body);
    },
  });

  bulletDriver = Driver.create<Bullet, Body>({
    filter: (data) => data.type === "bullet",
    enter: (data) => this.createBullet(data),
    update: (data, body) => {},
    exit: (data, body) => {
      this.world.destroyBody(body);
    },
  });

  asteroidDriver = Driver.create<Asteroid, Body>({
    filter: (data) => data.type === "asteroid",
    enter: (data) => this.createAsteroid(data),
    update: (data, body) => {},
    exit: (data, body) => {
      this.world.destroyBody(body);
    },
  });

  binder = Binder.create<Entity>({
    key: (data) => data.key,
    drivers: [this.shipDriver, this.bulletDriver, this.asteroidDriver],
  });

  createShip(data: Ship) {
    const body = this.world.createBody({
      type: "dynamic",
      angularDamping: 2.0,
      linearDamping: 0.5,
      position: { x: data.x, y: data.y },
      angle: data.angle,
      userData: data,
    });

    body.createFixture({
      shape: new Polygon([
        { x: -0.15, y: -0.15 },
        { x: 0, y: -0.1 },
        { x: 0.15, y: -0.15 },
        { x: 0, y: 0.2 },
      ]),
      density: 1000,
      filterCategoryBits: Physics.SHIP_BITS,
      filterMaskBits: Physics.ASTEROID_BITS,
    });

    return body;
  }

  createBullet(data: Bullet): Body | null {
    const ship = this.shipDriver.ref(data.ship.key);
    if (!ship) return null;

    const body = this.world.createBody({
      type: "dynamic",
      position: ship.getWorldPoint({ x: 0, y: 0 }),
      linearVelocity: ship.getWorldVector({ x: 0, y: BULLET_SPEED }),
      bullet: true,
      userData: data,
    });

    body.createFixture({
      shape: new Circle(0.05),
      filterCategoryBits: Physics.BULLET_BITS,
      filterMaskBits: Physics.ASTEROID_BITS,
    });

    return body;
  }

  createAsteroid(data: Asteroid) {
    const body = this.world.createBody({
      type: "kinematic",
      position: { x: data.x, y: data.y },
      angle: data.angle,
      linearVelocity: { x: Calc.random(ASTEROID_SPEED), y: Calc.random(ASTEROID_SPEED) },
      angularVelocity: Calc.random(ASTEROID_SPEED),
      userData: data,
    });

    body.createFixture({
      shape: new Polygon(data.path),
      filterCategoryBits: Physics.ASTEROID_BITS,
      filterMaskBits: Physics.BULLET_BITS | Physics.SHIP_BITS,
    });

    return body;
  }

  handleContact = (contact: Contact) => {
    const bodyA = contact.getFixtureA().getBody();
    const bodyB = contact.getFixtureB().getBody();

    const dataA = bodyA.getUserData() as Entity | null;
    const dataB = bodyB.getUserData() as Entity | null;
    if (!dataA || !dataB) return;

    const ship = dataA.type === "ship" ? bodyA : dataB.type === "ship" ? bodyB : null;
    const bullet = dataA.type === "bullet" ? bodyA : dataB.type === "bullet" ? bodyB : null;
    const asteroid = dataA.type === "asteroid" ? bodyA : dataB.type === "asteroid" ? bodyB : null;

    // the world is locked during a step, game events are handled later
    if (ship && asteroid) {
      this.emit("collide-ship-asteroid", { ship, asteroid });
    }
    if (bullet && asteroid) {
      this.emit("collide-bullet-asteroid", { bullet, asteroid });
    }
  };
}
