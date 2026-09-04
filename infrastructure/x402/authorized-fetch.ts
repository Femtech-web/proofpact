import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { selectBaseSepoliaPayment } from "./payment-policy";

const BASE_SEPOLIA_NETWORK = "eip155:84532";
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

export interface AuthorizedPayment {
  readonly network: typeof BASE_SEPOLIA_NETWORK;
  readonly asset: "BASE_SEPOLIA_USDC";
  readonly amountUsdc: number;
  readonly payTo: `0x${string}`;
  readonly maxTimeoutSeconds: number;
}

export interface AuthorizedX402FetchOptions {
  readonly privateKey: `0x${string}`;
  readonly maxCostUsdc: number;
  readonly authorizePayment: (payment: AuthorizedPayment) => boolean | Promise<boolean>;
  readonly fetchImpl?: typeof fetch;
  readonly baseSepoliaRpcUrl?: string;
}

export function createAuthorizedX402Fetch(options: AuthorizedX402FetchOptions): typeof fetch {
  if (!PRIVATE_KEY.test(options.privateKey)) throw new TypeError("privateKey must be a 32-byte hex value");
  if (typeof options.authorizePayment !== "function") throw new TypeError("authorizePayment is required");

  const account = privateKeyToAccount(options.privateKey);
  const fetchImpl = options.fetchImpl ?? fetch;
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(options.baseSepoliaRpcUrl) });
  const signer = toClientEvmSigner(account, publicClient);
  const x402 = new x402Client().register(BASE_SEPOLIA_NETWORK, new ExactEvmScheme(signer));
  const paidFetch = wrapFetchWithPayment(fetchImpl, x402);

  return async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const firstResponse = await fetchImpl(request.clone());
    if (firstResponse.status !== 402) return firstResponse;

    const challengeHeader = firstResponse.headers.get("payment-required");
    if (!challengeHeader) throw new Error("402 response did not include PAYMENT-REQUIRED");
    const payment = selectBaseSepoliaPayment(challengeHeader, options.maxCostUsdc);
    const approved = await options.authorizePayment({
      network: BASE_SEPOLIA_NETWORK,
      asset: "BASE_SEPOLIA_USDC",
      amountUsdc: payment.amountUsdc,
      payTo: payment.payTo,
      maxTimeoutSeconds: payment.maxTimeoutSeconds,
    });
    if (!approved) throw new Error("Payment was not explicitly authorized");

    return paidFetch(request.clone());
  };
}
