-- 1) Attach the auto-regenerate trigger to referral_codes (was missing)
DROP TRIGGER IF EXISTS trg_auto_regenerate_referral_code ON public.referral_codes;
CREATE TRIGGER trg_auto_regenerate_referral_code
AFTER UPDATE ON public.referral_codes
FOR EACH ROW
EXECUTE FUNCTION public.auto_regenerate_referral_code();

-- 2) Atomic redeem function: validates code, marks used, inserts membership, returns group_id.
-- Runs as SECURITY DEFINER so it works regardless of intermediate RLS quirks, but still
-- requires an authenticated caller and validates the code itself.
CREATE OR REPLACE FUNCTION public.redeem_referral_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_rc   public.referral_codes%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Lock the row to prevent double-redemption races
  SELECT * INTO v_rc
  FROM public.referral_codes
  WHERE code = upper(trim(_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid referral code' USING ERRCODE = 'P0001';
  END IF;

  IF v_rc.used THEN
    RAISE EXCEPTION 'This referral code has already been used' USING ERRCODE = 'P0001';
  END IF;

  -- Prevent the group owner from redeeming their own code
  IF EXISTS (SELECT 1 FROM public.groups WHERE id = v_rc.group_id AND owner_id = v_user) THEN
    RAISE EXCEPTION 'You already own this group' USING ERRCODE = 'P0001';
  END IF;

  -- Mark the code as used
  UPDATE public.referral_codes
  SET used = true, used_by = v_user, used_at = now()
  WHERE id = v_rc.id;

  -- Insert membership (idempotent on duplicate)
  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_rc.group_id, v_user, 'member')
  ON CONFLICT DO NOTHING;

  RETURN v_rc.group_id;
END;
$$;

-- Allow authenticated users to call it
REVOKE ALL ON FUNCTION public.redeem_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_referral_code(text) TO authenticated;

-- 3) Add a uniqueness guard on (group_id, user_id) so duplicate joins are impossible
CREATE UNIQUE INDEX IF NOT EXISTS group_members_group_user_unique
ON public.group_members (group_id, user_id);