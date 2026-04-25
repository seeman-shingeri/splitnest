-- Ensure no duplicate memberships per (group, user)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'group_members_group_user_unique'
  ) THEN
    -- de-dupe any existing rows just in case
    DELETE FROM public.group_members a
    USING public.group_members b
    WHERE a.ctid < b.ctid
      AND a.group_id = b.group_id
      AND a.user_id = b.user_id;

    CREATE UNIQUE INDEX group_members_group_user_unique
      ON public.group_members (group_id, user_id);
  END IF;
END $$;

-- Rewrite redeem_referral_code: allow multi-group membership.
CREATE OR REPLACE FUNCTION public.redeem_referral_code(_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_rc public.referral_codes%ROWTYPE;
  v_email text := NULLIF(trim(COALESCE(auth.jwt() ->> 'email', '')), '');
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_rc
  FROM public.referral_codes
  WHERE code = upper(trim(_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid referral code' USING ERRCODE = 'P0001';
  END IF;

  IF v_rc.used THEN
    RAISE EXCEPTION 'This referral code has already been used' USING ERRCODE = 'P0001';
  END IF;

  -- Already owns this exact group: nothing to do
  IF EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = v_rc.group_id AND owner_id = v_user
  ) THEN
    RAISE EXCEPTION 'You already own this group' USING ERRCODE = 'P0001';
  END IF;

  -- Already a member of this group: just mark code used and ensure profile row exists
  IF EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = v_rc.group_id AND user_id = v_user
  ) THEN
    UPDATE public.referral_codes
    SET used = true, used_by = v_user, used_at = now()
    WHERE id = v_rc.id;

    INSERT INTO public.member_profiles (user_id, group_id, email)
    VALUES (v_user, v_rc.group_id, COALESCE(v_email, 'unknown@example.com'))
    ON CONFLICT (user_id, group_id)
    DO UPDATE SET email = EXCLUDED.email, updated_at = now();

    RETURN v_rc.group_id;
  END IF;

  -- Otherwise: add this user as a member of the new group, keep all existing memberships/ownerships intact.
  UPDATE public.referral_codes
  SET used = true, used_by = v_user, used_at = now()
  WHERE id = v_rc.id;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_rc.group_id, v_user, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  INSERT INTO public.member_profiles (user_id, group_id, email)
  VALUES (v_user, v_rc.group_id, COALESCE(v_email, 'unknown@example.com'))
  ON CONFLICT (user_id, group_id)
  DO UPDATE SET email = EXCLUDED.email, updated_at = now();

  RETURN v_rc.group_id;
END;
$function$;