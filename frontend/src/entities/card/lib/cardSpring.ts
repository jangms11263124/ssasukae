/**
 * svelte/motion spring 포팅 (pokemon-cards-css Card.svelte 가 쓰는 것과 동일).
 * @see https://cdn.jsdelivr.net/npm/svelte@4.2.19/src/runtime/motion/spring.js
 */

export interface SpringOpts {
  stiffness?: number;
  damping?: number;
  precision?: number;
}

export interface SpringUpdateOpts {
  hard?: boolean;
  soft?: boolean | number;
}

type Subscriber<T> = (value: T) => void;

/** poke-holo Card.svelte springInteractSettings */
export const SPRING_INTERACT: Required<SpringOpts> = {
  stiffness: 0.066,
  damping: 0.25,
  precision: 0.01,
};

/** poke-holo Card.svelte springPopoverSettings — firstPop 용 */
export const SPRING_POPOVER: Required<SpringOpts> = {
  stiffness: 0.033,
  damping: 0.45,
  precision: 0.01,
};

interface TickCtx {
  inv_mass: number;
  opts: Required<SpringOpts>;
  settled: boolean;
  dt: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tickSpring<T>(ctx: TickCtx, lastValue: T, currentValue: T, targetValue: T): T {
  if (typeof currentValue === 'number' && typeof targetValue === 'number' && typeof lastValue === 'number') {
    const delta = targetValue - currentValue;
    const velocity = (currentValue - lastValue) / (ctx.dt || 1 / 60);
    const spring = ctx.opts.stiffness * delta;
    const damper = ctx.opts.damping * velocity;
    const acceleration = (spring - damper) * ctx.inv_mass;
    const d = (velocity + acceleration) * ctx.dt;

    if (Math.abs(d) < ctx.opts.precision && Math.abs(delta) < ctx.opts.precision) {
      return targetValue;
    }

    ctx.settled = false;
    return (currentValue + d) as T;
  }

  if (isObject(currentValue) && isObject(targetValue) && isObject(lastValue)) {
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(currentValue)) {
      next[key] = tickSpring(
        ctx,
        lastValue[key] as T,
        currentValue[key] as T,
        targetValue[key] as T,
      );
    }
    return next as T;
  }

  return targetValue;
}

export interface MotionSpring<T> {
  set: (value: T, opts?: SpringUpdateOpts) => Promise<void>;
  subscribe: (fn: Subscriber<T>) => () => void;
  stiffness: number;
  damping: number;
  precision: number;
}

/**
 * svelte `spring()` 와 같은 API.
 */
export function createSpring<T>(initial: T, opts: SpringOpts = {}): MotionSpring<T> {
  const config: Required<SpringOpts> = {
    stiffness: opts.stiffness ?? 0.15,
    damping: opts.damping ?? 0.8,
    precision: opts.precision ?? 0.01,
  };

  let value = initial;
  let lastValue = initial;
  let targetValue = initial;
  let lastTime = performance.now();
  let invMass = 1;
  let invMassRecoveryRate = 0;
  let raf = 0;
  let cancelTask = false;
  let currentToken = 0;
  const subscribers = new Set<Subscriber<T>>();

  const notify = () => {
    for (const fn of subscribers) fn(value);
  };

  const set = (newValue: T, updateOpts: SpringUpdateOpts = {}): Promise<void> => {
    targetValue = newValue;
    const token = ++currentToken;

    if (updateOpts.hard || (config.stiffness >= 1 && config.damping >= 1)) {
      cancelTask = true;
      lastTime = performance.now();
      lastValue = newValue;
      value = targetValue;
      notify();
      return Promise.resolve();
    }

    if (updateOpts.soft) {
      const rate = updateOpts.soft === true ? 0.5 : Number(updateOpts.soft);
      invMassRecoveryRate = 1 / (rate * 60);
      invMass = 0;
    }

    if (!raf) {
      lastTime = performance.now();
      cancelTask = false;

      const loop = (now: number) => {
        if (cancelTask) {
          cancelTask = false;
          raf = 0;
          return;
        }

        invMass = Math.min(invMass + invMassRecoveryRate, 1);
        const ctx: TickCtx = {
          inv_mass: invMass,
          opts: config,
          settled: true,
          dt: ((now - lastTime) * 60) / 1000,
        };

        const nextValue = tickSpring(ctx, lastValue, value, targetValue);
        lastTime = now;
        lastValue = value;
        value = nextValue;
        notify();

        if (ctx.settled) {
          raf = 0;
          return;
        }

        raf = requestAnimationFrame(loop);
      };

      raf = requestAnimationFrame(loop);
    }

    return new Promise((resolve) => {
      const check = () => {
        if (token !== currentToken) {
          resolve();
          return;
        }
        if (!raf) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  };

  return {
    set,
    subscribe(fn) {
      subscribers.add(fn);
      fn(value);
      return () => {
        subscribers.delete(fn);
      };
    },
    get stiffness() {
      return config.stiffness;
    },
    set stiffness(v: number) {
      config.stiffness = v;
    },
    get damping() {
      return config.damping;
    },
    set damping(v: number) {
      config.damping = v;
    },
    get precision() {
      return config.precision;
    },
    set precision(v: number) {
      config.precision = v;
    },
  };
}
