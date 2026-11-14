import type { Address } from 'viem';
import { LOCAL, type BankPayout, type DepositInstructions, type Fiat, type Person, type RampAdapter, type Stablecoin, type VerificationStatus } from '@sera-payroll/core';

/**
 * A mock on/off-ramp partner. Deposit instructions with a reference, funds confirmed on
 * demand, verification completes at once, bank payouts move created → sent → arrived on
 * successive status reads. Operators replace this with a real partner adapter.
 */
export class MockRampAdapter implements RampAdapter {
  readonly name: string;
  private payouts = new Map<string, BankPayout & { reads: number }>();
  private verified = new Set<string>();
  private confirmed = new Set<string>();
  constructor(readonly currency: Fiat, partnerName = '[PARTNER NAME]') { this.name = `${partnerName} (mock, ${currency})`; }
  get stablecoin(): Stablecoin { return LOCAL[this.currency]; }
  async getDepositInstructions(clientId: string, amount: string, currency: Fiat): Promise<DepositInstructions> {
    return { reference: `PAYRUN-${clientId.slice(-4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`, beneficiary: '[ON-RAMP PARTNER ACCOUNT]', accountDetails: { bank: '[PARTNER BANK]', account: '[ACCOUNT NUMBER]' }, amount, currency, expiresAt: new Date(Date.now() + 86_400_000) };
  }
  markReceived(reference: string): void { this.confirmed.add(reference); }
  async confirmFundsReceived(reference: string) { return { received: this.confirmed.has(reference), stablecoin: this.stablecoin, amount: null }; }
  async startEmployeeVerification(person: Pick<Person, 'id' | 'name'>, returnUrl: string) {
    this.verified.add(person.id);
    return { url: returnUrl, partnerReference: `mock-kyc-${person.id}` };
  }
  async getVerificationStatus(partnerReference: string): Promise<VerificationStatus> { return this.verified.has(partnerReference.replace('mock-kyc-', '')) || partnerReference.startsWith('mock-kyc-') ? 'verified' : 'not_started'; }
  async createBankPayout(_partnerReference: string, _amount: string, _currency: Fiat, idempotencyKey: string): Promise<BankPayout> {
    const existing = this.payouts.get(idempotencyKey);
    if (existing) return existing;
    const p = { id: `mock-bank-${idempotencyKey}`, status: 'created' as const, depositAddress: '0x000000000000000000000000000000000000Ba5e' as Address, stablecoin: this.stablecoin, reason: null, reads: 0 };
    this.payouts.set(idempotencyKey, p);
    return p;
  }
  async getPayoutStatus(payoutId: string): Promise<BankPayout> {
    const key = payoutId.replace('mock-bank-', '');
    const p = this.payouts.get(key);
    if (!p) return { id: payoutId, status: 'failed', depositAddress: '0x000000000000000000000000000000000000Ba5e', stablecoin: this.stablecoin, reason: 'Unknown payout' };
    p.reads++;
    if (p.status === 'created') p.status = 'sent';
    else if (p.status === 'sent') p.status = 'arrived';
    return p;
  }
}
