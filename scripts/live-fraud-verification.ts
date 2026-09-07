import { createPublicClient, formatEther, formatUnits, http, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { buildFraudQuestion, type SecureDeliveryFraudInput } from "../features/verification/application/fraud-verification";
import { createPostgresVerificationAttemptStore } from "../infrastructure/persistence/postgres-verification-attempt-store";
import { createLiveFraudVerifier } from "../infrastructure/telegraph/live-fraud-verifier";
import { BASE_SEPOLIA_USDC_ADDRESS } from "../infrastructure/x402/payment-policy";
import { createExpiredAuthorizationReconciler } from "../infrastructure/x402/reconcile-authorized-payment";
import { createManagedDnsFetch } from "../infrastructure/http/managed-dns-fetch";

const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const execute = process.argv.includes("--execute");

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveNumber(name: string, maximum: number): number {
  const value = Number(required(name));
  if (!Number.isFinite(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be greater than 0 and at most ${maximum}`);
  }
  return value;
}

function positiveInteger(name: string, maximum: number): number {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function optionalInput(payer: `0x${string}`): { readonly input?: SecureDeliveryFraudInput; readonly missing: readonly string[] } {
  const names = [
    "PROOFPACT_LIVE_WORKER_ADDRESS",
    "PROOFPACT_LIVE_REPOSITORY_URL",
    "PROOFPACT_LIVE_COMMIT_SHA",
    "PROOFPACT_LIVE_DEPLOYMENT_URL",
    "PROOFPACT_LIVE_CLAIMED_REMEDIATION",
  ] as const;
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) return { missing };
  const workerAddress = required("PROOFPACT_LIVE_WORKER_ADDRESS");
  if (!EVM_ADDRESS.test(workerAddress)) throw new Error("PROOFPACT_LIVE_WORKER_ADDRESS must be an EVM address");
  const requester = process.env.PROOFPACT_LIVE_REQUESTER_ADDRESS?.trim() || payer;
  if (!EVM_ADDRESS.test(requester)) throw new Error("PROOFPACT_LIVE_REQUESTER_ADDRESS must be an EVM address");
  return {
    missing: [],
    input: {
      pactId: process.env.PROOFPACT_LIVE_PACT_ID?.trim() || `live-fraud-${Date.now()}`,
      requesterAddress: requester as `0x${string}`,
      workerAddress: workerAddress as `0x${string}`,
      rewardUsdc: Number(process.env.PROOFPACT_LIVE_REWARD_USDC?.trim() || "800"),
      repositoryUrl: required("PROOFPACT_LIVE_REPOSITORY_URL"),
      commitSha: required("PROOFPACT_LIVE_COMMIT_SHA"),
      deploymentUrl: required("PROOFPACT_LIVE_DEPLOYMENT_URL"),
      claimedRemediation: required("PROOFPACT_LIVE_CLAIMED_REMEDIATION"),
    },
  };
}

const databaseUrl = required("DATABASE_URL");
const nodeUrl = required("TELEGRAPH_ENGINE_URL");
const rpcUrl = required("BASE_SEPOLIA_RPC_URL");
const privateKey = required("TELEGRAPH_PAYER_PRIVATE_KEY");
if (!PRIVATE_KEY.test(privateKey)) throw new Error("TELEGRAPH_PAYER_PRIVATE_KEY must be a 32-byte 0x-prefixed key");
const maxCostUsdc = positiveNumber("TELEGRAPH_MAX_PRICE_USDC", 1);
const maxAttempts = positiveInteger("TELEGRAPH_MAX_ATTEMPTS_PER_INTENT", 3);
const maxAuthorizedCostUsdc = positiveNumber("TELEGRAPH_MAX_TOTAL_COST_USDC", 1);
if (maxAuthorizedCostUsdc < maxCostUsdc) {
  throw new Error("TELEGRAPH_MAX_TOTAL_COST_USDC must be at least TELEGRAPH_MAX_PRICE_USDC");
}

const payer = privateKeyToAccount(privateKey as `0x${string}`).address;
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
const [chainId, nativeBalance, usdcBalance] = await Promise.all([
  publicClient.getChainId(),
  publicClient.getBalance({ address: payer }),
  publicClient.readContract({
    address: BASE_SEPOLIA_USDC_ADDRESS,
    abi: [parseAbiItem("function balanceOf(address account) view returns (uint256)")],
    functionName: "balanceOf",
    args: [payer],
  }),
]);
if (chainId !== baseSepolia.id) throw new Error(`RPC returned chain ${chainId}; expected Base Sepolia ${baseSepolia.id}`);

const liveInput = optionalInput(payer);
const request = liveInput.input ? buildFraudQuestion(liveInput.input) : undefined;
console.log(JSON.stringify({
  mode: execute ? "EXECUTE_REQUESTED" : "PREFLIGHT_ONLY",
  payer,
  chainId,
  balances: {
    nativeEth: formatEther(nativeBalance),
    usdc: formatUnits(usdcBalance, 6),
  },
  limits: {
    maxAttempts,
    maxCostUsdcPerAttempt: maxCostUsdc,
    maxAuthorizedCostUsdc,
  },
  databaseConfigured: Boolean(databaseUrl),
  requestReady: Boolean(request),
  missingRequestFields: liveInput.missing,
  ...(request ? { artifactHash: request.artifactHash } : {}),
}, null, 2));

if (!execute) process.exit(0);
if (!liveInput.input || !request) throw new Error(`Live request is incomplete: ${liveInput.missing.join(", ")}`);
if (process.env.PROOFPACT_CONFIRM_PAID_CALL !== "YES"
  || process.env.PROOFPACT_CONFIRM_MAX_ATTEMPTS !== String(maxAttempts)
  || process.env.PROOFPACT_CONFIRM_MAX_AUTHORIZED_USDC !== String(maxAuthorizedCostUsdc)) {
  throw new Error(
    `Set PROOFPACT_CONFIRM_PAID_CALL=YES, PROOFPACT_CONFIRM_MAX_ATTEMPTS=${maxAttempts}, and PROOFPACT_CONFIRM_MAX_AUTHORIZED_USDC=${maxAuthorizedCostUsdc} for this one bounded run`,
  );
}

const store = createPostgresVerificationAttemptStore(databaseUrl);
const managedFetch = createManagedDnsFetch(process.env.TELEGRAPH_DNS_SERVERS?.trim() || "8.8.8.8");
try {
  const runSignal = AbortSignal.timeout(300_000);
  const verifier = createLiveFraudVerifier({
    nodeUrl,
    baseSepoliaRpcUrl: rpcUrl,
    payerPrivateKey: privateKey as `0x${string}`,
    maxCostUsdc,
    maxAuthorizedCostUsdc,
    maxAttempts,
    requiredDistinctResults: 1,
    attemptStore: store,
    reconcileAuthorizedFailure: createExpiredAuthorizationReconciler({
      rpcUrl,
      payer,
      signal: runSignal,
    }),
    retryDelayMs: ({ attemptNumber, paymentState }) => {
      if (paymentState !== "NOT_AUTHORIZED") return 2_000;
      return attemptNumber === 1 ? 10_000 : 30_000;
    },
    fetchImpl: managedFetch.fetch,
    authorizePayment: async (payment) => {
      const currentBalance = await publicClient.readContract({
        address: BASE_SEPOLIA_USDC_ADDRESS,
        abi: [parseAbiItem("function balanceOf(address account) view returns (uint256)")],
        functionName: "balanceOf",
        args: [payer],
      });
      return currentBalance >= BigInt(Math.ceil(payment.amountUsdc * 1_000_000));
    },
  });
  const result = await verifier.verify(liveInput.input, runSignal);
  console.log(JSON.stringify({
    status: result.complete ? "ROUTE_RECEIVED" : "ROUTE_INCOMPLETE",
    runId: result.runId,
    attempts: result.attempts,
    authorizedCostUsdc: result.authorizedCostUsdc,
    settledCostUsdc: result.settledCostUsdc,
    routes: result.records.map((record) => ({
      minerId: record.minerId,
      minerName: record.minerName,
      verdict: record.verdict,
      confidence: record.confidence,
      signalHash: record.signalHash,
      rawResponseHash: record.rawResponseHash,
      paymentReference: record.paymentReference,
    })),
  }, null, 2));
} finally {
  await Promise.all([store.close(), managedFetch.close()]);
}
