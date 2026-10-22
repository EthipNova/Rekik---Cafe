DO $$
DECLARE
  v_col record;
BEGIN
  FOR v_col IN 
    SELECT column_name, is_generated 
    FROM information_schema.columns 
    WHERE table_schema = 'auth' AND table_name = 'users'
  LOOP
    RAISE NOTICE 'col: % is_gen: %', v_col.column_name, v_col.is_generated;
  END LOOP;
END $$;
