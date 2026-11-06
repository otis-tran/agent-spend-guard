// Issue the demo agent a Function Call Key (FCK) - one time.
//
// The agent's full-access key is used ONCE here to add a restricted key:
// the new key may only call `spend` on the guard contract, with a limited
// NEAR allowance for gas. The demo agent afterwards signs everything with
// this restricted key only - that restriction is the product's core claim:
// even a fully compromised agent cannot call admin methods, other
// contracts, or transfer funds directly.
//
// Run: npm run issue-fck
import { KeyPair } from "near-api-js";
import fs from "node:fs";
import path from "node:path";
import { AGENT_ID, CONTRACT_ID, accountFromCredentials, credPath, near, provider } from "./lib.js";

const FCK_PATH = path.join(process.env.HOME ?? "", ".near-credentials", "testnet", "agent1-fck.json");
const ALLOWANCE_NEAR = "0.5"; // gas allowance, in NEAR, drawn from the agent account

async function main() {
  if (fs.existsSync(FCK_PATH)) {
    const existing = JSON.parse(fs.readFileSync(FCK_PATH, "utf8")) as { public_key: string };
    const onChain = await provider.viewAccessKey({ accountId: AGENT_ID, publicKey: existing.public_key }).catch(() => null);
    if (onChain) {
      console.log(`FCK already issued and present on-chain: ${existing.public_key}`);
      console.log(`Credentials: ${FCK_PATH}`);
      return;
    }
    console.log("Saved FCK file exists but the key is not on-chain anymore - re-issuing.");
  }

  const agentFull = accountFromCredentials(AGENT_ID, credPath("AGENT_CREDENTIALS_PATH"));
  const keyPair = KeyPair.fromRandom("ed25519");
  const publicKey = keyPair.getPublicKey().toString();

  await agentFull.addFunctionCallAccessKey({
    publicKey,
    contractId: CONTRACT_ID,
    methodNames: ["spend"],
    allowance: near(ALLOWANCE_NEAR),
  });

  fs.mkdirSync(path.dirname(FCK_PATH), { recursive: true });
  fs.writeFileSync(
    FCK_PATH,
    JSON.stringify({ account_id: AGENT_ID, public_key: publicKey, private_key: keyPair.toString() }, null, 2),
    { mode: 0o600 },
  );

  const view = await provider.viewAccessKey({ accountId: AGENT_ID, publicKey });
  console.log("Function Call Key issued for", AGENT_ID);
  console.log("  public key:", publicKey);
  console.log("  permission:", JSON.stringify(view.permission));
  console.log("  credentials saved to:", FCK_PATH, "(mode 0600, never commit this file)");
}

main().catch((e) => {
  console.error("issue-fck failed:", e);
  process.exit(1);
});
