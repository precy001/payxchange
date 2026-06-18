-- ============================================================================
-- ScanPay — Foundational Schema (PostgreSQL 15+)
-- ----------------------------------------------------------------------------
-- Design principles (the "worst case" reasoning):
--   1. Money is INTEGER kobo. Never floats. No rounding drift, ever.
--   2. The ledger is APPEND-ONLY and double-entry. Balances are DERIVED, not
--      stored as mutable fields, so no row can be silently edited to lose/gain
--      money. A trigger blocks UPDATE/DELETE on ledger_entries.
--   3. Every external-money operation is IDEMPOTENT. Unique constraints make a
--      duplicate webhook / retried request a no-op instead of a double-charge.
--   4. A transaction is a STATE MACHINE with optimistic locking (version col),
--      so concurrent or out-of-order events cannot regress or double-apply.
--   5. Async work goes through a TRANSACTIONAL OUTBOX so "DB committed but queue
--      publish failed" can never silently drop a payout or a refund.
--   6. We HOLD AS LITTLE SENSITIVE DATA AS POSSIBLE. No PAN, no CVV, no BVN at
--      rest. Only Squad tokens / mandate ids / last4. Shrinks breach blast radius.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ---------- enums ----------------------------------------------------------
CREATE TYPE kyc_status        AS ENUM ('none','pending','verified','rejected');
CREATE TYPE funding_type      AS ENUM ('card','mandate');
CREATE TYPE funding_status    AS ENUM ('active','expired','revoked');
CREATE TYPE settlement_mode   AS ENUM ('payout','submerchant');
CREATE TYPE txn_type          AS ENUM ('p2p','merchant');
CREATE TYPE ledger_direction  AS ENUM ('debit','credit');

-- The transaction state machine. Allowed transitions are enforced in the
-- application layer; terminal states are completed / reversed / failed.
CREATE TYPE txn_state AS ENUM (
  'pending',        -- request created, not yet authorized by payer
  'authorized',     -- payer confirmed (biometric + PIN), about to charge
  'payer_charged',  -- collection leg succeeded; funds in our Squad ledger
  'payout_pending', -- payout queued (P2P only; merchant-submerchant skips this)
  'payout_sent',    -- transfer initiated at Squad, awaiting final confirmation
  'completed',      -- payout confirmed delivered (or submerchant settled)
  'payout_failed',  -- payout confirmed failed -> must compensate
  'reversing',      -- refunding the payer (compensation in progress)
  'reversed',       -- payer refunded; money returned
  'failed'          -- collection leg failed; no money moved
);

-- ---------- identity -------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL UNIQUE,           -- E.164. Primary identity in NG.
  email         TEXT UNIQUE,
  full_name     TEXT,
  kyc           kyc_status NOT NULL DEFAULT 'none',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per physical device. Confirmation requests are signed by a
-- device-bound key; biometric unlocks that key ON DEVICE and never leaves it.
CREATE TABLE devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key    TEXT NOT NULL,                  -- device key; backend verifies sigs
  attestation   TEXT,                           -- Play Integrity / App Attest token
  last_seen_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_devices_user ON devices(user_id) WHERE revoked_at IS NULL;

-- PIN is verified SERVER-SIDE with argon2id. Biometric stays on device.
-- Lockout fields throttle brute force.
CREATE TABLE user_credentials (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pin_hash         TEXT NOT NULL,               -- argon2id, never plaintext
  failed_attempts  INT  NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- funding (how the PAYER pays) -----------------------------------
-- We store the Squad token or mandate id, never the card number or BVN.
CREATE TABLE funding_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         funding_type NOT NULL,
  squad_ref    TEXT NOT NULL,                   -- card token OR mandate_id
  brand        TEXT,                            -- 'visa','verve', or bank name
  last4        TEXT,
  bank_code    TEXT,                            -- for mandate funding
  status       funding_status NOT NULL DEFAULT 'active',
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, type, squad_ref)
);
-- At most one default funding source per user.
CREATE UNIQUE INDEX uq_funding_default
  ON funding_sources(user_id) WHERE is_default;

-- ---------- payout (how the PAYEE receives) --------------------------------
-- account_name is captured from Squad's mandatory account lookup. We only ever
-- pay to a destination we have looked up and the receiver confirmed.
CREATE TABLE payout_destinations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_code     TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_name  TEXT NOT NULL,                  -- from /payout/account/lookup
  verified_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, bank_code, account_number)
);
CREATE UNIQUE INDEX uq_payout_default
  ON payout_destinations(user_id) WHERE is_default;

-- Optional business profile. submerchant mode lets Squad settle the business
-- directly, skipping our payout leg (cheaper, no float) for high-volume sellers.
CREATE TABLE merchants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name   TEXT NOT NULL,
  submerchant_id  TEXT,                          -- Squad sub-merchant id, if any
  settlement_mode settlement_mode NOT NULL DEFAULT 'payout',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- payment requests (what a payee asks for; encoded into the QR) ---
-- The QR carries ONLY this id (a signed, single-use reference). All money
-- detail is fetched server-side, so a scanned QR can't be tampered to change
-- the amount. The live single-use token lives in Redis with a short TTL; this
-- row is the durable record.
CREATE TABLE payment_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_user_id UUID NOT NULL REFERENCES users(id),
  type          txn_type NOT NULL,
  amount_kobo   BIGINT NOT NULL CHECK (amount_kobo > 0),
  currency      CHAR(3) NOT NULL DEFAULT 'NGN',
  description   TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,            -- short-lived (seconds/minutes)
  consumed_at   TIMESTAMPTZ,                      -- set once a txn is created
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payreq_payee ON payment_requests(payee_user_id);

