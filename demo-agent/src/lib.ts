// Shared helpers for the AgentSpend Guard demo scripts.
// Uses near-api-js v7 (signer-based Account, JsonRpcProvider for views).
import { Account, JsonRpcProvider, type KeyPairString, type SerializedReturnValue } from "near-api-js";
import { config } from "dotenv";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

config({ path: path.resolve(process.cwd(), "../.env") });
config({ path: path.resolve(process.cwd(), ".env") });

export const RPC_URL = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
export const OWNER_ID = required("OWNER_ACCOUNT_ID");
export const CONTRACT_ID = required("CONTRACT_ACCOUNT_ID");
export const AGENT_ID = required("AGENT_ACCOUNT_ID");

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} - copy .env.example to ../.env and fill it in`);
  return v;
}

export function expandHome(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

/** Load an Account signer from a near-cli legacy keychain credentials file.
 * The file's contents (private key / seed phrase) are never printed. */
export function accountFromCredentials(accountId: string, credentialsPath: string): Account {
  const file = expandHome(credentialsPath);
  const creds = JSON.parse(fs.readFileSync(file, "utf8")) as { private_key: string };
  if (!creds.private_key) throw new Error(`No private_key in credentials file for ${accountId}`);
  return new Account(accountId, RPC_URL, creds.private_key as KeyPairString);
}

export function credPath(envName: string): string {
  const v = process.env[envName];
  if (!v) throw new Error(`Missing ${envName} in .env`);
  return v;
}

export const provider = new JsonRpcProvider({ url: RPC_URL });

/** Read-only contract call. Returns the parsed JSON result. */
export async function view<T extends SerializedReturnValue>(method: string, args: Record<string, unknown>): Promise<T> {
  const res = await provider.callFunction<T>({ contractId: CONTRACT_ID, method, args });
  if (res === undefined) throw new Error(`View ${method} returned nothing`);
  return res;
}

export const YOCTO = 10n ** 24n;
export function near(n: string): string {
  // "0.2" -> yocto string, using near-api-js formatting rules via bigint math
  const [whole, frac = ""] = n.split(".");
  const fracPadded = (frac + "0".repeat(24)).slice(0, 24);
  return (BigInt(whole) * YOCTO + BigInt(fracPadded || "0")).toString();
}
export function yoctoToNear(yocto: string): string {
  const v = BigInt(yocto);
  const whole = v / YOCTO;
  const frac = (v % YOCTO).toString().padStart(24, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Best-effort extraction of a human-readable failure reason from a NEAR tx error. */
export function errorText(e: unknown): string {
  try {
    return JSON.stringify(e, (k, v) => (typeof v === "bigint" ? v.toString() : v)) ?? String(e);
  } catch {
    return String(e);
  }
}
export function findBlockedReason(e: unknown): string | null {
  const text = errorText(e);
  const m = text.match(/BLOCKED: [^"\\]+/);
  if (m) return m[0];
  if (/FunctionCall|method|not allowed|access key/i.test(text)) return "rejected at the access-key / protocol level";
  return null;
}
export function txHashOf(res: unknown): string {
  // From an Account.callFunctionRaw outcome: transaction.hash.
  const r = res as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } };
  return r?.transaction?.hash ?? r?.transaction_outcome?.id ?? "(unknown)";
}

/** True when a callFunctionRaw outcome actually executed successfully. */
export function outcomeFailed(res: unknown): boolean {
  const r = res as { status?: unknown; final_execution_status?: string };
  if (r?.status && typeof r.status === "object" && "Failure" in (r.status as object)) return true;
  return false;
}
