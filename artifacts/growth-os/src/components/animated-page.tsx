import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion, Variants } from "framer-motion";

// ── Page transition wrapper ───────────────────────────────────────────────────

export function AnimatedPage({
  children,
  layoutKey,
}: {
  children: React.ReactNode;
  layoutKey: string;
}) {
  const shouldReduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={layoutKey}
        initial={{ opacity: 0, y: shouldReduce ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: shouldReduce ? 0 : -4 }}
        transition={{ duration: shouldReduce ? 0 : 0.18, ease: "easeOut" }}
        style={{ height: "100%" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ── Staggered list / item ─────────────────────────────────────────────────────

const staggerContainerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
};

const staggerItemReducedVariants: Variants = {
  hidden: { opacity: 0 },
  show:   { opacity: 1, transition: { duration: 0 } },
};

export function StaggerList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();
  return (
    <motion.div
      variants={staggerContainerVariants}
      initial="hidden"
      animate="show"
      className={className}
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child) ? (
          <motion.div variants={shouldReduce ? staggerItemReducedVariants : staggerItemVariants}>
            {child}
          </motion.div>
        ) : child
      )}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "tr";
}) {
  const shouldReduce = useReducedMotion();
  const Tag = motion[as] as React.ElementType;
  return (
    <Tag
      variants={shouldReduce ? staggerItemReducedVariants : staggerItemVariants}
      className={className}
    >
      {children}
    </Tag>
  );
}

// ── Stagger container for <table> rows (tbody wrapper) ────────────────────────

export function StaggerTbody({ children }: { children: React.ReactNode }) {
  return (
    <motion.tbody variants={staggerContainerVariants} initial="hidden" animate="show">
      {children}
    </motion.tbody>
  );
}

// ── KPI animated counter ──────────────────────────────────────────────────────

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function useCountUp(target: number, durationMs = 800): number {
  const shouldReduce = useReducedMotion();
  const [count, setCount] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (shouldReduce || target === 0) {
      setCount(target);
      return;
    }
    const startTime = performance.now();
    const startValue = 0;

    const tick = (now: number) => {
      const elapsed = Math.min((now - startTime) / durationMs, 1);
      const eased = easeOutCubic(elapsed);
      setCount(Math.round(startValue + (target - startValue) * eased));
      if (elapsed < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, shouldReduce]);

  return count;
}

export function AnimatedCounter({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const count = useCountUp(value);
  return <span className={className}>{count}</span>;
}

// ── Notification badge with pulse on count change ─────────────────────────────

export function PulsingBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();
  const prevRef = useRef(count);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!shouldReduce && count > prevRef.current) {
      setKey((k) => k + 1);
    }
    prevRef.current = count;
  }, [count, shouldReduce]);

  if (count <= 0) return null;

  return (
    <motion.span
      key={key}
      animate={shouldReduce ? {} : { scale: [1, 1.45, 1] }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={className}
    >
      {count > 99 ? "99+" : count}
    </motion.span>
  );
}