-- ---------- transactions (the state machine) -------------------------------
CREATE TABLE transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id UUID NOT NULL REFERENCES payment_requests(id),
  payer_user_id      UUID NOT NULL REFERENCES users(id),
  payee_user_id      UUID NOT NULL REFERENCES users(id),
  funding_source_id  UUID NOT NULL REFERENCES funding_sources(id),
  payout_dest_id     UUID REFERENCES payout_destinations(id), -- null if submerchant
  type               txn_type NOT NULL,
  amount_kobo        BIGINT NOT NULL CHECK (amount_kobo > 0),
  fee_kobo           BIGINT NOT NULL DEFAULT 0 CHECK (fee_kobo >= 0),
  currency           CHAR(3) NOT NULL DEFAULT 'NGN',
  state              txn_state NOT NULL DEFAULT 'pending',
  -- Unique references prevent double-charge / double-payout at Squad. The
  -- collection_ref is our idempotency anchor for the charge leg.
  collection_ref     TEXT NOT NULL UNIQUE,
  -- version powers optimistic locking: UPDATE ... WHERE version = $expected.
  -- A losing concurrent writer gets 0 rows and retries; no lost updates.
  version            INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_txn_state   ON transactions(state);
CREATE INDEX idx_txn_payer   ON transactions(payer_user_id, created_at DESC);
CREATE INDEX idx_txn_payee   ON transactions(payee_user_id, created_at DESC);

-- Payout attempts are SEPARATE rows because Squad requires a brand-new unique
-- reference for every retry, and a 424 timeout must be re-queried (not retried
-- blindly). Each attempt tracks its own ref, NIP session id and requery count.
CREATE TABLE payout_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  payout_ref      TEXT NOT NULL UNIQUE,          -- merchantId_xxx, never reused
  amount_kobo     BIGINT NOT NULL CHECK (amount_kobo > 0),
  status          TEXT NOT NULL DEFAULT 'initiated', -- initiated|sent|success|failed|reversed
  nip_session_id  TEXT,                           -- proof the transfer entered NIP
  requery_count   INT NOT NULL DEFAULT 0,
  last_requery_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payout_txn ON payout_attempts(transaction_id);

-- ---------- the ledger (append-only, double-entry) -------------------------
-- Every money movement writes balanced rows (sum of debits = sum of credits
-- per transaction). Accounts are logical strings, e.g.:
--   'squad:ledger'         our funds held at Squad
--   'payer:<user_id>'      payer's external funding (card/bank)
--   'payee:<user_id>'      payee's external bank
--   'revenue:fees'         our fee income
-- This table is INSERT-ONLY; the trigger below blocks edits.
CREATE TABLE ledger_entries (
  id              BIGSERIAL PRIMARY KEY,
  transaction_id  UUID NOT NULL REFERENCES transactions(id),
  account         TEXT NOT NULL,
  direction       ledger_direction NOT NULL,
  amount_kobo     BIGINT NOT NULL CHECK (amount_kobo > 0),
  currency        CHAR(3) NOT NULL DEFAULT 'NGN',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_txn     ON ledger_entries(transaction_id);
CREATE INDEX idx_ledger_account ON ledger_entries(account, created_at);

CREATE OR REPLACE FUNCTION block_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_immutable
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION block_ledger_mutation();

-- ---------- idempotency (API layer) ----------------------------------------
-- Client sends an Idempotency-Key header on every mutating call. We store the
-- first response and replay it for retries, so a flaky network can never cause
-- two charges. request_hash guards against key reuse with a different body.
CREATE TABLE idempotency_keys (
  key           TEXT PRIMARY KEY,
  request_hash  TEXT NOT NULL,
  status        SMALLINT,                        -- cached HTTP status
  response      JSONB,                           -- cached response body
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- webhook dedupe (provider layer) --------------------------------
-- We verify Squad's HMAC SHA512 signature, THEN dedupe on a payload hash so a
-- replayed or duplicated webhook is processed at most once ("avoid giving
-- double value" — Squad's own warning).
CREATE TABLE webhook_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      TEXT NOT NULL DEFAULT 'squad',
  event_type    TEXT NOT NULL,
  payload_hash  TEXT NOT NULL UNIQUE,            -- dedupe anchor
  payload       JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ
);

-- ---------- transactional outbox (reliable async) --------------------------
-- Domain events are written in the SAME db transaction as the state change.
-- A relay polls unpublished rows and pushes them to BullMQ. Guarantees we never
-- "commit the charge but lose the payout job".
CREATE TABLE outbox (
  id            BIGSERIAL PRIMARY KEY,
  aggregate_id  UUID NOT NULL,                   -- usually transaction id
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);
CREATE INDEX idx_outbox_unpublished
  ON outbox(created_at) WHERE published_at IS NULL;

-- ---------- audit log (immutable forensic trail) ---------------------------
CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor_user_id UUID,
  action        TEXT NOT NULL,
  entity        TEXT NOT NULL,
  entity_id     TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);