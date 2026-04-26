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

  RETURN v_roommate_id;
END;
$function$;