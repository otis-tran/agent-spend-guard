// AgentSpend Guard - demo agent.
//
// This process holds ONLY the agent's Function Call Key (see issue-fck.ts).
// That key can call nothing but `spend` on the guard contract. Watch what
// the two protection layers do:
//
//   Layer 1 (protocol): the key itself rejects admin methods outright.
//   Layer 2 (contract): the policy rejects overspends and non-whitelisted
//                       receivers on-chain.
//
// Run the full demo:  npm run setup && npm run issue-fck && npm start
import fs from "node:fs";
import path from "node:path";
import {
  AGENT_ID,
  CONTRACT_ID,
  OWNER_ID,
  accountFromCredentials,
  errorText,
  findBlockedReason,
  near,
  outcomeFailed,
  txHashOf,
  view,
  yoctoToNear,
} from "./lib.js";

const FCK_PATH = path.join(process.env.HOME ?? "", ".near-credentials", "testnet", "agent1-fck.json");
const GAS = 30_000_000_000_000n;

async function trySpend(agent: ReturnType<typeof accountFromCredentials>, label: string, receiver: string, amountNear: string) {
  try {
    const res = await agent.callFunctionRaw({
      contractId: CONTRACT_ID,
      methodName: "spend",
      args: { receiver, amount: near(amountNear) },
      gas: GAS,
      deposit: 0n,
    });
    if (outcomeFailed(res)) {
      const reason = findBlockedReason(res) ?? "transaction failed on-chain";
      console.log(`  ⛔ BLOCKED  ${label} - ${reason}`);
      return false;
    }
    const hash = txHashOf(res);
    console.log(`  ✅ ALLOWED  ${label}`);
    console.log(`     tx: https://testnet.nearblocks.io/txns/${hash}`);
    return true;
  } catch (e) {
    const reason = findBlockedReason(e) ?? "transaction failed";
    console.log(`  ⛔ BLOCKED  ${label} - ${reason}`);
    return false;
  }
}

async function main() {
  if (!fs.existsSync(FCK_PATH)) {
    console.error("No Function Call Key found. Run: npm run issue-fck");
    process.exit(1);
  }
  // The demo agent is constructed ONLY from the restricted-key credentials.
  const agent = accountFromCredentials(AGENT_ID, FCK_PATH);

  const remainingBefore = await view<string>("get_remaining_daily", { agent: AGENT_ID });
  console.log(`Agent ${AGENT_ID} (Function Call Key only)`);
  console.log(`Policy budget remaining today: ${yoctoToNear(remainingBefore)} NEAR`);
  console.log("");

  console.log("Scenario 1 - normal task payment, inside policy:");
  await trySpend(agent, `spend 0.2 NEAR -> ${OWNER_ID}`, OWNER_ID, "0.2");

  console.log("Scenario 2 - agent is prompt-injected and tries to overspend:");
  await trySpend(agent, `spend 0.6 NEAR -> ${OWNER_ID} (per-tx limit is 0.5)`, OWNER_ID, "0.6");

  console.log("Scenario 3 - injected agent tries to pay an unknown wallet:");
  await trySpend(agent, `spend 0.1 NEAR -> testnet (not whitelisted)`, "testnet", "0.1");

  console.log("Scenario 4 - compromised agent tries an admin call with its key:");
  try {
    await agent.callFunction({
      contractId: CONTRACT_ID,
      methodName: "pause_agent",
      args: { agent: AGENT_ID },
      gas: GAS,
      deposit: 0n,
    });
    console.log("  ⚠️  UNEXPECTED: admin call went through - investigate!");
  } catch (e) {
    console.log("  ⛔ BLOCKED  pause_agent with a spend-only key - rejected before reaching contract logic");
    if (process.env.VERBOSE) console.log("     raw:", errorText(e).slice(0, 300));
  }

  const remainingAfter = await view<string>("get_remaining_daily", { agent: AGENT_ID });
  console.log("");
  console.log(`Remaining daily budget after demo: ${yoctoToNear(remainingAfter)} NEAR`);
  console.log("Only the in-policy 0.2 NEAR spend was counted. The vault and the owner's wallet were never at risk.");
}

main().catch((e) => {
  console.error("demo-agent failed:", errorText(e).slice(0, 500));
  process.exit(1);
});
