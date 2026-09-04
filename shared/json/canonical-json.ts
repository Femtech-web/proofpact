import { createHash } from "node:crypto";

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function normalize(value: unknown, ancestors: WeakSet<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON does not support non-finite numbers");
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError("Canonical JSON does not support unsafe integers");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Canonical JSON does not support circular values");
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new TypeError("Canonical JSON does not support sparse arrays");
    }
    ancestors.add(value);
    const result = value.map((child) => normalize(child, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON supports only plain objects");
    }
    if (ancestors.has(record)) throw new TypeError("Canonical JSON does not support circular values");
    ancestors.add(record);
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(record).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (!descriptor || !("value" in descriptor)) throw new TypeError("Canonical JSON does not support accessors");
      if (descriptor.value !== undefined) result[key] = normalize(descriptor.value, ancestors);
    }
    ancestors.delete(record);
    return result;
  }
  throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, new WeakSet<object>()));
}

export function sha256Hex(value: unknown): `0x${string}` {
  const bytes = typeof value === "string" ? value : canonicalJson(value);
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}
