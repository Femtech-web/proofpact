import { NextResponse } from "next/server";
import { withPactStoreRead } from "@/app/app/_lib/pact-data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pactId: string }> },
) {
  const { pactId } = await params;
  try {
    const result = await withPactStoreRead(async (store) => {
      const [pact, submission, receipt] = await Promise.all([
        store.getPact(pactId),
        store.getLatestSubmission(pactId),
        store.getLatestReceiptForPact(pactId),
      ]);
      return { pact, submission, receipt };
    });
    if (!result.pact) {
      return NextResponse.json({ error: "Pact not found." }, { status: 404 });
    }

    const currentReceipt = result.receipt && result.submission
      && result.receipt.submissionId === result.submission.id
      ? result.receipt
      : undefined;

    return NextResponse.json({
      pactStatus: result.pact.status,
      submissionId: result.submission?.id,
      receipt: currentReceipt ? {
        id: currentReceipt.id,
        decision: currentReceipt.decision,
      } : null,
    }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Verification status is temporarily unavailable." },
      { status: 503, headers: { "cache-control": "no-store", "retry-after": "2" } },
    );
  }
}
