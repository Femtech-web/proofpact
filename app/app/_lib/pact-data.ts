import "server-only";

import { createPostgresPactStore } from "@/infrastructure/persistence/postgres-pact-store";

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export async function withPactStore<T>(operation: (
  store: ReturnType<typeof createPostgresPactStore>,
) => Promise<T>): Promise<T> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("ProofPact persistence is not configured");
  const store = createPostgresPactStore(databaseUrl);
  try {
    return await operation(store);
  } finally {
    await store.close();
  }
}

function isTransientConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "CONNECT_TIMEOUT"
    || code === "CONNECTION_CLOSED"
    || /CONNECT_TIMEOUT|connection terminated|connection closed/i.test(error.message);
}

/** Read-only composition with bounded reconnects. Never use this for mutations. */
export async function withPactStoreRead<T>(operation: (
  store: ReturnType<typeof createPostgresPactStore>,
) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const delay of [0, 200, 800]) {
    if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    try {
      return await withPactStore(operation);
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionError(error)) throw error;
    }
  }
  throw lastError;
}
