# AgentSpend Guard - Environment Setup

> Project: NEAR Hackathon, track `security` (AI Security & Defense), NEAR **testnet only**
> Setup completed: 2026-11-07 (Asia/Saigon). Re-run everything with `bash scripts/setup.sh`.

## Toolchain (verified)

| Tool | Version | Source |
|---|---|---|
| Node.js | v24.22.1 | preinstalled |
| npm | 10.9.4 | preinstalled |
| pnpm | 12.18.0 | `npm install -g pnpm@latest` |
| bun | 1.4.4 | preinstalled |
| Rust / Cargo | 1.99.1 stable | rustup, minimal profile |
| Rust target | `wasm32-unknown-unknown` + host target | `rustup target add` |
| near-cli-rs (`near`) | 0.31.1 | prebuilt binary in `~/workspace/tools/bin/near` |
| cargo-near | 0.23.0 | prebuilt binary in `~/workspace/tools/bin/cargo-near` (+ copy in `~/.cargo/bin`) |
| Git | 2.43.0 | preinstalled |
| Python | 3.12.3 | preinstalled |

PATH needed in every shell: `export PATH="$HOME/.cargo/bin:$HOME/workspace/tools/bin:$PATH"` (also appended to `~/.bashrc`).

## NEAR agent-skills (installed into this project)

Installed with `npx skills add near/agent-skills` -> `.agents/skills/`, locked in `skills-lock.json`.
8 skills present: `near-smart-contracts`, `near-kit`, `near-api-js`, `near-dapp`, `near-ai-cloud`, `near-intents`, `near-cli-rs`, `near-contract-audit`.
Note: the installer also created `agent/skills` symlinks - that is why the demo agent app lives in `demo-agent/`, not `agent/`.

## Project structure

```
agent-spend-guard/
  contract/     Rust policy contract (near-sdk 5.30.1) - AgentSpend Guard policy
                engine implemented 2026-11-07 (see below), replacing the template
  frontend/     Vite + React 19 + TS dashboard
                deps: near-connect-hooks ^1.1.6, @hot-labs/near-connect ^0.11.4, near-api-js ^7.4.0
  demo-agent/   TS demo agent (near-api-js ^7.4.0, tsx, typescript, dotenv)
  .env.example  copy to .env and fill after creating testnet accounts
  scripts/setup.sh
```

## Free testnet resources (per docs.near.org/getting-started/hackathons)

- Testnet NEAR: https://near-faucet.io (2 NEAR, rate limited)
- Testnet USDC: https://faucet.circle.com (20 USDC on NEAR testnet every 2 hours)
- Public RPC (free): https://rpc.testnet.near.org
- NEAR AI Cloud: $10 free credit when joining NEAR Builders (https://nearbuilders.org/join), key at https://cloud.near.ai

## Verified during setup

- Frontend: `npm run build` in `frontend/` - OK
- Demo agent: `npm start` in `demo-agent/` - OK (prints testnet config placeholder)
- NEAR testnet RPC: `status` call to https://rpc.testnet.near.org - OK (`chain_id: testnet`, protocol version 88)
- Contract: `cargo test --lib` - OK, **7 passed / 0 failed** (template unit tests; first full compile took ~6 minutes, target cache now warm at ~822 MB)
- Policy contract (2026-11-07, after Nicholas confirmed track `security`): template auction logic replaced by the AgentSpend Guard policy engine in `contract/src/lib.rs` (owner-set per-tx + daily limits, receiver whitelist, pause/resume/revoke, `spend` enforces policy before transferring from the vault, `top_up` funds the vault). Unit tests: **11 passed / 0 failed** covering allowed spend, per-tx block, whitelist block, daily-limit block, 24h window reset, paused, revoked, unknown agent, non-owner admin, and top-up rules. WASM build verified: `cargo near build non-reproducible-wasm` OK - `contract/target/near/contract.wasm` (136K) + ABI generated, ready to deploy to testnet once the owner account exists.

## Accounts & deployment (done 2026-11-07)

At Nicholas's request ("tự tạo đi"), the testnet dev accounts were created
locally with near-cli instead of in a personal wallet - see `DEPLOY.md` for
account ids, balances, the live demo policy and the verified on-chain flows.
`.env` is filled. These are machine-held dev accounts, **not** a prize
payout account.

Still to do in the build phase: demo-agent TS flows, Function Call Key for
the agent, dashboard wiring, GitHub repo + demo post + submission.
