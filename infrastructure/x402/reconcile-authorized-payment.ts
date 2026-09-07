import "server-only";

import { createPublicClient, getAddress, http, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";
import type { AuthorizedPayment } from "./authorized-fetch";
import { BASE_SEPOLIA_USDC_ADDRESS } from "./payment-policy";

const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const MICRO_USDC = 1_000_000;
const LOOKBACK_BLOCKS = 5_000n;
const EXPIRY_GRACE_SECONDS = 2;

export function transferFallsWithinAuthorizationWindow(
  blockTimestamp: number,
  authorizedAtSeconds: number,
  expiry: number,
): boolean {
  return Number.isSafeInteger(blockTimestamp)
    && blockTimestamp >= authorizedAtSeconds - 2
    && blockTimestamp <= expiry;
}

function paymentUnits(amountUsdc: number): bigint {
  const units = amountUsdc * MICRO_USDC;
  if (!Number.isSafeInteger(units) || units <= 0) throw new TypeError("payment amount must use at most six decimals");
  return BigInt(units);
}

async function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw signal.reason;
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function createExpiredAuthorizationReconciler(options: Readonly<{
  rpcUrl: string;
  payer: `0x${string}`;
  signal: AbortSignal;
  pollIntervalMs?: number;
}>) {
  const payer = getAddress(options.payer);
  const pollIntervalMs = options.pollIntervalMs ?? 2_000;
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(options.rpcUrl),
  });

  return async ({ payment, authorizedAt }: Readonly<{
    payment: AuthorizedPayment;
    attemptNumber: number;
    authorizedAt: string;
    error: unknown;
  }>) => {
    const authorizedAtSeconds = Math.floor(Date.parse(authorizedAt) / 1_000);
    const expiry = authorizedAtSeconds
      + payment.maxTimeoutSeconds
      + EXPIRY_GRACE_SECONDS;
    if (!Number.isFinite(expiry)) throw new TypeError("authorizedAt must be a valid date-time");

    let latestBlock = await publicClient.getBlock({ blockTag: "latest" });
    while (Number(latestBlock.timestamp) <= expiry) {
      await pause(pollIntervalMs, options.signal);
      latestBlock = await publicClient.getBlock({ blockTag: "latest" });
    }

    const fromBlock = latestBlock.number > LOOKBACK_BLOCKS ? latestBlock.number - LOOKBACK_BLOCKS : 0n;
    const expectedUnits = paymentUnits(payment.amountUsdc);
    const logs = await publicClient.getLogs({
      address: BASE_SEPOLIA_USDC_ADDRESS,
      event: TRANSFER_EVENT,
      args: { from: payer, to: getAddress(payment.payTo) },
      fromBlock,
      toBlock: latestBlock.number,
    });
    // Equal-value x402 transfers to the same facilitator are common. Amount,
    // payer, and recipient alone can falsely match an older request. Bind the
    // reconciliation evidence to this authorization's exact time window.
    let matchingTransfer: (typeof logs)[number] | undefined;
    for (const log of logs.filter((candidate) => candidate.args.value === expectedUnits).reverse()) {
      const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
      const timestamp = Number(block.timestamp);
      if (transferFallsWithinAuthorizationWindow(timestamp, authorizedAtSeconds, expiry)) {
        matchingTransfer = log;
        break;
      }
    }

    if (matchingTransfer) {
      return Object.freeze({
        state: "SETTLED" as const,
        evidence: Object.freeze({
          chainId: 84532,
          transactionHash: matchingTransfer.transactionHash,
          blockNumber: matchingTransfer.blockNumber.toString(),
          amountMicroUsdc: expectedUnits.toString(),
          authorizedAt,
          authorizationExpiredAt: new Date(expiry * 1_000).toISOString(),
        }),
      });
    }

    return Object.freeze({
      state: "EXPIRED_UNSETTLED" as const,
      evidence: Object.freeze({
        chainId: 84532,
        checkedThroughBlock: latestBlock.number.toString(),
        authorizationExpiredAt: new Date(expiry * 1_000).toISOString(),
        amountMicroUsdc: expectedUnits.toString(),
        recipient: getAddress(payment.payTo),
      }),
    });
  };
}
