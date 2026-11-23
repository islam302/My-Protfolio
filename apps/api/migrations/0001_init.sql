-- 0001_init: admins, sessions, inquiries, audit_log.
-- Applied by src/db/migrate.js inside a transaction (do not add BEGIN/COMMIT here).
-- CHECK constraints mirror packages/validation (enums + LIMITS) as a second line of defence.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE TABLE admins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  password_hash   text NOT NULL CHECK (char_length(password_hash) BETWEEN 20 AND 512),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX admins_email_lower_key ON admins (lower(email));
CREATE TRIGGER admins_set_updated_at BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  admin_id     uuid NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  csrf_token   text NOT NULL CHECK (char_length(csrf_token) BETWEEN 32 AND 128),
  ip           text CHECK (char_length(ip) <= 128),          -- HMAC of the IP, never the raw address
  user_agent   text CHECK (char_length(user_agent) <= 512),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_admin_id_idx ON sessions (admin_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE inquiries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  project_type text NOT NULL CHECK (project_type IN ('web', 'mobile', 'ai', 'ecommerce', 'arabic', 'design', 'other')),
  -- budget/timeline values are UI copy (BUDGETS/TIMELINES); validated in the app, bounded here.
  budget       text CHECK (char_length(budget) BETWEEN 1 AND 100),
  timeline     text CHECK (char_length(timeline) BETWEEN 1 AND 100),
  message      text NOT NULL CHECK (char_length(message) BETWEEN 20 AND 2000),
  channel      text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'archived')),
  notes        text CHECK (char_length(notes) <= 4000),
  ip_hash      text CHECK (char_length(ip_hash) <= 128),
  user_agent   text CHECK (char_length(user_agent) <= 512),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inquiries_status_created_at_idx ON inquiries (status, created_at DESC);
CREATE INDEX inquiries_created_at_idx ON inquiries (created_at DESC);
CREATE TRIGGER inquiries_set_updated_at BEFORE UPDATE ON inquiries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id   uuid REFERENCES admins (id) ON DELETE SET NULL,
  action     text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 64),
  entity     text NOT NULL CHECK (char_length(entity) BETWEEN 1 AND 64),
  entity_id  uuid,
  meta       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);
