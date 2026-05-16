-- Tighten meal_entries: only owner can write; members keep read access.
DROP POLICY IF EXISTS "Members insert meal entries" ON public.meal_entries;
DROP POLICY IF EXISTS "Members update meal entries" ON public.meal_entries;

CREATE POLICY "Owner inserts meal entries"
ON public.meal_entries
FOR INSERT
WITH CHECK (public.is_group_owner(auth.uid(), group_id));

CREATE POLICY "Owner updates meal entries"
ON public.meal_entries
FOR UPDATE
USING (public.is_group_owner(auth.uid(), group_id))
WITH CHECK (public.is_group_owner(auth.uid(), group_id));