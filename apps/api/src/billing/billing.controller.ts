import {
  BillingService,
  type AttemptChargeInput,
  type BillingPrincipal,
  type ReservationChangeInput,
  type ReserveInput,
} from "./billing.service.js";

export class BillingController {
  constructor(private readonly billing = new BillingService()) {}

  summary(principal: BillingPrincipal, projectId: string) {
    return this.billing.summary(principal, { projectId });
  }

  reserve(principal: BillingPrincipal, body: ReserveInput) {
    return this.billing.reserve(principal, body);
  }

  settle(principal: BillingPrincipal, reservationId: string, body: ReservationChangeInput) {
    return this.billing.settle(principal, reservationId, body);
  }

  release(principal: BillingPrincipal, reservationId: string, body: ReservationChangeInput) {
    return this.billing.release(principal, reservationId, body);
  }

  expire(principal: BillingPrincipal, reservationId: string, body: ReservationChangeInput) {
    return this.billing.expire(principal, reservationId, body);
  }

  recordAttemptCharge(principal: BillingPrincipal, body: AttemptChargeInput) {
    return this.billing.recordAttemptCharge(principal, body);
  }
}
