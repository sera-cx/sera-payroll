CREATE TABLE "address_events" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"client_id" text NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"old_address" text,
	"new_address" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" text NOT NULL,
	"label" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" text NOT NULL,
	"client_id" text,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject" text,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" text NOT NULL,
	"name" text NOT NULL,
	"fee_percent" numeric(38, 10) NOT NULL,
	"settings" jsonb NOT NULL,
	"treasury_wallet" text,
	"signers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"balances" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"status_code" integer NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"token" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"client_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"subject" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" text NOT NULL,
	"client_id" text,
	"to_email" text,
	"to_name" text NOT NULL,
	"subject" text NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider" text DEFAULT 'outbox' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text NOT NULL,
	"settings" jsonb NOT NULL,
	"signer_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"idx" integer NOT NULL,
	"label" text NOT NULL,
	"pay_date" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"funding_source" text NOT NULL,
	"funded" boolean DEFAULT false NOT NULL,
	"next_drafted" boolean DEFAULT false NOT NULL,
	"funding_reference" text,
	"one_offs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"totals" jsonb,
	"rates" jsonb,
	"rate_source" text,
	"prepared_by" text,
	"approved_by" text,
	"signed_with" text,
	"approval_signatures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chain_plan" jsonb,
	"disburse_tx" text,
	"submitted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"line_id" text NOT NULL,
	"client_id" text NOT NULL,
	"person_id" text NOT NULL,
	"option" text NOT NULL,
	"share_percent" integer NOT NULL,
	"amount" numeric(38, 10) NOT NULL,
	"amount_text" text NOT NULL,
	"sub" text NOT NULL,
	"locked_rate" text NOT NULL,
	"usd_value" numeric(38, 10) NOT NULL,
	"needs_swap" boolean NOT NULL,
	"stages" jsonb NOT NULL,
	"stage_index" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"tx_hash" text,
	"swap_tx_hash" text,
	"failure_reason" text,
	"address_snapshot" text,
	"network_snapshot" text,
	"path" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"swap_trade_id" text,
	"swap_reference" text,
	"bank_payout_id" text,
	"will_fail" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"line_id" text NOT NULL,
	"client_id" text NOT NULL,
	"person_id" text NOT NULL,
	"document" jsonb NOT NULL,
	"leaves" jsonb NOT NULL,
	"root" text NOT NULL,
	"doc_hash" text NOT NULL,
	"employer_signature" text,
	"anchor_tx" text,
	"anchor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"monthly_pay" numeric(38, 10) NOT NULL,
	"currency" text NOT NULL,
	"payout_primary" text NOT NULL,
	"payout_secondary" text,
	"split_percent" integer DEFAULT 100 NOT NULL,
	"kyc_status" text DEFAULT 'not_started' NOT NULL,
	"kyc_partner_ref" text,
	"setup_done" boolean DEFAULT false NOT NULL,
	"email" text,
	"invited_at" timestamp with time zone,
	"setup_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugins" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" text NOT NULL,
	"currency" text NOT NULL,
	"country" text NOT NULL,
	"plugin" text DEFAULT 'flat-sample' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ramp_partners" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" text NOT NULL,
	"currency" text NOT NULL,
	"on_ramp" boolean DEFAULT false NOT NULL,
	"off_ramp" boolean DEFAULT false NOT NULL,
	"adapter" text DEFAULT 'mock' NOT NULL,
	"partner_name" text DEFAULT '[PARTNER NAME]' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"client_id" text NOT NULL,
	"person_id" text NOT NULL,
	"person_name" text NOT NULL,
	"person_type" text NOT NULL,
	"kind" text NOT NULL,
	"currency" text NOT NULL,
	"gross" numeric(38, 10) NOT NULL,
	"deduction" numeric(38, 10) NOT NULL,
	"net" numeric(38, 10) NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"one_off_id" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" text NOT NULL,
	"client_id" text,
	"person_id" text,
	"role" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"wallet_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_addresses" (
	"person_id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"address" text,
	"network" text DEFAULT 'ethereum' NOT NULL,
	"source" text,
	"signature" text,
	"locked" boolean DEFAULT false NOT NULL,
	"tested" boolean DEFAULT false NOT NULL,
	"screening_status" text DEFAULT 'unscreened' NOT NULL,
	"screening_reason" text,
	"pending" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"response_code" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_id" text NOT NULL,
	"url" text NOT NULL,
	"events" jsonb NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "address_events" ADD CONSTRAINT "address_events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_run_id_pay_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_line_id_run_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."run_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_id_pay_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ramp_partners" ADD CONSTRAINT "ramp_partners_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_lines" ADD CONSTRAINT "run_lines_run_id_pay_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_addresses" ADD CONSTRAINT "wallet_addresses_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_addresses" ADD CONSTRAINT "wallet_addresses_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "address_events_person_idx" ON "address_events" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "audit_client_idx" ON "audit_log" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "notifications_client_idx" ON "notifications" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "pay_runs_client_idx" ON "pay_runs" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "payouts_run_idx" ON "payouts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "payouts_state_idx" ON "payouts" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_line_idx" ON "payslips" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "payslips_person_idx" ON "payslips" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "people_client_idx" ON "people" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plugins_ccy_idx" ON "plugins" USING btree ("operator_id","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "ramp_partners_ccy_idx" ON "ramp_partners" USING btree ("operator_id","currency");--> statement-breakpoint
CREATE INDEX "run_lines_run_idx" ON "run_lines" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_client_idx" ON "users" USING btree ("client_id");