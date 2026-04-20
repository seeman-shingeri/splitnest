
-- Groups: each owner gets a group; members (including owner) live in group_members
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Group',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_groups_owner ON public.groups(owner_id);

CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);
CREATE INDEX idx_group_members_group ON public.group_members(group_id);
CREATE INDEX idx_group_members_user ON public.group_members(user_id);

CREATE TABLE public.roommates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  room_number TEXT NOT NULL,
  phone TEXT,
  join_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_roommates_group ON public.roommates(group_id);

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_by UUID NOT NULL REFERENCES public.roommates(id) ON DELETE CASCADE,
  split_type TEXT NOT NULL CHECK (split_type IN ('equal','manual')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_group ON public.expenses(group_id);
CREATE INDEX idx_expenses_date ON public.expenses(expense_date);

CREATE TABLE public.expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  roommate_id UUID NOT NULL REFERENCES public.roommates(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0)
);
CREATE INDEX idx_expense_splits_expense ON public.expense_splits(expense_id);
CREATE INDEX idx_expense_splits_roommate ON public.expense_splits(roommate_id);

CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_referral_codes_group ON public.referral_codes(group_id);
CREATE INDEX idx_referral_codes_code ON public.referral_codes(code);

-- Helper: is user a member of a group?
CREATE OR REPLACE FUNCTION public.is_group_member(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members WHERE user_id = _user_id AND group_id = _group_id
  ) OR EXISTS (
    SELECT 1 FROM public.groups WHERE owner_id = _user_id AND id = _group_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_owner(_user_id UUID, _group_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.groups WHERE owner_id = _user_id AND id = _group_id);
$$;

-- Enable RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roommates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- groups policies
CREATE POLICY "Members can view their groups" ON public.groups FOR SELECT
  USING (public.is_group_member(auth.uid(), id));
CREATE POLICY "Users can create their own group" ON public.groups FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner can update their group" ON public.groups FOR UPDATE
  USING (auth.uid() = owner_id);
CREATE POLICY "Owner can delete their group" ON public.groups FOR DELETE
  USING (auth.uid() = owner_id);

-- group_members policies
CREATE POLICY "Members can view their memberships" ON public.group_members FOR SELECT
  USING (user_id = auth.uid() OR public.is_group_owner(auth.uid(), group_id));
CREATE POLICY "Owner can add members" ON public.group_members FOR INSERT
  WITH CHECK (public.is_group_owner(auth.uid(), group_id) OR user_id = auth.uid());
CREATE POLICY "Owner can remove members" ON public.group_members FOR DELETE
  USING (public.is_group_owner(auth.uid(), group_id));

-- roommates policies (only owner can manage; all members can view)
CREATE POLICY "Members can view roommates" ON public.roommates FOR SELECT
  USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Owner can insert roommates" ON public.roommates FOR INSERT
  WITH CHECK (public.is_group_owner(auth.uid(), group_id));
CREATE POLICY "Owner can update roommates" ON public.roommates FOR UPDATE
  USING (public.is_group_owner(auth.uid(), group_id));
CREATE POLICY "Owner can delete roommates" ON public.roommates FOR DELETE
  USING (public.is_group_owner(auth.uid(), group_id));

-- expenses policies
CREATE POLICY "Members can view expenses" ON public.expenses FOR SELECT
  USING (public.is_group_member(auth.uid(), group_id));
CREATE POLICY "Owner can insert expenses" ON public.expenses FOR INSERT
  WITH CHECK (public.is_group_owner(auth.uid(), group_id));
CREATE POLICY "Owner can update expenses" ON public.expenses FOR UPDATE
  USING (public.is_group_owner(auth.uid(), group_id));
CREATE POLICY "Owner can delete expenses" ON public.expenses FOR DELETE
  USING (public.is_group_owner(auth.uid(), group_id));

-- expense_splits policies (gated via parent expense)
CREATE POLICY "Members can view splits" ON public.expense_splits FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_group_member(auth.uid(), e.group_id)));
CREATE POLICY "Owner can insert splits" ON public.expense_splits FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_group_owner(auth.uid(), e.group_id)));
CREATE POLICY "Owner can update splits" ON public.expense_splits FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_group_owner(auth.uid(), e.group_id)));
CREATE POLICY "Owner can delete splits" ON public.expense_splits FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.is_group_owner(auth.uid(), e.group_id)));

-- referral_codes policies
CREATE POLICY "Owner can view their codes" ON public.referral_codes FOR SELECT
  USING (public.is_group_owner(auth.uid(), group_id));
CREATE POLICY "Anyone authenticated can lookup by code" ON public.referral_codes FOR SELECT
  USING (auth.uid() IS NOT NULL AND used = false);
CREATE POLICY "Owner can insert codes" ON public.referral_codes FOR INSERT
  WITH CHECK (public.is_group_owner(auth.uid(), group_id));
CREATE POLICY "Anyone authenticated can mark used" ON public.referral_codes FOR UPDATE
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "Owner can delete codes" ON public.referral_codes FOR DELETE
  USING (public.is_group_owner(auth.uid(), group_id));

-- Auto-create a group + owner membership on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_group_id UUID;
BEGIN
  INSERT INTO public.groups (owner_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'group_name', 'My Group'))
  RETURNING id INTO new_group_id;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (new_group_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
