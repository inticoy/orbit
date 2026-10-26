import type { ReactNode } from "react";

/** Pages settle in with a short slide (a CSS transform animation, so it never sticks half way on iPhone). */
export function PageEnter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`anim-slide ${className ?? ""}`}>{children}</div>;
}
