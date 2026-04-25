CREATE TABLE IF NOT EXISTS public.member_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  group_id UUID NOT NULL,
  full_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  preferred_payment_info TEXT,
  roommate_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_id)
);

ALTER TABLE public.member_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own member profile"
ON public.member_profiles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users create own member profile"
ON public.member_profiles
FOR INSERT
WITH CHECK (auth.uid() = user_id AND is_group_member(auth.uid(), group_id));

CREATE POLICY "Users update own member profile"
ON public.member_profiles
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND is_group_member(auth.uid(), group_id));

DROP TRIGGER IF EXISTS update_member_profiles_updated_at ON public.member_profiles;
CREATE TRIGGER update_member_profiles_updated_at
BEFORE UPDATE ON public.member_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.roommates
ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.roommates
ALTER COLUMN room_number DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS roommates_group_user_unique
ON public.roommates (group_id, user_id)
WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_group_id UUID;
  skip_default_group BOOLEAN := COALESCE((NEW.raw_user_meta_data->>'skip_default_group')::boolean, false);
BEGIN
  IF skip_default_group THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.groups (owner_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'group_name', 'My Group'))
  RETURNING id INTO new_group_id;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (new_group_id, NEW.id, 'owner');

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_referral_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_rc public.referral_codes%ROWTYPE;
  v_owned_group uuid;
  v_existing_membership uuid;
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

  IF EXISTS (
    SELECT 1
    FROM public.groups
    WHERE id = v_rc.group_id
      AND owner_id = v_user
  ) THEN
    RAISE EXCEPTION 'You already own this group' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = v_rc.group_id
      AND user_id = v_user
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

  SELECT g.id
  INTO v_owned_group
  FROM public.groups g
  WHERE g.owner_id = v_user
  LIMIT 1;

  SELECT gm.group_id
  INTO v_existing_membership
  FROM public.group_members gm
  WHERE gm.user_id = v_user
    AND gm.group_id <> v_rc.group_id
  LIMIT 1;

  IF v_owned_group IS NOT NULL AND v_owned_group <> v_rc.group_id THEN
    IF EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = v_owned_group
        AND gm.user_id <> v_user
    )
    OR EXISTS (SELECT 1 FROM public.roommates r WHERE r.group_id = v_owned_group)
    OR EXISTS (SELECT 1 FROM public.expenses e WHERE e.group_id = v_owned_group)
    OR EXISTS (SELECT 1 FROM public.expense_splits es JOIN public.expenses e ON e.id = es.expense_id WHERE e.group_id = v_owned_group)
    OR EXISTS (SELECT 1 FROM public.meal_entries me WHERE me.group_id = v_owned_group)
    OR EXISTS (SELECT 1 FROM public.meal_settings ms WHERE ms.group_id = v_owned_group)
    OR EXISTS (SELECT 1 FROM public.settlement_payments sp WHERE sp.group_id = v_owned_group)
    OR EXISTS (SELECT 1 FROM public.notifications n WHERE n.group_id = v_owned_group)
    THEN
      RAISE EXCEPTION 'You already belong to another group. Leave it before joining a new one' USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.member_profiles WHERE group_id = v_owned_group AND user_id = v_user;
    DELETE FROM public.referral_codes WHERE group_id = v_owned_group;
    DELETE FROM public.group_members WHERE group_id = v_owned_group AND user_id = v_user;
    DELETE FROM public.groups WHERE id = v_owned_group AND owner_id = v_user;
  ELSIF v_existing_membership IS NOT NULL THEN
    RAISE EXCEPTION 'You already belong to another group. Leave it before joining a new one' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.referral_codes
  SET used = true, used_by = v_user, used_at = now()
  WHERE id = v_rc.id;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (v_rc.group_id, v_user, 'member')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.member_profiles (user_id, group_id, email)
  VALUES (v_user, v_rc.group_id, COALESCE(v_email, 'unknown@example.com'))
  ON CONFLICT (user_id, group_id)
  DO UPDATE SET email = EXCLUDED.email, updated_at = now();

  RETURN v_rc.group_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_member_profile(
  _group_id uuid,
  _full_name text,
  _phone text DEFAULT NULL,
  _preferred_payment_info text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_email text := NULLIF(trim(COALESCE(auth.jwt() ->> 'email', '')), '');
  v_roommate_id uuid;
  v_full_name text := NULLIF(trim(COALESCE(_full_name, '')), '');
  v_phone text := NULLIF(trim(COALESCE(_phone, '')), '');
  v_payment text := NULLIF(trim(COALESCE(_preferred_payment_info, '')), '');
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT is_group_member(v_user, _group_id) THEN
    RAISE EXCEPTION 'You are not a member of this group' USING ERRCODE = '28000';
  END IF;

  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'Full name is required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.roommates (group_id, user_id, full_name, phone, room_number, join_date)
  VALUES (_group_id, v_user, v_full_name, v_phone, NULL, CURRENT_DATE)
  ON CONFLICT (group_id, user_id)
  DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone
  RETURNING id INTO v_roommate_id;

  INSERT INTO public.member_profiles (user_id, group_id, full_name, email, phone, preferred_payment_info, roommate_id)
  VALUES (v_user, _group_id, v_full_name, COALESCE(v_email, 'unknown@example.com'), v_phone, v_payment, v_roommate_id)
  ON CONFLICT (user_id, group_id)
  DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    preferred_payment_info = EXCLUDED.preferred_payment_info,
    roommate_id = EXCLUDED.roommate_id,
    updated_at = now();

  RETURN v_roommate_id;
END;
$function$;