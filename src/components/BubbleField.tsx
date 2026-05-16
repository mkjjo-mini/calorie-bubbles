import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  forceCollide,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import { MACRO_COLORS, type BubbleEntry } from "@/lib/foods";

interface Props {
  bubbles: BubbleEntry[];
  width: number;
  height: number;
  onRemove: (id: string) => void;
  /** <1 shrinks the collision radius so bubbles visually overlap (cramped). */
  compression?: number;
  /** 0..1+: how full the bowl is. Drives where bubbles settle vertically. */
  fillness?: number;
}

interface Node extends SimulationNodeDatum {
  id: string;
  r: number; // base radius
  macro: BubbleEntry["macro"];
  grams: number;
  foodName: string;
}

function radiusFor(grams: number) {
  return Math.max(18, Math.min(70, 10 + Math.sqrt(grams) * 6));
}

export function BubbleField({
  bubbles,
  width,
  height,
  onRemove,
  compression = 1,
  fillness = 0,
}: Props) {
  const nodesRef = useRef<Map<string, Node>>(new Map());
  const simRef = useRef<Simulation<Node, undefined> | null>(null);
  const [, setTick] = useState(0);

  const cx = width / 2;
  // Always pull bubbles to the bottom (the "water surface"). Stacking
  // upward happens naturally via collisions — no mid-bowl anchor.
  const f = Math.min(1, Math.max(0, fillness));
  const anchorY = height - 4;
  // Lighter gravity so bubbles stack tall and fill the bowl rather than
  // clumping near the bottom. Eases off further as the bowl fills.
  const yStrength = 0.07 - 0.04 * f;

  // Initialize simulation once
  useEffect(() => {
    const sim = forceSimulation<Node>([])
      .alphaDecay(0.02)
      .velocityDecay(0.35)
      .force("x", forceX(cx).strength(0.05))
      .force("y", forceY(anchorY).strength(yStrength))
      .force(
        "collide",
        forceCollide<Node>((d) => (d.r + 2) * compression)
          .strength(1)
          .iterations(4),
      )
      .on("tick", () => {
        // clamp to rectangular bounds (container has overflow:hidden)
        for (const n of nodesRef.current.values()) {
          const r = n.r + 1; // visual radius for clamping
          if (n.x! < r) n.x = r;
          if (n.x! > width - r) n.x = width - r;
          if (n.y! < r) n.y = r;
          if (n.y! > height - r) n.y = height - r;
        }
        setTick((t) => (t + 1) % 1000000);
      });
    simRef.current = sim;
    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update forces when compression / fillness / size change
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim
      .force("x", forceX(cx).strength(0.05))
      .force("y", forceY(anchorY).strength(yStrength))
      .force(
        "collide",
        forceCollide<Node>((d) => (d.r + 2) * compression)
          .strength(compression < 1 ? 0.85 : 1)
          .iterations(4),
      );
    sim.alpha(0.6).restart();
  }, [cx, anchorY, yStrength, compression]);

  // Sync nodes with bubbles prop
  useEffect(() => {
    const map = nodesRef.current;
    const incomingIds = new Set(bubbles.map((b) => b.id));

    // remove gone
    let changed = false;
    for (const id of Array.from(map.keys())) {
      if (!incomingIds.has(id)) {
        map.delete(id);
        changed = true;
      }
    }
    // add new — drop them in from above near center to "push" existing aside
    for (const b of bubbles) {
      if (!map.has(b.id)) {
        const r = radiusFor(b.grams);
        map.set(b.id, {
          id: b.id,
          r,
          macro: b.macro,
          grams: b.grams,
          foodName: b.foodName,
          x: cx + (Math.random() - 0.5) * 20,
          y: 10 + Math.random() * 20,
          vx: 0,
          vy: 2,
        });
        changed = true;
      }
    }

    const sim = simRef.current;
    if (!sim || !changed) return;
    sim.nodes(Array.from(map.values()));
    sim.alpha(0.9).restart();
  }, [bubbles, cx]);

  const nodes = Array.from(nodesRef.current.values());

  return (
    <div className="relative overflow-hidden" style={{ width, height }}>
      <AnimatePresence>
        {nodes.map((n, i) => {
          const color = MACRO_COLORS[n.macro];
          const r = n.r;
          // deterministic per-bubble phase so each sways differently
          const phase = (i * 0.37) % 1;
          const swayDur = 3.6 + (i % 5) * 0.4;
          const swayAmp = 3 + (n.r % 4); // px
          return (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute"
              style={{
                width: r * 2,
                height: r * 2,
                left: (n.x ?? 0) - r,
                top: (n.y ?? 0) - r,
                willChange: "transform, left, top",
              }}
            >
              <motion.button
                onClick={() => onRemove(n.id)}
                animate={{
                  y: [0, -swayAmp, 0, swayAmp * 0.7, 0],
                  x: [0, swayAmp * 0.5, 0, -swayAmp * 0.5, 0],
                  rotate: [0, swayAmp * 0.3, 0, -swayAmp * 0.3, 0],
                }}
                transition={{
                  duration: swayDur,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: -phase * swayDur,
                }}
                className="w-full h-full flex flex-col items-center justify-center rounded-full text-center shadow-lg"
                style={{
                  background: `radial-gradient(circle at 30% 30%, ${color}ee, ${color}aa 60%, ${color}66)`,
                  boxShadow: `inset -6px -8px 14px ${color}55, 0 4px 10px ${color}44`,
                  border: `1px solid ${color}`,
                }}
                aria-label={`${n.foodName} 제거`}
              >
                {r >= 20 && (
                  <span
                    className="text-[13px] font-semibold leading-tight px-1 break-words max-w-full"
                    style={{
                      color: n.macro === "carbs" ? "#333" : "#fff",
                    }}
                  >
                    {n.foodName}
                  </span>
                )}
              </motion.button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
