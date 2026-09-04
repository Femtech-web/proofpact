import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeContent: "center", gap: 18, padding: 24, textAlign: "center" }}>
      <p style={{ margin: 0, color: "#6ee7e1", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em" }}>PACT NOT FOUND</p>
      <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 64, fontWeight: 400 }}>This proof has no record.</h1>
      <Link href="/app" style={{ color: "#aab3bd" }}>Return to the workspace</Link>
    </main>
  );
}
