
-- Tighten notifications INSERT: only self-targeted inserts via RLS; group notifications go through SECURITY DEFINER RPC.
DROP POLICY IF EXISTS "Members insert notifications in their group" ON public.notifications;

CREATE POLICY "Users insert their own notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_group_member(auth.uid(), group_id));

-- RPC: send a whitelisted notification event to all members of a group.
CREATE OR REPLACE FUNCTION public.notify_group_event(
  _group_id uuid,
  _type text,
  _title text,
  _body text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_allowed text[] := ARRAY[
    'expense_added','expense_updated','expense_deleted',
    'settlement_paid','referral_used','member_joined'
  ];
  v_title text := NULLIF(trim(COALESCE(_title,'')), '');
  v_body text  := NULLIF(trim(COALESCE(_body,'')), '');
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_group_member(v_user, _group_id) THEN
    RAISE EXCEPTION 'Not a group member' USING ERRCODE = '42501';
  END IF;
  IF _type IS NULL OR NOT (_type = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Invalid notification type' USING ERRCODE = 'P0001';
  END IF;
  IF v_title IS NULL OR length(v_title) > 120 THEN
    RAISE EXCEPTION 'Invalid title' USING ERRCODE = 'P0001';
  END IF;
  IF v_body IS NOT NULL AND length(v_body) > 500 THEN
    v_body := substr(v_body, 1, 500);
  END IF;

  INSERT INTO public.notifications (group_id, user_id, type, title, body)
  SELECT _group_id, uid, _type, v_title, v_body
  FROM (
    SELECT owner_id AS uid FROM public.groups WHERE id = _group_id
    UNION
    SELECT user_id AS uid FROM public.group_members WHERE group_id = _group_id
  ) s
  WHERE uid IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_group_event(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_group_event(uuid, text, text, text) TO authenticated;
