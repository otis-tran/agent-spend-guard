# AgentSpend Guard — policy contract

Rust smart contract (near-sdk) that acts as a guarded vault for AI agents on
NEAR testnet. The owner funds it with `top_up` and sets per-agent policies;
agents can only extract funds through `spend`, which enforces the policy
on-chain.

Methods:

- `new(owner)` — initialize
- `set_policy(agent, per_tx_limit, daily_limit, allowed_receivers)` — owner only; also resets the agent's daily window
- `pause_agent` / `resume_agent` / `revoke_agent(agent)` — owner only
- `spend(receiver, amount)` — agent call; panics with `BLOCKED: …` when there is no policy, the agent is paused, the receiver is not whitelisted, or a limit would be exceeded
- `get_owner` / `get_policy(agent)` / `get_remaining_daily(agent)` — views

Build & test:

```bash
cargo test --lib        # 11 unit tests
cargo near build non-reproducible-wasm
```

Deployed on testnet at `guard.agentspendguard.testnet` — see `../DEPLOY.md`.
