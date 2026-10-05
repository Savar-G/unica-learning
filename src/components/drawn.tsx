// Site-only helpers: scroll-reveal wrapper and pencil-thread anchors. Product visuals live in src/ds.
import type { CSSProperties, ReactNode } from "react";

export type Vars = CSSProperties & Record<`--${string}`, string | number>;

export function Knot() {
  return <span className="knot" data-thread aria-hidden="true" />;
}

export function Rise({ as: Tag = "div", d = 0, className = "", children, ...rest }: { as?: "div" | "p" | "h1" | "h2" | "li" | "ul"; d?: number; className?: string; children: ReactNode } & Record<string, unknown>) {
  const T = Tag as "div";
  return (
    <T className={`rise ${className}`.trim()} style={d ? ({ "--d": `${d}s` } as Vars) : undefined} {...rest}>
      {children}
    </T>
  );
}

