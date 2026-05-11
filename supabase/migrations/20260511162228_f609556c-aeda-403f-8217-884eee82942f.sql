
ALTER TABLE public.meal_settings
  ADD COLUMN IF NOT EXISTS breakfast_weight numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lunch_weight numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dinner_weight numeric NOT NULL DEFAULT 1;

ALTER TABLE public.meal_settings
  ADD CONSTRAINT meal_settings_weights_nonneg
  CHECK (breakfast_weight >= 0 AND lunch_weight >= 0 AND dinner_weight >= 0);
