// AgentSpend Guard - policy wallet for AI agents on NEAR (testnet)
// Docs: https://docs.near.org
//
// The contract holds a NEAR vault funded by the owner. Each AI agent is
// registered with an on-chain spending policy set by the owner:
//   - per-transaction limit
//   - daily limit (resets every 24h window, by block timestamp)
//   - whitelist of allowed receivers
//   - pause / revoke switches
// An agent can only move funds out of the vault by calling `spend`, which
// enforces the policy before transferring. An agent whose key is compromised
// (or that is prompt-injected) can therefore never drain more than its
// policy allows, and can never pay an address outside the whitelist.
use near_sdk::json_types::U128;
use near_sdk::store::IterableMap;
use near_sdk::{AccountId, NearToken, PanicOnDefault, Promise, env, near, require};

/// Nanoseconds in 24 hours - the daily-limit window.
const DAY_NS: u64 = 86_400_000_000_000;

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Policy {
    /// Max amount per single spend, in yoctoNEAR.
    pub per_tx_limit: U128,
    /// Max total amount per 24h window, in yoctoNEAR.
    pub daily_limit: U128,
    /// Only these accounts may receive funds from this agent.
    pub allowed_receivers: Vec<AccountId>,
    /// Total spent in the current window, in yoctoNEAR.
    pub spent_in_window: U128,
    /// Start timestamp (ns) of the current window.
    pub window_start_ns: u64,
    /// Paused agents cannot spend until resumed.
    pub paused: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    policies: IterableMap<AccountId, Policy>,
}

