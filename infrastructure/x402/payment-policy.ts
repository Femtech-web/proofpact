const BASE_SEPOLIA_NETWORK = "eip155:84532";
export const BASE_SEPOLIA_USDC_ADDRESS = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL_UNITS = /^(?:0|[1-9][0-9]*)$/;

export interface X402PaymentOption {
  readonly scheme: "exact";
  readonly network: typeof BASE_SEPOLIA_NETWORK;
  readonly asset: string;
  readonly amount: string;
  readonly amountUsdc: number;
  readonly payTo: `0x${string}`;
  readonly maxTimeoutSeconds: number;
  readonly extra?: Readonly<Record<string, unknown>>;
}

export class X402PolicyError extends Error {
  constructor(readonly code: "COST_EXCEEDED" | "INVALID_CHALLENGE" | "NO_COMPATIBLE_PAYMENT", message: string) {
    super(message);
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new X402PolicyError("INVALID_CHALLENGE", `${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function decodeChallenge(header: string): Record<string, unknown> {
  if (typeof header !== "string" || header.length === 0 || header.length > 16 * 1024) {
    throw new X402PolicyError("INVALID_CHALLENGE", "payment challenge is missing or oversized");
  }
  const bytes = Buffer.from(header, "base64");
  if (bytes.length === 0 || bytes.length > 12 * 1024 || bytes.toString("base64").replace(/=+$/, "") !== header.replace(/=+$/, "")) {
    throw new X402PolicyError("INVALID_CHALLENGE", "payment challenge is not canonical base64");
  }
  try {
    return requireRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown, "payment challenge");
  } catch (error) {
    if (error instanceof X402PolicyError) throw error;
    throw new X402PolicyError("INVALID_CHALLENGE", "payment challenge is not valid UTF-8 JSON");
  }
}

function microUsdc(maxCostUsdc: number): bigint {
  if (!Number.isFinite(maxCostUsdc) || maxCostUsdc <= 0 || maxCostUsdc > 1) {
    throw new TypeError("maxCostUsdc must be greater than 0 and at most 1");
  }
  return BigInt(Math.floor(maxCostUsdc * 1_000_000 + Number.EPSILON));
}

function normalizeOption(value: unknown): X402PaymentOption | undefined {
  const option = requireRecord(value, "accepts[]");
  if (option.scheme !== "exact" || option.network !== BASE_SEPOLIA_NETWORK) return undefined;
  if (typeof option.asset !== "string" || option.asset.toLowerCase() !== BASE_SEPOLIA_USDC_ADDRESS) return undefined;
  if (typeof option.amount !== "string" || !DECIMAL_UNITS.test(option.amount) || BigInt(option.amount) === 0n) {
    throw new X402PolicyError("INVALID_CHALLENGE", "compatible payment amount must be positive decimal units");
  }
  if (typeof option.payTo !== "string" || !EVM_ADDRESS.test(option.payTo)) {
    throw new X402PolicyError("INVALID_CHALLENGE", "compatible payment recipient must be an EVM address");
  }
  if (!Number.isSafeInteger(option.maxTimeoutSeconds) || Number(option.maxTimeoutSeconds) < 1) {
    throw new X402PolicyError("INVALID_CHALLENGE", "compatible payment timeout must be a positive integer");
  }
  const extra = option.extra === undefined ? undefined : requireRecord(option.extra, "accepts[].extra");
  return Object.freeze({
    scheme: "exact",
    network: BASE_SEPOLIA_NETWORK,
    asset: option.asset,
    amount: option.amount,
    amountUsdc: Number(BigInt(option.amount)) / 1_000_000,
    payTo: option.payTo as `0x${string}`,
    maxTimeoutSeconds: Number(option.maxTimeoutSeconds),
    ...(extra ? { extra: Object.freeze({ ...extra }) } : {}),
  });
}

export function selectBaseSepoliaPayment(header: string, maxCostUsdc: number): X402PaymentOption {
  const challenge = decodeChallenge(header);
  if (challenge.x402Version !== 2) throw new X402PolicyError("INVALID_CHALLENGE", "x402Version must equal 2");
  if (!Array.isArray(challenge.accepts)) throw new X402PolicyError("INVALID_CHALLENGE", "accepts must be an array");
  const compatible = challenge.accepts
    .map(normalizeOption)
    .filter((option): option is X402PaymentOption => option !== undefined)
    .sort((left, right) => BigInt(left.amount) < BigInt(right.amount) ? -1 : BigInt(left.amount) > BigInt(right.amount) ? 1 : left.payTo.localeCompare(right.payTo));
  const selected = compatible[0];
  if (!selected) throw new X402PolicyError("NO_COMPATIBLE_PAYMENT", "challenge offers no Base Sepolia USDC exact payment");
  if (BigInt(selected.amount) > microUsdc(maxCostUsdc)) {
    throw new X402PolicyError("COST_EXCEEDED", "x402 amount exceeds the configured maximum");
  }
  return selected;
}
