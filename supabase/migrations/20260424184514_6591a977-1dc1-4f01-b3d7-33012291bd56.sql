-- Auto-generate a fresh referral code whenever an existing one is consumed.
-- This runs with elevated privileges so the redeemer (a non-owner) can effectively
-- trigger creation of a new code without holding INSERT permission themselves.

CREATE OR REPLACE FUNCTION public.auto_regenerate_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code TEXT;
  attempt INT := 0;
BEGIN
  -- Only act when a code transitions from unused -> used
  IF NEW.used = true AND (OLD.used IS DISTINCT FROM true) THEN
    LOOP
      attempt := attempt + 1;
      new_code := '';
      FOR i IN 1..8 LOOP
        new_code := new_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
      END LOOP;
      BEGIN
        INSERT INTO public.referral_codes (group_id, code) VALUES (NEW.group_id, new_code);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF attempt > 10 THEN EXIT; END IF;
      END;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_regenerate_referral_code ON public.referral_codes;
CREATE TRIGGER trg_auto_regenerate_referral_code
AFTER UPDATE ON public.referral_codes
FOR EACH ROW
EXECUTE FUNCTION public.auto_regenerate_referral_code();
