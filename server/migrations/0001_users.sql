-- Up Migration

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The original app used a plain UNIQUE on email, which let alice@example.com and
-- Alice@example.com register as two accounts. Uniqueness is on the folded form instead.
CREATE UNIQUE INDEX users_email_lower_key ON users (LOWER(email));

-- Down Migration

DROP TABLE users;
