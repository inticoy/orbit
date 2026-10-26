export const motionTokens = {
  /** Sheets sliding up and the tab bar's selected pill. */
  glassSpring: { type: "spring", stiffness: 320, damping: 30, mass: 0.8 },
  /** Settling after a gesture: critically damped, no overshoot (Apple: damping 1.0, response ~0.35s). */
  settle: { type: "spring", bounce: 0, duration: 0.35 },
} as const;
