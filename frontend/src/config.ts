// Deployed testnet deployment (see ../DEPLOY.md). These are public account
// ids, safe to ship in the frontend. Override with VITE_* env vars if you
// deploy your own copy.
export const CONTRACT_ID =
  import.meta.env.VITE_CONTRACT_ID ?? "guard.agentspendguard.testnet";
export const AGENT_ID =
  import.meta.env.VITE_AGENT_ID ?? "agent1.agentspendguard.testnet";
export const RPC_URL =
  import.meta.env.VITE_NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
export const EXPLORER = "https://testnet.nearblocks.io";
