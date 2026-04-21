-- updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ meal_settings ============
CREATE TABLE public.meal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL UNIQUE,
  meal_charge NUMERIC NOT NULL DEFAULT 0 CHECK (meal_charge >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view meal settings" ON public.meal_settings
  FOR SELECT USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Owner inserts meal settings" ON public.meal_settings
  FOR INSERT WITH CHECK (public.is_group_owner(auth.uid(), group_id));
CREATE POLICY "Owner updates meal settings" ON public.meal_settings
  FOR UPDATE USING (public.is_group_owner(auth.uid(), group_id));
CREATE POLICY "Owner deletes meal settings" ON public.meal_settings
  FOR DELETE USING (public.is_group_owner(auth.uid(), group_id));
CREATE TRIGGER meal_settings_updated_at BEFORE UPDATE ON public.meal_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ meal_entries ============
CREATE TABLE public.meal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,
  roommate_id UUID NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  breakfast INTEGER NOT NULL DEFAULT 0 CHECK (breakfast >= 0),
  lunch INTEGER NOT NULL DEFAULT 0 CHECK (lunch >= 0),
  dinner INTEGER NOT NULL DEFAULT 0 CHECK (dinner >= 0),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (roommate_id, entry_date)
);
CREATE INDEX idx_meal_entries_group_date ON public.meal_entries(group_id, entry_date);
ALTER TABLE public.meal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view meal entries" ON public.meal_entries
  FOR SELECT USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Members insert meal entries" ON public.meal_entries
  FOR INSERT WITH CHECK (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Members update meal entries" ON public.meal_entries
  FOR UPDATE USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Owner deletes meal entries" ON public.meal_entries
  FOR DELETE USING (public.is_group_owner(auth.uid(), group_id));
CREATE TRIGGER meal_entries_updated_at BEFORE UPDATE ON public.meal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ settlement_payments ============
CREATE TABLE public.settlement_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,
  from_roommate_id UUID NOT NULL,
  to_roommate_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_settlement_payments_group ON public.settlement_payments(group_id);
ALTER TABLE public.settlement_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view settlements" ON public.settlement_payments
  FOR SELECT USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Owner inserts settlements" ON public.settlement_payments
  FOR INSERT WITH CHECK (public.is_group_owner(auth.uid(), group_id));
CREATE POLICY "Owner updates settlements" ON public.settlement_payments
  FOR UPDATE USING (public.is_group_owner(auth.uid(), group_id));
CREATE POLICY "Owner deletes settlements" ON public.settlement_payments
  FOR DELETE USING (public.is_group_owner(auth.uid(), group_id));

-- ============ notifications ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, read, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view their notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Members insert notifications in their group" ON public.notifications
  FOR INSERT WITH CHECK (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Users update their notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete their notifications" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

-- ============ realtime ============
ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.expense_splits REPLICA IDENTITY FULL;
ALTER TABLE public.roommates REPLICA IDENTITY FULL;
ALTER TABLE public.meal_entries REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_splits;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.roommates;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_entries;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;