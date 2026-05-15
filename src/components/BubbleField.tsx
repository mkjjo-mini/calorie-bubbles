import { useEffect, useRef, useState } from "react";
import { motion, useAnimationFrame } from "framer-motion";
import { MACRO_COLORS, MACRO_LABELS, type BubbleEntry } from "@/lib/foods";

interface Props {
  bubbles: BubbleEntry[];
  width: number;
  height: number;
  onRemove: (id: string) => void;
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
}

// Map grams to radius
function radiusFor(grams: number) {
  // sqrt scale so area is proportional to grams
  return Math.max(18, Math.min(70, 10 + Math.sqrt(grams) * 6));
}

export function BubbleField({ bubbles, width, height, onRemove }: Props) {
  const bodiesRef = useRef<Map<string, Body>>(new Map());
  const [, setTick] = useState(0);

  // sync bodies with incoming bubbles
  useEffect(() => {
    const map = bodiesRef.current;
    const incomingIds = new Set(bubbles.map((b) => b.id));
    // remove gone
    for (const id of map.keys()) {
      if (!incomingIds.has(id)) map.delete(id);
    }
    // add new
    for (const b of bubbles) {
      if (!map.has(b.id)) {
        const r = radiusFor(b.grams);
        map.set(b.id, {
          id: b.id,
          x: Math.random() * (width - r * 2) + r,
          y: height + r + Math.random() * 40, // spawn just below container
          vx: (Math.random() - 0.5) * 1.2,
          vy: -2 - Math.random() * 1.2, // initial upward velocity
          r,
          macro: b.macro,
          grams: b.grams,
          foodName: b.foodName,
        });
      }
    }
  }, [bubbles, width, height]);

  useAnimationFrame(() => {
    const bodies = Array.from(bodiesRef.current.values());
    const buoyancy = -0.06; // floats up
    const damping = 0.99;
    const restitution = 0.55;

    for (const b of bodies) {
      b.vy += buoyancy;
      b.vx *= damping;
      b.vy *= damping;
      // gentle drift
      b.vx += (Math.random() - 0.5) * 0.05;
      b.vy += (Math.random() - 0.5) * 0.04;

      // terminal upward velocity so they don't fly
      if (b.vy < -2.2) b.vy = -2.2;

      b.x += b.vx;
      b.y += b.vy;

      // walls
      if (b.x - b.r < 0) {
        b.x = b.r;
        b.vx = -b.vx * restitution;
      }
      if (b.x + b.r > width) {
        b.x = width - b.r;
        b.vx = -b.vx * restitution;
      }
      // top - bubbles gather at top
      if (b.y - b.r < 0) {
        b.y = b.r;
        b.vy = -b.vy * restitution;
      }
      // bottom - if somehow they sink, push back up gently
      if (b.y - b.r > height) {
        // off-screen below: keep rising
      }
      if (b.y + b.r > height + 200) {
        b.y = height + 200 - b.r;
        b.vy = -1;
      }
    }

    // collisions
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
            const impulse = -(1 + 0.7) * vn / 2;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
          }
        }
      }
    }

    setTick((t) => (t + 1) % 1000000);
  });

  const bodies = Array.from(bodiesRef.current.values());

  return (
    <div
      className="relative overflow-hidden"
      style={{ width, height }}
    >
      {bodies.map((b) => {
        const color = MACRO_COLORS[b.macro];
        return (
          <motion.button
            key={b.id}
            onClick={() => onRemove(b.id)}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="absolute flex flex-col items-center justify-center rounded-full text-center shadow-lg"
            style={{
              width: b.r * 2,
              height: b.r * 2,
              left: b.x - b.r,
              top: b.y - b.r,
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
