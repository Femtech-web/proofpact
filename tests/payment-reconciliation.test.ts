import assert from "node:assert/strict";
import test from "node:test";
import { transferFallsWithinAuthorizationWindow } from "../infrastructure/x402/reconcile-authorized-payment";

test("reconciliation never attributes an older equal-value transfer to a new authorization", () => {
  const authorizedAt = 2_000;
  const expiry = 2_062;
  assert.equal(transferFallsWithinAuthorizationWindow(1_900, authorizedAt, expiry), false);
  assert.equal(transferFallsWithinAuthorizationWindow(2_001, authorizedAt, expiry), true);
  assert.equal(transferFallsWithinAuthorizationWindow(2_063, authorizedAt, expiry), false);
});
