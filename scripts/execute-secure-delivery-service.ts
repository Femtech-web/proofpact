import { withPactStore } from "../app/app/_lib/pact-data";
import { executeSecureDeliveryVerification } from "../infrastructure/telegraph/execute-secure-delivery-verification";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const pactId = process.argv.find((argument) => argument.startsWith("--pact="))?.slice(7)
  || required("PROOFPACT_LIVE_PACT_ID");
const authorizedCeiling = 0.12;

if (process.env.PROOFPACT_CONFIRM_PAID_CALL !== "YES"
  || process.env.PROOFPACT_CONFIRM_PACT_ID !== pactId
  || process.env.PROOFPACT_CONFIRM_MAX_AUTHORIZED_USDC !== authorizedCeiling.toFixed(2)) {
  throw new Error(`Explicit authorization missing: confirm pact ${pactId} and maximum ${authorizedCeiling.toFixed(2)} USDC`);
}

const state = await withPactStore(async (store) => {
  const pact = await store.getPact(pactId);
  const submission = await store.getLatestSubmission(pactId);
  if (!pact || !submission) throw new Error("Submitted pact was not found");
  if (pact.status === "SUBMITTED" || pact.status === "HELD") await store.beginVerification(pact.id, submission.id);
  else if (pact.status !== "VERIFYING") throw new Error(`Pact is ${pact.status}, not ready for verification`);
  return { submissionId: submission.id };
});

const result = await executeSecureDeliveryVerification(pactId, authorizedCeiling);
if (result.submissionId !== state.submissionId) {
  throw new Error("Verification result does not match the authorized submission");
}

console.log(JSON.stringify({ status: "SECURE_DELIVERY_VERIFIED", ...result }, null, 2));
