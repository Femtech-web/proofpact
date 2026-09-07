const MAX_MINERS_BYTES = 4 * 1024 * 1024;

export type MinerSignalMapping = Readonly<{
  labelField?: string;
  confidenceField?: string;
  reasonField?: string;
}>;

export type MinerSignalMap = ReadonlyMap<string, MinerSignalMapping>;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function mapping(value: unknown): MinerSignalMapping | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const labelField = text(source.label_field);
  const confidenceField = text(source.confidence_field);
  const reasonField = text(source.reason_field);
  if (!labelField && !confidenceField && !reasonField) return undefined;
  return Object.freeze({
    ...(labelField ? { labelField } : {}),
    ...(confidenceField ? { confidenceField } : {}),
    ...(reasonField ? { reasonField } : {}),
  });
}

/** Reads each Miner's declared response mapping from Telegraph's free catalog. */
export async function fetchMinerSignalMap(
  nodeUrl: string,
  intent: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<MinerSignalMap> {
  const url = new URL("/api/miners", nodeUrl);
  url.searchParams.set("intent", intent);
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal });
    if (!response.ok) return new Map();
    const bodyText = await response.text();
    if (bodyText.length > MAX_MINERS_BYTES) return new Map();
    const body = JSON.parse(bodyText) as unknown;
    const miners = Array.isArray(body)
      ? body
      : body && typeof body === "object" && Array.isArray((body as { miners?: unknown }).miners)
        ? (body as { miners: unknown[] }).miners
        : [];
    const result = new Map<string, MinerSignalMapping>();
    for (const entry of miners) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const miner = entry as Record<string, unknown>;
      const id = typeof miner.id === "number" ? String(miner.id) : text(miner.id);
      const declared = mapping(miner.signal_mapping);
      if (id && declared) result.set(id, declared);
    }
    return result;
  } catch {
    return new Map();
  }
}

export function readMappedField(payload: Record<string, unknown>, path: string): unknown {
  let current: unknown = payload;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
