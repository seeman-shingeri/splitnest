
DROP POLICY IF EXISTS "Owner inserts meal entries" ON public.meal_entries;
DROP POLICY IF EXISTS "Owner updates meal entries" ON public.meal_entries;
DROP POLICY IF EXISTS "Owner deletes meal entries" ON public.meal_entries;

CREATE POLICY "Insert own or owner meal entries"
ON public.meal_entries FOR INSERT
WITH CHECK (
  public.is_group_owner(auth.uid(), group_id)
  OR EXISTS (
    SELECT 1 FROM public.roommates r
    WHERE r.id = meal_entries.roommate_id
      AND r.group_id = meal_entries.group_id
      AND r.user_id = auth.uid()
  )
);

CREATE POLICY "Update own or owner meal entries"
ON public.meal_entries FOR UPDATE
USING (
  public.is_group_owner(auth.uid(), group_id)
  OR EXISTS (
    SELECT 1 FROM public.roommates r
    WHERE r.id = meal_entries.roommate_id
      AND r.group_id = meal_entries.group_id
      AND r.user_id = auth.uid()
  )
)
WITH CHECK (
  public.is_group_owner(auth.uid(), group_id)
  OR EXISTS (
    SELECT 1 FROM public.roommates r
    WHERE r.id = meal_entries.roommate_id
      AND r.group_id = meal_entries.group_id
      AND r.user_id = auth.uid()
  )
);

CREATE POLICY "Delete own or owner meal entries"
ON public.meal_entries FOR DELETE
USING (
  public.is_group_owner(auth.uid(), group_id)
  OR EXISTS (
    SELECT 1 FROM public.roommates r
    WHERE r.id = meal_entries.roommate_id
      AND r.group_id = meal_entries.group_id
      AND r.user_id = auth.uid()
  )
);
