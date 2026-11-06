// Read-only NEAR RPC helpers - no wallet needed to view the guard state.
import { CONTRACT_ID, RPC_URL } from "./config";

export interface Policy {
  per_tx_limit: string;
  daily_limit: string;
  spent_in_window: string;
  window_start_ns: number;
  allowed_receivers: string[];
  paused: boolean;
}

export type AccessKeyPermission =
  | "FullAccess"
  | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } };

export interface AccessKeyInfo {
  public_key: string;
  access_key: { nonce: number; permission: AccessKeyPermission };
}

let rpcId = 0;
async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { data?: string; message?: string } };
  if (json.error) throw new Error(json.error.data ?? json.error.message ?? "RPC error");
  return json.result as T;
}

function b64encode(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}
function b64decode(bytes: number[]): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export async function viewFunction<T>(method: string, args: Record<string, unknown>): Promise<T | null> {
  const result = await rpc<{ result: number[] }>("query", {
    request_type: "call_function",
    finality: "final",
    account_id: CONTRACT_ID,
    method_name: method,
    args_base64: b64encode(JSON.stringify(args)),
  });
  const text = b64decode(result.result);
  return text ? (JSON.parse(text) as T) : null;
}

export async function viewAccountBalance(accountId: string): Promise<bigint> {
  const result = await rpc<{ amount: string }>("query", {
    request_type: "view_account",
    finality: "final",
    account_id: accountId,
  });
  return BigInt(result.amount);
}

export async function viewAccessKeys(accountId: string): Promise<AccessKeyInfo[]> {
  const result = await rpc<{ keys: AccessKeyInfo[] }>("query", {
    request_type: "view_access_key_list",
    finality: "final",
    account_id: accountId,
  });
  return result.keys;
}

// --- formatting ---
const YOCTO = 10n ** 24n;
export function formatNear(yocto: string | bigint, maxFrac = 4): string {
  const v = typeof yocto === "string" ? BigInt(yocto) : yocto;
  const whole = v / YOCTO;
  const frac = (v % YOCTO).toString().padStart(24, "0").slice(0, maxFrac).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
export function nearToYocto(n: string): string {
  const [whole, frac = ""] = n.trim().split(".");
  return (BigInt(whole || "0") * YOCTO + BigInt((frac + "0".repeat(24)).slice(0, 24) || "0")).toString();
}
