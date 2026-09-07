"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./workspace.module.css";

const LINKS = [
  { href: "/app", label: "Overview", section: "overview" },
  { href: "/app/pacts", label: "Pacts", section: "pacts" },
  { href: "/app/policies", label: "Policy packs", section: "policies" },
  { href: "/app/receipts", label: "Receipts", section: "receipts" },
] as const;

function isActive(pathname: string, section: (typeof LINKS)[number]["section"]): boolean {
  if (section === "pacts") return pathname === "/app/pacts" || pathname === "/app/jobs/new" || pathname.startsWith("/app/jobs/");
  if (section === "policies") return pathname === "/app/policies" || pathname.startsWith("/app/policies/");
  if (section === "receipts") return pathname === "/app/receipts" || pathname.startsWith("/app/receipts/");
  return pathname === "/app";
}

export function WorkspaceNav() {
  const pathname = usePathname();
  return <nav aria-label="Workspace navigation">
    {LINKS.map((link) => {
      const active = isActive(pathname, link.section);
      return <Link
        key={link.href}
        href={link.href}
        className={active ? styles.activeNav : undefined}
        aria-current={active ? "page" : undefined}
      >{link.label}</Link>;
    })}
  </nav>;
}