#[near]
impl Contract {
    /// Initialize with the owner (policy admin). Usually batched with deploy.
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            policies: IterableMap::new(b"p"),
        }
    }

    // ---------- owner: funding ----------

    /// Fund the vault. Anyone may top up; funds stay in the contract and can
    /// only leave through a policy-checked `spend`.
    #[payable]
    pub fn top_up(&mut self) {
        let amount = env::attached_deposit();
        require!(amount > NearToken::from_yoctonear(0), "Deposit must be positive");
        env::log_str(&format!(
            "TOP_UP by {} amount {}",
            env::predecessor_account_id(),
            amount.as_yoctonear()
        ));
    }

    // ---------- owner: policy admin ----------

    /// Create or replace the policy for an agent. Owner only.
    pub fn set_policy(
        &mut self,
        agent: AccountId,
        per_tx_limit: U128,
        daily_limit: U128,
        allowed_receivers: Vec<AccountId>,
    ) {
        self.assert_owner();
        require!(per_tx_limit.0 > 0, "per_tx_limit must be positive");
        require!(daily_limit.0 >= per_tx_limit.0, "daily_limit must be >= per_tx_limit");
        require!(!allowed_receivers.is_empty(), "Whitelist cannot be empty");
        let policy = Policy {
            per_tx_limit,
            daily_limit,
            allowed_receivers,
            spent_in_window: U128(0),
            window_start_ns: env::block_timestamp(),
            paused: false,
        };
        self.policies.insert(agent.clone(), policy);
        env::log_str(&format!("POLICY_SET agent={agent}"));
    }

    /// Pause an agent immediately (emergency stop). Owner only.
    pub fn pause_agent(&mut self, agent: AccountId) {
        self.assert_owner();
        let mut policy = self.get_policy_or_panic(&agent);
        policy.paused = true;
        self.policies.insert(agent.clone(), policy);
        env::log_str(&format!("AGENT_PAUSED agent={agent}"));
    }

    /// Resume a paused agent. Owner only.
    pub fn resume_agent(&mut self, agent: AccountId) {
        self.assert_owner();
        let mut policy = self.get_policy_or_panic(&agent);
        policy.paused = false;
        self.policies.insert(agent.clone(), policy);
        env::log_str(&format!("AGENT_RESUMED agent={agent}"));
    }

    /// Remove an agent's policy entirely. The agent can no longer spend.
    /// Owner only.
    pub fn revoke_agent(&mut self, agent: AccountId) {
        self.assert_owner();
        self.policies.remove(&agent);
        env::log_str(&format!("AGENT_REVOKED agent={agent}"));
    }

    // ---------- agent: spending ----------

    /// Spend from the vault as an agent. The caller is the agent; the policy
    /// registered for the caller decides whether the spend goes through.
    /// Returns a Promise transferring `amount` to `receiver` when allowed.
    /// Panics (blocking the spend) when any policy rule is violated:
    /// no policy, paused, receiver not whitelisted, over per-tx limit,
    /// or over the daily limit for the current 24h window.
    pub fn spend(&mut self, receiver: AccountId, amount: U128) -> Promise {
        let agent = env::predecessor_account_id();
        require!(amount.0 > 0, "Amount must be positive");

        let mut policy = self.get_policy_or_panic(&agent);
        require!(!policy.paused, "BLOCKED: agent is paused");
        require!(
            policy.allowed_receivers.contains(&receiver),
            "BLOCKED: receiver is not in the whitelist"
        );
        require!(
            amount.0 <= policy.per_tx_limit.0,
            "BLOCKED: amount exceeds the per-transaction limit"
        );

        // Roll the daily window if 24h have elapsed.
        let now = env::block_timestamp();
        if now >= policy.window_start_ns + DAY_NS {
            policy.window_start_ns = now;
            policy.spent_in_window = U128(0);
        }
        let new_spent = policy.spent_in_window.0 + amount.0;
        require!(
            new_spent <= policy.daily_limit.0,
            "BLOCKED: amount exceeds the daily limit"
        );
        policy.spent_in_window = U128(new_spent);
        self.policies.insert(agent.clone(), policy);

        env::log_str(&format!(
            "SPEND_ALLOWED agent={agent} receiver={receiver} amount={}",
            amount.0
        ));
        Promise::new(receiver).transfer(NearToken::from_yoctonear(amount.0))
    }

    // ---------- views ----------

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    /// Full policy for an agent, or None if the agent has no policy.
    /// `spent_in_window` reflects the stored window; callers should treat it
    /// as reset once `window_start_ns + 24h` has passed.
    pub fn get_policy(&self, agent: AccountId) -> Option<Policy> {
        self.policies.get(&agent).cloned()
    }

    /// Amount the agent may still spend in the current window (yoctoNEAR).
    pub fn get_remaining_daily(&self, agent: AccountId) -> U128 {
        match self.policies.get(&agent) {
            None => U128(0),
            Some(policy) => {
                let now = env::block_timestamp();
                if now >= policy.window_start_ns + DAY_NS {
                    policy.daily_limit
                } else {
                    U128(policy.daily_limit.0.saturating_sub(policy.spent_in_window.0))
                }
            }
        }
    }

    // ---------- internals ----------

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "Only the owner can do this"
        );
    }

    fn get_policy_or_panic(&self, agent: &AccountId) -> Policy {
        self.policies
            .get(agent)
            .cloned()
            .unwrap_or_else(|| env::panic_str("BLOCKED: agent has no policy"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::{NearToken, testing_env};

    const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

    fn owner() -> AccountId { accounts(0) }
    fn agent() -> AccountId { accounts(1) }
    fn shop() -> AccountId { accounts(2) }
    fn stranger() -> AccountId { accounts(3) }

    fn context(caller: AccountId, timestamp_ns: u64, deposit: NearToken) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(accounts(5))
            .signer_account_id(caller.clone())
            .predecessor_account_id(caller)
            .block_timestamp(timestamp_ns)
            .attached_deposit(deposit);
        builder
    }

    /// Contract with a policy for `agent`: 2 NEAR per tx, 5 NEAR per day,
    /// only `shop` may receive funds.
    fn contract_with_policy() -> Contract {
        testing_env!(context(owner(), 0, NearToken::from_yoctonear(0)).build());
        let mut contract = Contract::new(owner());
        contract.set_policy(
            agent(),
            U128(2 * NEAR),
            U128(5 * NEAR),
            vec![shop()],
        );
        contract
    }

    #[test]
    fn spend_within_policy_succeeds_and_counts() {
        let mut contract = contract_with_policy();
        testing_env!(context(agent(), 1_000, NearToken::from_yoctonear(0)).build());
        let _ = contract.spend(shop(), U128(2 * NEAR));
        assert_eq!(contract.get_remaining_daily(agent()), U128(3 * NEAR));
    }

    #[test]
    #[should_panic(expected = "BLOCKED: amount exceeds the per-transaction limit")]
    fn spend_over_per_tx_limit_is_blocked() {
        let mut contract = contract_with_policy();
        testing_env!(context(agent(), 1_000, NearToken::from_yoctonear(0)).build());
        let _ = contract.spend(shop(), U128(3 * NEAR));
    }

    #[test]
    #[should_panic(expected = "BLOCKED: receiver is not in the whitelist")]
    fn spend_to_non_whitelisted_receiver_is_blocked() {
        let mut contract = contract_with_policy();
        testing_env!(context(agent(), 1_000, NearToken::from_yoctonear(0)).build());
        let _ = contract.spend(stranger(), U128(1 * NEAR));
    }

    #[test]
    #[should_panic(expected = "BLOCKED: amount exceeds the daily limit")]
    fn cumulative_spend_over_daily_limit_is_blocked() {
        let mut contract = contract_with_policy();
        testing_env!(context(agent(), 1_000, NearToken::from_yoctonear(0)).build());
        let _ = contract.spend(shop(), U128(2 * NEAR));
        let _ = contract.spend(shop(), U128(2 * NEAR));
        // 4 of 5 NEAR spent; one more 2 NEAR spend must be blocked.
        let _ = contract.spend(shop(), U128(2 * NEAR));
    }

    #[test]
    fn daily_window_resets_after_24h() {
        let mut contract = contract_with_policy();
        testing_env!(context(agent(), 1_000, NearToken::from_yoctonear(0)).build());
        let _ = contract.spend(shop(), U128(2 * NEAR));
        assert_eq!(contract.get_remaining_daily(agent()), U128(3 * NEAR));
        // Jump past the 24h window: full daily budget is available again.
        testing_env!(context(agent(), 1_000 + DAY_NS, NearToken::from_yoctonear(0)).build());
        assert_eq!(contract.get_remaining_daily(agent()), U128(5 * NEAR));
        let _ = contract.spend(shop(), U128(2 * NEAR));
    }

    #[test]
    #[should_panic(expected = "BLOCKED: agent is paused")]
    fn paused_agent_cannot_spend() {
        let mut contract = contract_with_policy();
        testing_env!(context(owner(), 1_000, NearToken::from_yoctonear(0)).build());
        contract.pause_agent(agent());
        testing_env!(context(agent(), 2_000, NearToken::from_yoctonear(0)).build());
        let _ = contract.spend(shop(), U128(1 * NEAR));
    }

    #[test]
    #[should_panic(expected = "BLOCKED: agent has no policy")]
    fn revoked_agent_cannot_spend() {
        let mut contract = contract_with_policy();
        testing_env!(context(owner(), 1_000, NearToken::from_yoctonear(0)).build());
        contract.revoke_agent(agent());
        testing_env!(context(agent(), 2_000, NearToken::from_yoctonear(0)).build());
        let _ = contract.spend(shop(), U128(1 * NEAR));
    }

    #[test]
    #[should_panic(expected = "BLOCKED: agent has no policy")]
    fn unknown_agent_cannot_spend() {
        let mut contract = contract_with_policy();
        testing_env!(context(stranger(), 1_000, NearToken::from_yoctonear(0)).build());
        let _ = contract.spend(shop(), U128(1 * NEAR));
    }

    #[test]
    #[should_panic(expected = "Only the owner can do this")]
    fn non_owner_cannot_set_policy() {
        testing_env!(context(owner(), 0, NearToken::from_yoctonear(0)).build());
        let mut contract = Contract::new(owner());
        testing_env!(context(agent(), 0, NearToken::from_yoctonear(0)).build());
        contract.set_policy(agent(), U128(NEAR), U128(NEAR), vec![shop()]);
    }

    #[test]
    fn top_up_accepts_funds() {
        let mut contract = contract_with_policy();
        testing_env!(context(owner(), 1_000, NearToken::from_near(3)).build());
        contract.top_up();
    }

    #[test]
    #[should_panic(expected = "Deposit must be positive")]
    fn top_up_rejects_zero() {
        let mut contract = contract_with_policy();
        testing_env!(context(owner(), 1_000, NearToken::from_yoctonear(0)).build());
        contract.top_up();
    }
}
