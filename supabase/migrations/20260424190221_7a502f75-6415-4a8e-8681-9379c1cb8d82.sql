-- Allow meal_points as a valid split_type for grocery expenses split by meal points
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_split_type_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_split_type_check
  CHECK (split_type = ANY (ARRAY['equal'::text, 'manual'::text, 'meal_points'::text]));