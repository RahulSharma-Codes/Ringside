import React, { useEffect, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useTransform,
  Variants,
} from "framer-motion";

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

// ── KPI animated counter — Framer Motion spring ───────────────────────────────

export function AnimatedCounter({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();

  // Start at 0; spring to target value. Reduced-motion jumps instantly.
  const motionValue = useMotionValue(shouldReduce ? value : 0);
  const spring = useSpring(motionValue, {
    stiffness: shouldReduce ? 10000 : 120,
    damping:   shouldReduce ? 1000  : 30,
    restDelta: 0.5,
  });
  const rounded = useTransform(spring, Math.round);

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  return <motion.span className={className}>{rounded}</motion.span>;
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
