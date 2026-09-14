export class BillingModule {}

export { BillingController } from "./billing.controller.js";
export { BillingService } from "./billing.service.js";

export const billingModuleProviders = Object.freeze(["BillingService"] as const);
export const billingModuleControllers = Object.freeze(["BillingController"] as const);
