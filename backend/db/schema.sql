-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  phone VARCHAR(15) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin','state_admin','oem_admin','dealer_user')),
  state_id UUID NULL,
  oem_id UUID NULL,
  dealer_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- States
CREATE TABLE IF NOT EXISTS states (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OEMs
CREATE TABLE IF NOT EXISTS oems (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dealers
CREATE TABLE IF NOT EXISTS dealers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  state_id UUID REFERENCES states(id),
  oem_id UUID REFERENCES oems(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NULL,
  entity_id UUID NULL,
  ip TEXT NULL,
  user_agent TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Certificates (immutable)
CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY,
  serial TEXT UNIQUE NOT NULL,
  vehicle_number TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  issuer_user_id UUID REFERENCES users(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_hash TEXT NOT NULL
);

CREATE OR REPLACE FUNCTION prevent_certificate_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Certificate records are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS certificates_immutable ON certificates;
CREATE TRIGGER certificates_immutable
BEFORE UPDATE ON certificates
FOR EACH ROW EXECUTE PROCEDURE prevent_certificate_update();

