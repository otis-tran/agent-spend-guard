# AgentSpend Guard — dashboard

Owner dashboard for the AgentSpend Guard policy contract on NEAR testnet.

- Live read-only state (vault balance, owner, agent policy + remaining daily
  budget, the agent's access keys) fetched straight from the testnet RPC — no
  wallet needed to look.
- Owner controls after connecting the owner wallet (near-connect-hooks):
  set policy, pause / resume / revoke the agent, top up the vault.

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # production build
```

Contract / agent account ids live in `src/config.ts` (defaults are the live
testnet deployment; override with `VITE_CONTRACT_ID` / `VITE_AGENT_ID`).
