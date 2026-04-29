import { useMemo } from "react";
import { motion } from "framer-motion";

interface Props {
  size?:    number;
  sealed?:  boolean;
  sealing?: boolean;
}

export function LogoMark({ size = 30, sealed = false, sealing = false }: Props) {
  // Unique IDs per instance — SVG defs are document-global
  const id = useMemo(() => Math.random().toString(36).slice(2, 6), []);
  const frameId = `lf-${id}`;
  const curveId = `lc-${id}`;

  return (
    <motion.svg
      width={size} height={size} viewBox="0 0 36 36" fill="none"
      whileHover={{ filter: "drop-shadow(0 0 7px rgba(124,58,237,0.65))" }}
      transition={{ duration: 0.2 }}
    >
      {/* Outer rounded square — distinct from hexagon */}
      <motion.rect
        x="2" y="2" width="32" height="32" rx="7"
        stroke={`url(#${frameId})`}
        strokeWidth="1.3"
        fill="rgba(124,58,237,0.06)"
        strokeDasharray={sealing ? "128" : "none"}
        animate={
          sealing  ? { strokeDashoffset: [128, 0], opacity: [0.4, 1] } :
          sealed   ? { opacity: [0.7, 1, 0.7] } :
          {}
        }
        transition={{ duration: sealing ? 0.55 : 2.8, repeat: sealed ? Infinity : 0 }}
      />

      {/* Inner tick mark when sealed */}
      {sealed && (
        <motion.rect
          x="5" y="5" width="26" height="26" rx="5"
          stroke="rgba(124,58,237,0.18)" strokeWidth="0.6" fill="none"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* S-curve — the core mark */}
      <motion.path
        d="M12 13.5C12 11.2 14.2 9.5 18 9.5C21.8 9.5 24 11.2 24 13.5C24 15.8 21.8 17.5 18 17.5C14.2 17.5 12 19.2 12 21.5C12 23.8 14.2 25.5 18 25.5C21.8 25.5 24 23.8 24 21.5"
        stroke={`url(#${curveId})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
        animate={
          sealing ? { pathLength: [0, 1], opacity: [0.3, 1] } :
          { opacity: [0.82, 1, 0.82] }
        }
        transition={
          sealing ? { duration: 0.65, ease: "easeOut" } :
          { duration: 3.2, repeat: Infinity }
        }
      />

      {/* Top anchor dot */}
      <motion.circle
        cx="12" cy="13.5" r="1.8"
        fill="#22d3ee"
        animate={
          sealing ? { scale: [0, 1.5, 1], opacity: [0, 1] } :
          { opacity: [0.65, 1, 0.65] }
        }
        transition={sealing ? { duration: 0.35, delay: 0.3 } : { duration: 2.4, repeat: Infinity }}
      />

      {/* Bottom anchor dot */}
      <motion.circle
        cx="24" cy="21.5" r="1.8"
        fill="#9b5cf6"
        animate={
          sealing ? { scale: [0, 1.5, 1], opacity: [0, 1] } :
          { opacity: [0.65, 1, 0.65] }
        }
        transition={sealing ? { duration: 0.35, delay: 0.52 } : { duration: 2.4, repeat: Infinity, delay: 0.4 }}
      />

      <defs>
        <linearGradient id={frameId} x1="2" y1="2" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={curveId} x1="12" y1="9.5" x2="24" y2="25.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#9b5cf6" />
        </linearGradient>
      </defs>
    </motion.svg>
  );
}
