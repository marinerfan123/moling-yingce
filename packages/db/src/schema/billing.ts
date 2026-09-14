export const billingSchema = Object.freeze({
  tables: [
    "billing_currency_policies",
    "billing_budgets",
    "usage_reservations",
    "billable_attempts",
    "ledger_movements",
    "attempt_charges",
  ],
  functions: ["reserve_usage", "record_attempt_charge", "release_usage_reservation", "expire_usage_reservations"],
});
