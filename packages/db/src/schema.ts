/**
 * Build notes section 8, as Drizzle tables. Every tenant table carries client_id
 * (and operator_id where it is useful) so every query can be scoped. Money is
 * `numeric` and travels through TypeScript as a decimal string, never a float.
 */
import { boolean, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';

const money = (name: string) => numeric(name, { precision: 38, scale: 10 });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const operators = pgTable('operators', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  brand: text('brand').notNull(),
  settings: jsonb('settings').$type<{ addressHoldHours: number }>().notNull(),
  signerAddress: text('signer_address'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export interface ClientSettingsRow { twoPerson: boolean; multisig: boolean; schedule: string; gasPayer: 'employer' | 'employee'; requireTestPayment: boolean; defaultFunding?: string }

export const clients = pgTable('clients', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull().references(() => operators.id),
  name: text('name').notNull(),
  feePercent: money('fee_percent').notNull(),
  settings: jsonb('settings').$type<ClientSettingsRow>().notNull(),
  treasuryWallet: text('treasury_wallet'),
  /** Addresses allowed to sign pay run approvals besides the treasury wallet (multisig owners, demo signers). */
  signers: jsonb('signers').$type<string[]>().notNull().default([]),
  /** Demo balances per stablecoin. Real build reads the chain. */
  balances: jsonb('balances').$type<Record<string, string>>().notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull().references(() => operators.id),
  clientId: text('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  personId: text('person_id'),
  role: text('role').$type<'operator_admin' | 'preparer' | 'approver' | 'employee'>().notNull(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  walletAddress: text('wallet_address'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_idx').on(t.email), index('users_client_idx').on(t.clientId)]);

export const people = pgTable('people', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').$type<'Employee' | 'Contractor'>().notNull(),
  monthlyPay: money('monthly_pay').notNull(),
  currency: text('currency').notNull(),
  payoutPrimary: text('payout_primary').notNull(),
  payoutSecondary: text('payout_secondary'),
  splitPercent: integer('split_percent').notNull().default(100),
  kycStatus: text('kyc_status').$type<'not_started' | 'pending' | 'verified' | 'rejected'>().notNull().default('not_started'),
  kycPartnerRef: text('kyc_partner_ref'),
  setupDone: boolean('setup_done').notNull().default(false),
  email: text('email'),
  invitedAt: ts('invited_at'),
  setupAt: ts('setup_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('people_client_idx').on(t.clientId)]);

export interface PendingRow { address: string; source: string; requestedAt: string; liveAt: string }

export const walletAddresses = pgTable('wallet_addresses', {
  personId: text('person_id').primaryKey().references(() => people.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  address: text('address'),
  network: text('network').notNull().default('ethereum'),
  source: text('source'),
  signature: text('signature'),
  locked: boolean('locked').notNull().default(false),
  tested: boolean('tested').notNull().default(false),
  screeningStatus: text('screening_status').notNull().default('unscreened'),
  screeningReason: text('screening_reason'),
  pending: jsonb('pending').$type<PendingRow | null>(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const addressEvents = pgTable('address_events', {
  id: text('id').primaryKey(),
  personId: text('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  oldAddress: text('old_address'),
  newAddress: text('new_address'),
  at: ts('at').notNull().defaultNow(),
}, (t) => [index('address_events_person_idx').on(t.personId)]);

export interface OneOffRow { id: string; personId: string; amount: string; currency: string; kind: string }

export const payRuns = pgTable('pay_runs', {
  id: text('id').primaryKey(),
  clientId: text('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  idx: integer('idx').notNull(),
  label: text('label').notNull(),
  payDate: text('pay_date').notNull(),
  status: text('status').$type<'draft' | 'submitted' | 'sent' | 'complete'>().notNull().default('draft'),
  fundingSource: text('funding_source').notNull(),
  funded: boolean('funded').notNull().default(false),
  /** Set once the employer drafted the run after this one; until then a sent run stays on the Pay run tab. */
  nextDrafted: boolean('next_drafted').notNull().default(false),
  fundingReference: text('funding_reference'),
  oneOffs: jsonb('one_offs').$type<OneOffRow[]>().notNull().default([]),
  skipped: jsonb('skipped').$type<string[]>().notNull().default([]),
  totals: jsonb('totals').$type<Record<string, unknown>>(),
  /** Rates locked at signing, units per USD. */
  rates: jsonb('rates').$type<Record<string, string>>(),
  rateSource: text('rate_source'),
  preparedBy: text('prepared_by'),
  approvedBy: text('approved_by'),
  signedWith: text('signed_with'),
  approvalSignatures: jsonb('approval_signatures').$type<{ signer: string; signature: string }[]>().notNull().default([]),
  chainPlan: jsonb('chain_plan').$type<Record<string, unknown> | null>(),
  disburseTx: text('disburse_tx'),
  submittedAt: ts('submitted_at'),
  sentAt: ts('sent_at'),
  completedAt: ts('completed_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('pay_runs_client_idx').on(t.clientId)]);

export const runLines = pgTable('run_lines', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => payRuns.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  personId: text('person_id').notNull(),
  personName: text('person_name').notNull(),
  personType: text('person_type').notNull(),
  kind: text('kind').notNull(),
  currency: text('currency').notNull(),
  gross: money('gross').notNull(),
  deduction: money('deduction').notNull(),
  net: money('net').notNull(),
  skipped: boolean('skipped').notNull().default(false),
  oneOffId: text('one_off_id'),
  position: integer('position').notNull().default(0),
}, (t) => [index('run_lines_run_idx').on(t.runId)]);

export const payouts = pgTable('payouts', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => payRuns.id, { onDelete: 'cascade' }),
  lineId: text('line_id').notNull().references(() => runLines.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  personId: text('person_id').notNull(),
  option: text('option').notNull(),
  sharePercent: integer('share_percent').notNull(),
  amount: money('amount').notNull(),
  amountText: text('amount_text').notNull(),
  sub: text('sub').notNull(),
  lockedRate: text('locked_rate').notNull(),
  usdValue: money('usd_value').notNull(),
  needsSwap: boolean('needs_swap').notNull(),
  stages: jsonb('stages').$type<string[]>().notNull(),
  stageIndex: integer('stage_index').notNull().default(0),
  state: text('state').$type<'queued' | 'running' | 'done' | 'failed' | 'held'>().notNull().default('queued'),
  txHash: text('tx_hash'),
  swapTxHash: text('swap_tx_hash'),
  failureReason: text('failure_reason'),
  addressSnapshot: text('address_snapshot'),
  networkSnapshot: text('network_snapshot'),
  path: jsonb('path').$type<{ label: string; sera?: boolean }[]>().notNull(),
  attempts: integer('attempts').notNull().default(0),
  swapTradeId: text('swap_trade_id'),
  swapReference: text('swap_reference'),
  bankPayoutId: text('bank_payout_id'),
  willFail: boolean('will_fail').notNull().default(false),
  position: integer('position').notNull().default(0),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [index('payouts_run_idx').on(t.runId), index('payouts_state_idx').on(t.state)]);

export const payslips = pgTable('payslips', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => payRuns.id, { onDelete: 'cascade' }),
  lineId: text('line_id').notNull(),
  clientId: text('client_id').notNull(),
  personId: text('person_id').notNull(),
  document: jsonb('document').$type<Record<string, unknown>>().notNull(),
  leaves: jsonb('leaves').$type<{ name: string; value: string; salt: string }[]>().notNull(),
  root: text('root').notNull(),
  docHash: text('doc_hash').notNull(),
  employerSignature: text('employer_signature'),
  anchorTx: text('anchor_tx'),
  anchorId: text('anchor_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('payslips_line_idx').on(t.lineId), index('payslips_person_idx').on(t.personId)]);

export const rampPartners = pgTable('ramp_partners', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull().references(() => operators.id),
  currency: text('currency').notNull(),
  onRamp: boolean('on_ramp').notNull().default(false),
  offRamp: boolean('off_ramp').notNull().default(false),
  adapter: text('adapter').notNull().default('mock'),
  partnerName: text('partner_name').notNull().default('[PARTNER NAME]'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [uniqueIndex('ramp_partners_ccy_idx').on(t.operatorId, t.currency)]);

export const plugins = pgTable('plugins', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull().references(() => operators.id),
  currency: text('currency').notNull(),
  country: text('country').notNull(),
  plugin: text('plugin').notNull().default('flat-sample'),
  enabled: boolean('enabled').notNull().default(false),
}, (t) => [uniqueIndex('plugins_ccy_idx').on(t.operatorId, t.currency)]);

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  clientId: text('client_id'),
  toEmail: text('to_email'),
  toName: text('to_name').notNull(),
  subject: text('subject').notNull(),
  kind: text('kind').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  provider: text('provider').notNull().default('outbox'),
  sentAt: ts('sent_at').notNull().defaultNow(),
}, (t) => [index('notifications_client_idx').on(t.clientId)]);

export const webhooks = pgTable('webhooks', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull().references(() => operators.id),
  url: text('url').notNull(),
  events: jsonb('events').$type<string[]>().notNull(),
  secret: text('secret').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  webhookId: text('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull(),
  responseCode: integer('response_code'),
  attempts: integer('attempts').notNull().default(0),
  at: ts('at').notNull().defaultNow(),
});

export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull().references(() => operators.id),
  label: text('label').notNull(),
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  revokedAt: ts('revoked_at'),
}, (t) => [uniqueIndex('api_keys_hash_idx').on(t.keyHash)]);

export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull(),
  clientId: text('client_id'),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  subject: text('subject'),
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
  at: ts('at').notNull().defaultNow(),
}, (t) => [index('audit_client_idx').on(t.clientId)]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const magicLinks = pgTable('magic_links', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
});

export const invites = pgTable('invites', {
  token: text('token').primaryKey(),
  personId: text('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
});

/** Single-use nonces for address proofs and SIWE. */
export const nonces = pgTable('nonces', {
  nonce: text('nonce').primaryKey(),
  purpose: text('purpose').notNull(),
  subject: text('subject'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
});

export const idempotencyKeys = pgTable('idempotency_keys', {
  scope: text('scope').notNull(),
  key: text('key').notNull(),
  statusCode: integer('status_code').notNull(),
  response: jsonb('response').$type<unknown>().notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.scope, t.key] })]);
