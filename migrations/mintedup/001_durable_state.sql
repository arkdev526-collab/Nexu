-- Minted Up Durable Data Core — first Postgres persistence boundary.
--
-- This intentionally stores the current aggregate Database as one JSONB state
-- row. It preserves existing domain APIs while giving all Vercel instances one
-- durable source of truth. Hot domains can be normalised into relational tables
-- behind the same store interface after this cutover is proven in production.

CREATE TABLE IF NOT EXISTS mintedup_state (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  revision BIGINT NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO mintedup_state (id, payload, revision)
VALUES (1, '{}'::jsonb, 0)
ON CONFLICT (id) DO NOTHING;
