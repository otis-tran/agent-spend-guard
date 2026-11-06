// Owner setup for a clean demo run: (re)sets the agent's policy, which also
// resets the agent's spent-in-window counter, and prints the live state.
// Run: npm run setup
import { AGENT_ID, CONTRACT_ID, OWNER_ID, accountFromCredentials, credPath, near, view, yoctoToNear } from "./lib.js";

const PER_TX = "0.5"; // NEAR
const DAILY = "1"; // NEAR

async function main() {
  const owner = accountFromCredentials(OWNER_ID, credPath("OWNER_CREDENTIALS_PATH"));
  await owner.callFunction({
    contractId: CONTRACT_ID,
    methodName: "set_policy",
    args: {
      agent: AGENT_ID,
      per_tx_limit: near(PER_TX),
      daily_limit: near(DAILY),
      allowed_receivers: [OWNER_ID],
    },
    gas: 30_000_000_000_000n,
    deposit: 0n,
  });
  const remaining = await view<string>("get_remaining_daily", { agent: AGENT_ID });
  console.log(`Policy set for ${AGENT_ID}: per-tx ${PER_TX} NEAR, daily ${DAILY} NEAR, whitelist = [${OWNER_ID}]`);
  console.log(`Remaining daily budget: ${yoctoToNear(remaining)} NEAR`);
}

main().catch((e) => {
  console.error("setup failed:", e);
  process.exit(1);
});
