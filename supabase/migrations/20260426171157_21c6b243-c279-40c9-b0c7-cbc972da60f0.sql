-- 1) member_profiles: unique (user_id, group_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'member_profiles_user_group_unique'
  ) THEN
    DELETE FROM public.member_profiles a
    USING public.member_profiles b
    WHERE a.ctid < b.ctid
      AND a.user_id = b.user_id
      AND a.group_id = b.group_id;

    CREATE UNIQUE INDEX member_profiles_user_group_unique
      ON public.member_profiles (user_id, group_id);
  END IF;
END $$;

-- 2) roommates: unique (group_id, user_id) where user_id is not null
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'roommates_group_user_unique'
  ) THEN
    -- de-dupe: keep the earliest row per (group_id, user_id)
    DELETE FROM public.roommates a
    USING public.roommates b
    WHERE a.ctid > b.ctid
      AND a.group_id = b.group_id
      AND a.user_id IS NOT NULL
      AND b.user_id IS NOT NULL
      AND a.user_id = b.user_id;

    CREATE UNIQUE INDEX roommates_group_user_unique
      ON public.roommates (group_id, user_id)
      WHERE user_id IS NOT NULL;
  END IF;
END $$;