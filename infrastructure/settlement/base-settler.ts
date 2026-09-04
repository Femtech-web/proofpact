import "server-only";

export type SettlementAuthorization = Readonly<{
  jobId: string;
  receiptHash: `0x${string}`;
  recipient: `0x${string}`;
  amount: bigint;
  deadline: bigint;
  signature: `0x${string}`;
}>;

/** Server-only port implemented by the EIP-712/Base execution adapter. */
export interface BaseSettler {
  release(authorization: SettlementAuthorization): Promise<`0x${string}`>;
}
