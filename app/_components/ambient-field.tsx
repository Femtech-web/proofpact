"use client";

import { useEffect, useRef } from "react";
import styles from "./landing.module.css";

export function AmbientField() {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        field.style.setProperty("--field-x", `${(event.clientX / window.innerWidth - 0.5) * 32}px`);
        field.style.setProperty("--field-y", `${(event.clientY / window.innerHeight - 0.5) * 24}px`);
      });
    };

    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  return (
    <div ref={fieldRef} className={styles.ambient} aria-hidden="true">
      <div className={styles.auroraA} />
      <div className={styles.auroraB} />
      <div className={styles.scanline} />
    </div>
  );
}
