import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  forceCenter,
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
  compression?: number;
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
}: Props) {
  const nodesRef = useRef<Map<string, Node>>(new Map());
  const simRef = useRef<Simulation<Node, undefined> | null>(null);
  const [, setTick] = useState(0);

  const cx = width / 2;
  const cy = height / 2;

  // Initialize simulation once
  useEffect(() => {
    const sim = forceSimulation<Node>([])
      .alphaDecay(0.02)
      .velocityDecay(0.35)
      .force("center", forceCenter(cx, cy).strength(0.05))
      .force("x", forceX(cx).strength(0.04))
      .force("y", forceY(cy).strength(0.04))
      .force(
        "collide",
        forceCollide<Node>((d) => (d.r + 2) * compression)
          .strength(1)
          .iterations(4),
      )
      .on("tick", () => {
        // clamp to rectangular bounds (container has overflow:hidden)
        for (const n of nodesRef.current.values()) {
          const r = (n.r + 1) * compression;
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

  // Update collision force when compression or container size changes
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim
      .force("center", forceCenter(cx, cy).strength(0.05))
      .force("x", forceX(cx).strength(0.04))
      .force("y", forceY(cy).strength(0.04))
      .force(
        "collide",
        forceCollide<Node>((d) => (d.r + 2) * compression)
          .strength(1)
          .iterations(4),
      );
    sim.alpha(0.6).restart();
  }, [cx, cy, compression]);

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
      {nodes.map((n) => {
        const color = MACRO_COLORS[n.macro];
        const r = n.r * compression;
        return (
          <motion.button
            key={n.id}
            onClick={() => onRemove(n.id)}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="absolute flex flex-col items-center justify-center rounded-full text-center shadow-lg"
            style={{
              width: r * 2,
              height: r * 2,
              left: (n.x ?? 0) - r,
              top: (n.y ?? 0) - r,
              willChange: "transform, left, top",
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
        );
      })}
    </div>
  );
}
