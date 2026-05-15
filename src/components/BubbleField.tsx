import { useEffect, useRef, useState } from "react";
import { motion, useAnimationFrame } from "framer-motion";
import { MACRO_COLORS, MACRO_LABELS, type BubbleEntry } from "@/lib/foods";

interface Props {
  bubbles: BubbleEntry[];
  width: number;
  height: number;
  onRemove: (id: string) => void;
  compression?: number;
}

interface Body {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  macro: BubbleEntry["macro"];
  grams: number;
  foodName: string;
  // soft-body squish
  sx: number;
  sy: number;
  vsx: number;
  vsy: number;
  wobblePhase: number;
}

function radiusFor(grams: number) {
  return Math.max(18, Math.min(70, 10 + Math.sqrt(grams) * 6));
}

export function BubbleField({ bubbles, width, height, onRemove }: Props) {
  const bodiesRef = useRef<Map<string, Body>>(new Map());
  const tRef = useRef(0);
  const [, setTick] = useState(0);

  // sync bodies with incoming bubbles
  useEffect(() => {
    const map = bodiesRef.current;
    const incomingIds = new Set(bubbles.map((b) => b.id));
    for (const id of map.keys()) {
      if (!incomingIds.has(id)) map.delete(id);
    }
    for (const b of bubbles) {
      if (!map.has(b.id)) {
        const r = radiusFor(b.grams);
        // spawn from top center with slight horizontal jitter
        map.set(b.id, {
          id: b.id,
          x: width / 2 + (Math.random() - 0.5) * 30,
          y: -r - Math.random() * 30,
          vx: (Math.random() - 0.5) * 1.4,
          vy: 1.2 + Math.random() * 0.6,
          r,
          macro: b.macro,
          grams: b.grams,
          foodName: b.foodName,
          sx: 1,
          sy: 1,
          vsx: 0,
          vsy: 0,
          wobblePhase: Math.random() * Math.PI * 2,
        });
      }
    }
  }, [bubbles, width]);

  function squish(b: Body, axis: "vertical" | "horizontal") {
    if (axis === "vertical") {
      b.sx = 1.12;
      b.sy = 0.88;
    } else {
      b.sx = 0.88;
      b.sy = 1.12;
    }
    b.vsx = 0;
    b.vsy = 0;
  }

  useAnimationFrame((time) => {
    tRef.current = time;
    const bodies = Array.from(bodiesRef.current.values());
    const gravity = 0.18;
    const damping = 0.992;
    const restitution = 0.5;
    const SQUISH_THRESHOLD = 3.5; // only significant impacts trigger squish

    for (const b of bodies) {
      b.vy += gravity;
      b.vx *= damping;
      // tiny horizontal jitter for life-like motion
      b.vx += (Math.random() - 0.5) * 0.03;

      b.x += b.vx;
      b.y += b.vy;

      // walls
      if (b.x - b.r < 0) {
        b.x = b.r;
        if (b.vx < -SQUISH_THRESHOLD) squish(b, "horizontal");
        b.vx = -b.vx * restitution;
      }
      if (b.x + b.r > width) {
        b.x = width - b.r;
        if (b.vx > SQUISH_THRESHOLD) squish(b, "horizontal");
        b.vx = -b.vx * restitution;
      }
      // floor — bubbles stack here
      if (b.y + b.r > height) {
        b.y = height - b.r;
        if (b.vy > SQUISH_THRESHOLD) squish(b, "vertical");
        b.vy = -b.vy * restitution;
        // friction when on floor
        b.vx *= 0.9;
      }
      // soft ceiling
      if (b.y - b.r < -120) {
        b.y = -120 + b.r;
        b.vy = Math.abs(b.vy);
      }
    }

    // bubble-bubble collisions
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const min = a.r + b.r;
        if (dist < min) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = (min - dist) / 2;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const dvx = b.vx - a.vx;
          const dvy = b.vy - a.vy;
          const vn = dvx * nx + dvy * ny;
          if (vn < 0) {
            const impulse = (-(1 + 0.55) * vn) / 2;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;

            // squish along normal direction
            const impactStrength = -vn;
            if (impactStrength > SQUISH_THRESHOLD) {
              const axis = Math.abs(ny) > Math.abs(nx) ? "vertical" : "horizontal";
              squish(a, axis);
              squish(b, axis);
            }
          }
        }
      }
    }

    // spring back to (1,1) — emulates spring(stiffness:180, damping:20) at ~60fps
    const K = 0.05; // stiffness * dt^2
    const D = 0.33; // damping * dt
    for (const b of bodies) {
      // skip if already at rest (avoid useless work)
      if (Math.abs(b.sx - 1) < 0.001 && Math.abs(b.sy - 1) < 0.001 && Math.abs(b.vsx) < 0.001 && Math.abs(b.vsy) < 0.001) {
        b.sx = 1;
        b.sy = 1;
        b.vsx = 0;
        b.vsy = 0;
        continue;
      }
      b.vsx += (1 - b.sx) * K;
      b.vsx *= 1 - D;
      b.sx += b.vsx;
      b.vsy += (1 - b.sy) * K;
      b.vsy *= 1 - D;
      b.sy += b.vsy;
    }

    setTick((t) => (t + 1) % 1000000);
  });

  const bodies = Array.from(bodiesRef.current.values());

  return (
    <div className="relative overflow-hidden" style={{ width, height }}>
      {bodies.map((b) => {
        const color = MACRO_COLORS[b.macro];
        const dispX = b.sx;
        const dispY = b.sy;
        return (
          <motion.button
            key={b.id}
            onClick={() => onRemove(b.id)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute flex flex-col items-center justify-center rounded-full text-center shadow-lg"
            style={{
              width: b.r * 2,
              height: b.r * 2,
              left: b.x - b.r,
              top: b.y - b.r,
              transform: `scale(${dispX}, ${dispY})`,
              transformOrigin: "center",
              willChange: "transform",
              background: `radial-gradient(circle at 30% 30%, ${color}ee, ${color}aa 60%, ${color}66)`,
              boxShadow: `inset -6px -8px 14px ${color}55, 0 6px 16px ${color}55`,
              border: `1px solid ${color}`,
              color: "#1a1a1a",
            }}
            aria-label={`${b.foodName} 제거`}
          >
            {b.r > 28 && (
              <span className="text-[10px] font-medium opacity-80 leading-tight px-1">
                {MACRO_LABELS[b.macro]}
              </span>
            )}
            {b.r > 24 && (
              <span className="text-xs font-bold leading-tight">{b.grams}g</span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
