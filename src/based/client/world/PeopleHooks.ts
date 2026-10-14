// What the world asks of a person beyond walking and posing (r22): getting
// wet in the rain and drying indoors, and running. The people themselves
// are BPEOPLE's (People.ts), which implements these on each person; the
// world calls them through this file, each call optional, so either side
// builds and runs without the other. Until a person can run by itself, the
// world plays its walk faster (a hurried walk) instead.

/** The calls the world makes on a person, when the person has them. */
export interface PersonHooks {
  /** 0 (dry) to 1 (soaked): clothes and hair darker and glossier. */
  setWetness?(k: number): void;
  /** Walking or running: the clip and the speed that go with it. */
  setGait?(g: "walk" | "run"): void;
}

/** How much faster a run is than a walk. */
export const RUN_SPEED = 2.15;

export function setWetness(p: object, k: number): void {
  (p as PersonHooks).setWetness?.(Math.max(0, Math.min(1, k)));
}

/**
 * Sets a person walking or running. Returns how much the world should speed
 * up that person's clock to fake a run: 1 when the person runs by itself
 * (or walks), RUN_SPEED when it can only walk.
 */
export function setGait(p: object, g: "walk" | "run"): number {
  const h = p as PersonHooks;
  if (h.setGait) {
    h.setGait(g);
    return 1;
  }
  return g === "run" ? RUN_SPEED : 1;
}
