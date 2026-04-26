-- 1. Allow any group member to insert expenses (not just owner)
DROP POLICY IF EXISTS "Owner can insert expenses" ON public.expenses;
CREATE POLICY "Members can insert expenses"
  ON public.expenses
  FOR INSERT
  WITH CHECK (public.is_group_member(auth.uid(), group_id));

-- 2. Allow any group member to insert expense splits for expenses in their group
DROP POLICY IF EXISTS "Owner can insert splits" ON public.expense_splits;
CREATE POLICY "Members can insert splits"
  ON public.expense_splits
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_splits.expense_id
        AND public.is_group_member(auth.uid(), e.group_id)
    )
  );

-- 3. Update complete_member_profile to also notify the group owner when a new member joins
CREATE OR REPLACE FUNCTION public.complete_member_profile(_group_id uuid, _full_name text, _phone text DEFAULT NULL::text, _preferred_payment_info text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_email text := NULLIF(trim(COALESCE(auth.jwt() ->> 'email', '')), '');
  v_roommate_id uuid;
  v_existing_roommate_id uuid;
  v_full_name text := NULLIF(trim(COALESCE(_full_name, '')), '');
  v_phone text := NULLIF(trim(COALESCE(_phone, '')), '');
  v_payment text := NULLIF(trim(COALESCE(_preferred_payment_info, '')), '');
  v_owner_id uuid;
  v_group_name text;
  v_is_new_roommate boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_group_member(v_user, _group_id) THEN
    RAISE EXCEPTION 'You are not a member of this group' USING ERRCODE = '28000';
  END IF;

  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'Full name is required' USING ERRCODE = 'P0001';
  END IF;

  SELECT id
    INTO v_existing_roommate_id
  FROM public.roommates
  WHERE group_id = _group_id
    AND user_id = v_user
  LIMIT 1;

  IF v_existing_roommate_id IS NULL THEN
    INSERT INTO public.roommates (group_id, user_id, full_name, phone, room_number, join_date)
    VALUES (_group_id, v_user, v_full_name, v_phone, NULL, CURRENT_DATE)
    RETURNING id INTO v_roommate_id;
    v_is_new_roommate := true;
  ELSE
    UPDATE public.roommates
    SET full_name = v_full_name,
        phone = v_phone
    WHERE id = v_existing_roommate_id
    RETURNING id INTO v_roommate_id;
  END IF;

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

  -- Notify group owner about the new member (only on first profile completion)
  IF v_is_new_roommate THEN
    SELECT owner_id, name INTO v_owner_id, v_group_name
    FROM public.groups WHERE id = _group_id;

    IF v_owner_id IS NOT NULL AND v_owner_id <> v_user THEN
      INSERT INTO public.notifications (group_id, user_id, type, title, body)
      VALUES (
        _group_id,
        v_owner_id,
        'member_joined',
        'New member joined',
        v_full_name || ' joined ' || COALESCE(v_group_name, 'your group') || '. Review existing expenses to include them if needed.'
      );
    END IF;
  END IF;

  RETURN v_roommate_id;
END;
$function$;