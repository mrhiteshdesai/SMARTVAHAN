DO $$
DECLARE
    r RECORD;
BEGIN
    -- Change owner of all tables in public schema
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE 'ALTER TABLE public."' || r.tablename || '" OWNER TO smartvahan';
    END LOOP;
    
    -- Change owner of all sequences
    FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
    LOOP
        EXECUTE 'ALTER SEQUENCE public."' || r.sequence_name || '" OWNER TO smartvahan';
    END LOOP;

    -- Change owner of all views
    FOR r IN SELECT table_name FROM information_schema.views WHERE table_schema = 'public'
    LOOP
        EXECUTE 'ALTER VIEW public."' || r.table_name || '" OWNER TO smartvahan';
    END LOOP;
END$$;
