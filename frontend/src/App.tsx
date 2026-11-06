import { useCallback, useEffect, useState } from "react";
import { useNearWallet } from "near-connect-hooks";
import { AGENT_ID, CONTRACT_ID, EXPLORER } from "./config";
import {
  formatNear,
  nearToYocto,
  viewAccessKeys,
  viewAccountBalance,
  viewFunction,
  type AccessKeyInfo,
  type Policy,
} from "./near";
import "./App.css";

const GAS = "30000000000000";

interface GuardState {
  owner: string;
  vaultBalance: bigint;
  policy: Policy | null;
  remaining: string | null;
  keys: AccessKeyInfo[];
}

export default function App() {
  const { signedAccountId, signIn, signOut, callFunction, loading: walletLoading } = useNearWallet();
  const [state, setState] = useState<GuardState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // policy form
  const [perTx, setPerTx] = useState("0.5");
  const [daily, setDaily] = useState("1");
  const [whitelist, setWhitelist] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("1");

  const load = useCallback(async () => {
    try {
      const [owner, vaultBalance, policy, remaining, keys] = await Promise.all([
        viewFunction<string>("get_owner", {}),
        viewAccountBalance(CONTRACT_ID),
        viewFunction<Policy>("get_policy", { agent: AGENT_ID }),
        viewFunction<string>("get_remaining_daily", { agent: AGENT_ID }),
        viewAccessKeys(AGENT_ID),
      ]);
      if (!owner) throw new Error("Contract not initialized");
      setState({ owner, vaultBalance, policy, remaining, keys });
      setError(null);
      if (policy) {
        setPerTx(formatNear(policy.per_tx_limit));
        setDaily(formatNear(policy.daily_limit));
        setWhitelist(policy.allowed_receivers.join(", "));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const isOwner = state !== null && signedAccountId !== "" && signedAccountId === state.owner;

  async function act(label: string, method: string, args: Record<string, unknown>, deposit = "0") {
    setBusy(label);
    setNotice(null);
    try {
      await callFunction({ contractId: CONTRACT_ID, method, args, gas: GAS, deposit });
      setNotice(`${label} submitted. Refreshing on-chain state…`);
      setTimeout(() => void load(), 4000);
    } catch (e) {
      setNotice(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const policy = state?.policy ?? null;
  const remainingPct =
    policy && state?.remaining
      ? Math.max(0, Math.min(100, Number((BigInt(state.remaining) * 100n) / BigInt(policy.daily_limit))))
      : 0;

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🛡️</span>
          <div>
            <h1>AgentSpend Guard</h1>
            <p className="tagline">Give an AI agent money — without giving it the keys to everything.</p>
          </div>
        </div>
        <div className="wallet">
          <span className="badge">NEAR testnet</span>
          {signedAccountId ? (
            <>
              <span className="account">{signedAccountId}</span>
              <button onClick={() => void signOut()}>Sign out</button>
            </>
          ) : (
            <button className="primary" disabled={walletLoading} onClick={() => void signIn()}>
              Connect wallet
            </button>
          )}
        </div>
      </header>

      {error && <div className="banner error">Could not load on-chain state: {error}</div>}
      {notice && <div className="banner">{notice}</div>}

      <main className="grid">
        <section className="card">
          <h2>Guarded vault</h2>
          <dl>
            <dt>Contract</dt>
            <dd>
              <a href={`${EXPLORER}/address/${CONTRACT_ID}`} target="_blank" rel="noreferrer">
                {CONTRACT_ID}
              </a>
            </dd>
            <dt>Owner (policy admin)</dt>
            <dd>{state?.owner ?? "…"}</dd>
            <dt>Vault balance</dt>
            <dd className="big">{state ? `${formatNear(state.vaultBalance)} NEAR` : "…"}</dd>
          </dl>
          <p className="hint">
            Agents never hold vault funds. They can only ask this contract to pay — and the contract checks the
            policy first.
          </p>
        </section>

        <section className="card">
          <h2>
            Agent policy — <span className="mono">{AGENT_ID}</span>
          </h2>
          {!state && <p>Loading…</p>}
          {state && !policy && (
            <p className="status revoked">No active policy — this agent cannot spend (never set, or revoked).</p>
          )}
          {policy && (
            <>
              <p className={`status ${policy.paused ? "paused" : "active"}`}>
                {policy.paused ? "⏸ Paused by owner" : "● Active"}
              </p>
              <dl>
                <dt>Per-transaction limit</dt>
                <dd>{formatNear(policy.per_tx_limit)} NEAR</dd>
                <dt>Daily limit</dt>
                <dd>{formatNear(policy.daily_limit)} NEAR</dd>
                <dt>Spent in current window</dt>
                <dd>{formatNear(policy.spent_in_window)} NEAR</dd>
                <dt>Whitelist</dt>
                <dd>{policy.allowed_receivers.join(", ") || "(none)"}</dd>
              </dl>
              <div className="bar-label">
                <span>Daily budget remaining</span>
                <span>{state?.remaining ? `${formatNear(state.remaining)} NEAR` : "…"}</span>
              </div>
              <div className="bar">
                <div className="fill" style={{ width: `${remainingPct}%` }} />
              </div>
            </>
          )}
        </section>

        <section className="card">
          <h2>Agent's keys (layer 1)</h2>
          <p className="hint">
            The agent account exists on its own, but the demo agent signs only with the restricted key below: it
            can call nothing except <code>spend</code> on the guard contract.
          </p>
          <ul className="keys">
            {state?.keys.map((k) => {
              const perm = k.access_key.permission;
              return (
                <li key={k.public_key}>
                  <code className="mono">{k.public_key.slice(0, 28)}…</code>
                  {perm === "FullAccess" ? (
                    <span className="keytype full">FullAccess (kept offline by the owner)</span>
                  ) : (
                    <span className="keytype fck">
                      FunctionCall → {perm.FunctionCall.receiver_id} · methods [
                      {perm.FunctionCall.method_names.join(", ")}] · allowance{" "}
                      {perm.FunctionCall.allowance ? `${formatNear(perm.FunctionCall.allowance)} NEAR` : "unlimited"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card">
          <h2>Owner controls</h2>
          {!signedAccountId && <p className="hint">Connect the owner wallet to change the policy.</p>}
          {signedAccountId && state && !isOwner && (
            <p className="hint">
              You are signed in as {signedAccountId}. Only the owner ({state.owner}) can change policy — the
              contract rejects admin calls from anyone else.
            </p>
          )}
          <fieldset disabled={!isOwner || busy !== null}>
            <label>
              Per-tx limit (NEAR)
              <input value={perTx} onChange={(e) => setPerTx(e.target.value)} inputMode="decimal" />
            </label>
            <label>
              Daily limit (NEAR)
              <input value={daily} onChange={(e) => setDaily(e.target.value)} inputMode="decimal" />
            </label>
            <label>
              Whitelist (comma-separated account ids)
              <input value={whitelist} onChange={(e) => setWhitelist(e.target.value)} />
            </label>
            <div className="row">
              <button
                className="primary"
                onClick={() =>
                  void act("Set policy", "set_policy", {
                    agent: AGENT_ID,
                    per_tx_limit: nearToYocto(perTx),
                    daily_limit: nearToYocto(daily),
                    allowed_receivers: whitelist
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              >
                {busy === "Set policy" ? "Working…" : "Set policy"}
              </button>
              {policy?.paused ? (
                <button onClick={() => void act("Resume agent", "resume_agent", { agent: AGENT_ID })}>
                  Resume agent
                </button>
              ) : (
                <button onClick={() => void act("Pause agent", "pause_agent", { agent: AGENT_ID })}>
                  Pause agent
                </button>
              )}
              <button className="danger" onClick={() => void act("Revoke agent", "revoke_agent", { agent: AGENT_ID })}>
                Revoke agent
              </button>
            </div>
            <label>
              Top up vault (NEAR)
              <input value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} inputMode="decimal" />
            </label>
            <button onClick={() => void act("Top up", "top_up", {}, nearToYocto(topUpAmount))}>
              {busy === "Top up" ? "Working…" : "Top up vault"}
            </button>
          </fieldset>
        </section>
      </main>

      <footer>
        <p>
          See the agent try — and fail — to break its own policy:{" "}
          <code>cd demo-agent && npm run setup && npm start</code> · Contract activity on{" "}
          <a href={`${EXPLORER}/address/${CONTRACT_ID}`} target="_blank" rel="noreferrer">
            NearBlocks
          </a>
        </p>
      </footer>
    </div>
  );
}
