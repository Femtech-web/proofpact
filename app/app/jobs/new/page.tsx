import { randomUUID } from "node:crypto";
import { PactForm } from "./pact-form";
import styles from "../../workspace.module.css";
import { POLICY_PACKS, type PolicyPackId } from "@/features/policies/domain/policy-pack";

export const dynamic = "force-dynamic";

export default async function NewPactPage({ searchParams }: { searchParams: Promise<{ pack?: string }> }) {
  const requested = (await searchParams).pack;
  const initialPolicyPack = POLICY_PACKS.some((pack) => pack.id === requested)
    ? requested as PolicyPackId
    : "secure-delivery";
  return (
    <section className={styles.formPage}>
      <header><p>New agreement</p><h1>Create a verifiable pact</h1><span>Choose a policy pack and define measurable acceptance criteria. Funding remains a separate wallet transaction so database state can never impersonate onchain custody.</span></header>
      <PactForm idempotencyKey={`web-${randomUUID()}`} initialPolicyPack={initialPolicyPack} />
    </section>
  );
}
