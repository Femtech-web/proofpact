export type JobStatus = "FUNDED" | "SUBMITTED" | "VERIFYING" | "HELD" | "RELEASED" | "REJECTED";

export type VerificationJob = Readonly<{
  id: string;
  title: string;
  rewardUsdc: number;
  worker: `0x${string}`;
  status: JobStatus;
  artifactUrl?: string;
  createdAt: string;
}>;
