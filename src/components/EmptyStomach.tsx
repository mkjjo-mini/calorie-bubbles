export function EmptyStomach() {
  // Friendly dotted stomach outline with little face.
  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <svg width="120" height="130" viewBox="0 0 120 130" fill="none">
        {/* stomach body */}
        <path
          d="M40 22
             C 38 14, 50 8, 60 12
             C 68 8, 80 12, 82 22
             C 96 26, 104 42, 100 64
             C 98 82, 88 102, 70 110
             C 58 116, 44 112, 34 100
             C 22 86, 18 64, 22 48
             C 24 36, 30 26, 40 22 Z"
          stroke="#cbd5e1"
          strokeWidth="2"
          strokeDasharray="4 4"
          strokeLinejoin="round"
          fill="rgba(248,250,252,0.6)"
        />
        {/* upper duodenum hint */}
        <path
          d="M82 22 C 92 18, 100 22, 102 30"
          stroke="#cbd5e1"
          strokeWidth="2"
          strokeDasharray="3 3"
          strokeLinecap="round"
          fill="none"
        />
        {/* eyes */}
        <circle cx="50" cy="58" r="2.5" fill="#94a3b8" />
        <circle cx="76" cy="58" r="2.5" fill="#94a3b8" />
        {/* mouth */}
        <path
          d="M55 76 Q 63 82, 71 76"
          stroke="#94a3b8"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <p className="text-xs text-neutral-400">배가 비었어요</p>
    </div>
  );
}
