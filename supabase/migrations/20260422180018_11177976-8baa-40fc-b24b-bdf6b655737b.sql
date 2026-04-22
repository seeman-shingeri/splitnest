
-- 1. Tighten referral_codes UPDATE policy
DROP POLICY IF EXISTS "Anyone authenticated can mark used" ON public.referral_codes;

CREATE POLICY "Redeemer can mark code used"
ON public.referral_codes
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND used = false)
WITH CHECK (used = true AND used_by = auth.uid());

-- 2. Remove roommates from realtime publication to avoid broadcasting phone numbers.
-- React Query invalidations after mutations already keep the UI in sync.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.roommates;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- 3. Add RLS on realtime.messages to scope channel subscriptions to group members.
-- Channel naming convention used in app:
--   "group-<group_uuid>"  -> any group member
--   "notif-<user_uuid>"   -> only that user
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can receive scoped realtime" ON realtime.messages;

CREATE POLICY "Authenticated can receive scoped realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    -- Group channels: topic format "group-<uuid>"
    realtime.topic() LIKE 'group-%'
    AND public.is_group_member(
      auth.uid(),
      NULLIF(substring(realtime.topic() FROM 7), '')::uuid
    )
  )
  OR
  (
    -- Personal notification channels: topic format "notif-<user_uuid>"
    realtime.topic() LIKE 'notif-%'
    AND auth.uid()::text = substring(realtime.topic() FROM 7)
  )
);
