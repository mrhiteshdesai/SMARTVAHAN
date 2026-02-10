
-- Run this as a superuser (e.g. postgres) if you get "must be owner" errors
-- Checks if GHOST_ADMIN exists, if not adds it.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'GHOST_ADMIN' AND enumtypid = 'UserRole'::regtype) THEN
        ALTER TYPE "UserRole" ADD VALUE 'GHOST_ADMIN';
    END IF;
END$$;
