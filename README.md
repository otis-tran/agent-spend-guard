# AgentSpend Guard

**NEAR Hackathon - Track: `security` (AI Security & Defense)**

Give an AI agent money without giving it the keys to everything.

AgentSpend Guard is a policy wallet for AI agents on NEAR testnet. Each agent gets
its own NEAR sub-account and a Function Call Key that can only call the policy
contract. The owner sets on-chain spending policies - per-transaction limit,
daily limit, receiver whitelist. A spend inside the policy goes through; a spend
outside it (overspend, unknown receiver, revoked agent) is blocked on-chain.

Two independent protection layers:

1. **Protocol layer** - the agent holds only a Function Call Key restricted to
   `spend` on the guard contract (with a small gas allowance). It cannot call
   admin methods, other contracts, or move funds directly - even if the agent
   is fully compromised or prompt-injected.
2. **Contract layer** - the policy engine enforces per-tx limit, daily limit
   and the receiver whitelist on-chain, and the owner can pause or revoke an
   agent at any time.

- Network: **testnet only** - no mainnet funds needed to try it.
- Live contract: [`guard.agentspendguard.testnet`](https://testnet.nearblocks.io/address/guard.agentspendguard.testnet) - details in [DEPLOY.md](DEPLOY.md).
- Setup: see [SETUP.md](SETUP.md) (`bash scripts/setup.sh` reproduces the environment).

## Try it (do X -> see Y)

Prerequisites: the environment from SETUP.md and the deployed testnet accounts
from DEPLOY.md.

```bash
cd demo-agent
npm run setup      # owner (re)sets the demo policy: 0.5 NEAR/tx, 1 NEAR/day, whitelist = [owner]
npm run issue-fck  # one time: gives the agent its spend-only Function Call Key
npm start          # the agent runs 4 scenarios against live testnet
```

You will see (full captured run in `demo-agent/demo-output.txt`):

```
Scenario 1 - normal task payment, inside policy:
  ✅ ALLOWED  spend 0.2 NEAR -> agentspendguard.testnet
Scenario 2 - agent is prompt-injected and tries to overspend:
  ⛔ BLOCKED  ... - BLOCKED: amount exceeds the per-transaction limit
Scenario 3 - injected agent tries to pay an unknown wallet:
  ⛔ BLOCKED  ... - BLOCKED: receiver is not in the whitelist
Scenario 4 - compromised agent tries an admin call with its key:
  ⛔ BLOCKED  pause_agent with a spend-only key - rejected before reaching contract logic
Remaining daily budget after demo: 0.8 NEAR
```

## Components

- `contract/` - Rust policy engine (near-sdk). `cargo test --lib`: 11 unit tests
  covering allowed/blocked spends, daily window reset, pause/revoke, admin auth.
- `demo-agent/` - TypeScript agent + owner setup scripts (near-api-js).
- `frontend/` - owner dashboard: live vault/policy/keys view (plain RPC reads, no
  wallet needed) plus owner controls via wallet connect (near-connect-hooks):
  set policy, pause/resume/revoke, top up. Run with `npm run dev` in `frontend/`.
