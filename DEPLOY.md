# AgentSpend Guard - Testnet Deployment

> Deployed 2026-11-07 (Asia/Saigon) at Nicholas's request ("tự tạo đi").
> All accounts are **testnet dev accounts** created locally on this machine.
> They are NOT a personal wallet and must NOT be used as the hackathon prize
> payout account (that must be a mainnet account the human creates himself,
> per HACKATHON.md).

## Accounts

| Role | Account | Initial funds | Notes |
|---|---|---|---|
| Owner (policy admin) | `agentspendguard.testnet` | 10 NEAR from testnet helper | Created via `helper.testnet.near.org` after near-cli's legacy helper endpoint failed; create tx `6swDTeNi2vovAL4GPDfjansKNp5Zrg195pLzMhrtPdUd` |
| Contract | `guard.agentspendguard.testnet` | 4 NEAR from owner | Contract deployed + initialized here |
| Demo agent | `agent1.agentspendguard.testnet` | 1 NEAR from owner | Spends only through the policy contract |

Private keys (FullAccess, generated locally) live ONLY in
`~/.near-credentials/testnet/*.json` on this machine. Never commit them,
never paste them into chat. There is no seed phrase - those files are the
only recovery material for these dev accounts.

## Contract

- Deploy: `cargo near build non-reproducible-wasm`, then
  `near contract deploy guard.agentspendguard.testnet use-file contract/target/near/contract.wasm with-init-call new json-args '{"owner":"agentspendguard.testnet"}' ...`
- Init verified: `get_owner` -> `"agentspendguard.testnet"`
- Vault funded: owner called `top_up` with 2 NEAR (contract balance ~6 NEAR after deploy + top-up)

## Demo policy (live on testnet)

`set_policy` for `agent1.agentspendguard.testnet`:
- per-tx limit: 0.5 NEAR
- daily limit: 1 NEAR
- whitelist: [`agentspendguard.testnet`]

## Verified flows (on-chain, 2026-11-07)

| Flow | Result |
|---|---|
| `spend` 0.2 NEAR agent1 -> owner (in policy) | ✅ succeeded |
| `spend` 0.6 NEAR agent1 -> owner (over per-tx limit) | ⛔ transaction failed, funds not moved |
| `spend` 0.1 NEAR agent1 -> `testnet` (not whitelisted) | ⛔ transaction failed, funds not moved |
| `get_remaining_daily(agent1)` after the above | `0.8 NEAR` - exactly matches only the allowed spend being counted |

Explorer: https://testnet.nearblocks.io/address/guard.agentspendguard.testnet

## Function Call Key (issued 2026-11-07)

The demo agent now holds ONLY a restricted key:

- Public key: `ed25519:DKtrvWTaMzWan5gwW4DrDLYB2TUsJb9fgL8dVyP1TWyH`
- On-chain permission (verified via view_access_key):
  `{"FunctionCall":{"allowance":"0.5 NEAR","method_names":["spend"],"receiver_id":"guard.agentspendguard.testnet"}}`
- Credentials: `~/.near-credentials/testnet/agent1-fck.json` (mode 0600, never commit)
- Issue / re-issue: `cd demo-agent && npm run issue-fck`

## Demo-agent run (captured 2026-11-07)

Commands: `npm run setup` (owner resets the policy) then `npm start`.
Full output: `demo-agent/demo-output.txt`.

| Scenario | Result |
|---|---|
| spend 0.2 NEAR -> owner (in policy) | ✅ ALLOWED - tx [32pgpHgfibtqj4UdTvjgr7NirBL71MEGNi9wH6jdbM2X](https://testnet.nearblocks.io/txns/32pgpHgfibtqj4UdTvjgr7NirBL71MEGNi9wH6jdbM2X) |
| spend 0.6 NEAR -> owner (over per-tx limit) | ⛔ BLOCKED: amount exceeds the per-transaction limit |
| spend 0.1 NEAR -> `testnet` (not whitelisted) | ⛔ BLOCKED: receiver is not in the whitelist |
| `pause_agent` called with the spend-only key | ⛔ BLOCKED at the access-key / protocol level, before contract logic |
| Remaining daily after the run | 0.8 NEAR (only the allowed spend counted) |

## Dashboard (built 2026-11-07)

`frontend/` now shows, live from testnet RPC: vault balance, owner, the
agent's policy (limits, spent, remaining with a budget bar), and the agent's
access keys - the FullAccess key vs the spend-only FunctionCall key side by
side. Connect the owner wallet to use the admin controls (set policy,
pause/resume/revoke, top up); the form disables itself for any other account
and the contract rejects non-owner admin calls anyway. Verified: production
build passes, preview serves HTTP 200, and the dashboard's RPC reads match
`near-cli` views. Note: the FCK gas allowance depletes as the agent transacts
(~0.497 NEAR left after the demo runs); delete the key and re-run
`npm run issue-fck` if it ever runs dry.

## GitHub (pushed 2026-11-07)

Public repo: https://github.com/otis-tran/agent-spend-guard
(branch `main`, snapshot commit `203f874435867f53dc863538f8d53d791bdf5839`,
39 files - no `.env`, keys, `node_modules`, `target/` or wasm, per `.gitignore`).

## Next build steps

1. Demo post on X (tag @NEARProtocol, #NEARHackathon) and submission before
   2026-11-14 23:59 UTC.
