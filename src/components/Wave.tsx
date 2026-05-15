import { motion } from "framer-motion";

export function Wave({ width = 375, height = 40 }: { width?: number; height?: number }) {
  // Two stacked SVG waves drifting horizontally for a soft fluid feel.
  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 right-0 overflow-hidden"
      style={{ height }}
    >
      <motion.svg
        width={width * 2}
        height={height}
        viewBox={`0 0 ${width * 2} ${height}`}
        className="absolute bottom-0 left-0"
        animate={{ x: [0, -width] }}
        transition={{ duration: 10, ease: "linear", repeat: Infinity }}
      >
        <path
          d={`M0 ${height * 0.5}
              Q ${width * 0.25} ${height * 0.1}, ${width * 0.5} ${height * 0.5}
              T ${width} ${height * 0.5}
              T ${width * 1.5} ${height * 0.5}
              T ${width * 2} ${height * 0.5}
              V ${height} H 0 Z`}
          fill="rgba(116, 185, 255, 0.18)"
        />
      </motion.svg>
      <motion.svg
        width={width * 2}
        height={height}
        viewBox={`0 0 ${width * 2} ${height}`}
        className="absolute bottom-0 left-0"
        animate={{ x: [-width, 0] }}
        transition={{ duration: 14, ease: "linear", repeat: Infinity }}
      >
        <path
          d={`M0 ${height * 0.65}
              Q ${width * 0.3} ${height * 0.3}, ${width * 0.6} ${height * 0.65}
              T ${width * 1.2} ${height * 0.65}
              T ${width * 1.8} ${height * 0.65}
              T ${width * 2} ${height * 0.65}
              V ${height} H 0 Z`}
          fill="rgba(255, 215, 0, 0.14)"
        />
      </motion.svg>
    </div>
  );
}
