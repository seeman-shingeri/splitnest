import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGroup } from "@/hooks/useGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, UtensilsCrossed, Settings2, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Minus, Plus, Lock } from "lucide-react";
import { toast } from "sonner";
import { addDays, format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { formatCurrency, CURRENCY } from "@/lib/currency";
import { pointsFor, formatPoints, splitByPoints, DEFAULT_WEIGHTS, type MealWeights } from "@/lib/meals";
import { useAuth } from "@/contexts/AuthContext";

interface Roommate { id: string; full_name: string; user_id: string | null }
interface Entry { id?: string; roommate_id: string; entry_date: string; breakfast: number; lunch: number; dinner: number; }
type MealCounts = { breakfast: number; lunch: number; dinner: number };

function useMealSettings(groupId: string | undefined) {
  return useQuery({
    queryKey: ["meal-settings", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data } = await supabase
        .from("meal_settings")
        .select("meal_charge, breakfast_weight, lunch_weight, dinner_weight")
        .eq("group_id", groupId!)
        .maybeSingle();
      return {
        charge: Number(data?.meal_charge ?? 0),
        weights: {
          breakfast: Number(data?.breakfast_weight ?? 1),
          lunch: Number(data?.lunch_weight ?? 1),
          dinner: Number(data?.dinner_weight ?? 1),
        } as MealWeights,
      };
    },
  });
}

export default function MealsPage() {
  const { data: group } = useGroup();
  const isOwner = !!group?.isOwner;
  const [tab, setTab] = useState<"entry" | "summary" | "report">("entry");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meals</h1>
          <p className="text-sm text-muted-foreground">
            {isOwner
              ? "Log daily meals so the food bill divides fairly."
              : "Log your own meals so your food bill share is accurate."}
          </p>
        </div>
        {isOwner && <MealSettingsButton groupId={group!.id} />}
      </div>

      {!isOwner && (
        <Card className="border-muted bg-muted/30">
          <CardContent className="flex items-center gap-3 p-3 text-xs text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0" />
            <span>You can update your own meals. Only the room owner can change other members.</span>
          </CardContent>
        </Card>
      )}

      <SettingsBanner groupId={group?.id} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="entry">Log meals</TabsTrigger>
          <TabsTrigger value="summary">This month</TabsTrigger>
          <TabsTrigger value="report">By month</TabsTrigger>
        </TabsList>
        <TabsContent value="entry" className="mt-4">
          <MealEntry groupId={group?.id} isOwner={isOwner} />
        </TabsContent>
        <TabsContent value="summary" className="mt-4">
          <MealSummary groupId={group?.id} />
        </TabsContent>
        <TabsContent value="report" className="mt-4">
          <MonthlyMealReport groupId={group?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SettingsBanner({ groupId }: { groupId?: string }) {
  const { data } = useMealSettings(groupId);
  const w = data?.weights ?? DEFAULT_WEIGHTS;
  const allEqual = w.breakfast === w.lunch && w.lunch === w.dinner;
  return (
    <Card className="border-primary/20 bg-accent/40">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">How meals count</div>
            <div className="text-sm font-semibold tabular-nums">
              {allEqual
                ? "Each meal = 1"
                : `Breakfast ${formatPoints(w.breakfast)} · Lunch ${formatPoints(w.lunch)} · Dinner ${formatPoints(w.dinner)}`}
            </div>
          </div>
        </div>
        {data?.charge ? (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Per meal</div>
            <div className="text-sm font-semibold">{formatCurrency(data.charge)}</div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MealSettingsButton({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const { data } = useMealSettings(groupId);
  const [open, setOpen] = useState(false);
  const [charge, setCharge] = useState("");
  const [bw, setBw] = useState("1");
  const [lw, setLw] = useState("1");
  const [dw, setDw] = useState("1");

  const openDialog = () => {
    setCharge(String(data?.charge ?? 0));
    setBw(String(data?.weights.breakfast ?? 1));
    setLw(String(data?.weights.lunch ?? 1));
    setDw(String(data?.weights.dinner ?? 1));
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const c = parseFloat(charge);
      const b = parseFloat(bw);
      const l = parseFloat(lw);
      const d = parseFloat(dw);
      if ([c, b, l, d].some((n) => !Number.isFinite(n) || n < 0)) {
        throw new Error("Please enter values of 0 or more.");
      }
      const payload = { meal_charge: c, breakfast_weight: b, lunch_weight: l, dinner_weight: d };
      const { data: existing } = await supabase
        .from("meal_settings").select("id").eq("group_id", groupId).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("meal_settings").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("meal_settings").insert({ group_id: groupId, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["meal-settings"] });
      qc.invalidateQueries({ queryKey: ["meal-summary"] });
      qc.invalidateQueries({ queryKey: ["meal-points-for-split"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
    },
    onError: () => toast.error("Couldn't save settings. Please try again."),
  });

  return (
    <>
      <Button size="sm" variant="outline" onClick={openDialog}>
        <Settings2 className="mr-1.5 h-4 w-4" /> Settings
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Meal settings</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Price per meal ({CURRENCY})</Label>
              <Input type="number" inputMode="decimal" step="0.01" min="0" value={charge} onChange={(e) => setCharge(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">Used only for the monthly meal income summary.</p>
            </div>
            <div className="space-y-2">
              <Label>How much each meal counts</Label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="mb-1 text-[11px] uppercase text-muted-foreground">Breakfast</div>
                  <Input type="number" inputMode="decimal" step="0.1" min="0" value={bw} onChange={(e) => setBw(e.target.value)} />
                </div>
                <div>
                  <div className="mb-1 text-[11px] uppercase text-muted-foreground">Lunch</div>
                  <Input type="number" inputMode="decimal" step="0.1" min="0" value={lw} onChange={(e) => setLw(e.target.value)} />
                </div>
                <div>
                  <div className="mb-1 text-[11px] uppercase text-muted-foreground">Dinner</div>
                  <Input type="number" inputMode="decimal" step="0.1" min="0" value={dw} onChange={(e) => setDw(e.target.value)} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Leave all at 1 to count every meal equally.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MealEntry({ groupId, isOwner }: { groupId?: string; isOwner: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data: settings } = useMealSettings(groupId);
  const weights = settings?.weights ?? DEFAULT_WEIGHTS;

  const { data: roommates } = useQuery({
    queryKey: ["roommates", groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<Roommate[]> => {
      const { data, error } = await supabase
        .from("roommates").select("id, full_name, user_id").eq("group_id", groupId!).order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: entries, isLoading } = useQuery({
    queryKey: ["meal-entries", groupId, date],
    enabled: !!groupId,
    queryFn: async (): Promise<Entry[]> => {
      const { data, error } = await supabase
        .from("meal_entries")
        .select("id, roommate_id, entry_date, breakfast, lunch, dinner")
        .eq("group_id", groupId!)
        .eq("entry_date", date);
      if (error) throw error;
      return data || [];
    },
  });

  const map = useMemo(() => {
    const m = new Map<string, Entry>();
    (entries || []).forEach(e => m.set(e.roommate_id, e));
    return m;
  }, [entries]);

  const upsert = useMutation({
    mutationFn: async (e: Entry) => {
      if (!groupId) throw new Error("No group");
      const payload = {
        group_id: groupId,
        roommate_id: e.roommate_id,
        entry_date: date,
        breakfast: Math.max(0, e.breakfast | 0),
        lunch: Math.max(0, e.lunch | 0),
        dinner: Math.max(0, e.dinner | 0),
      };
      const existing = map.get(e.roommate_id);
      if (existing?.id) {
        const { error } = await supabase.from("meal_entries").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("meal_entries").insert(payload);
        if (error) throw error;
      }
    },
    onMutate: async (e) => {
      await qc.cancelQueries({ queryKey: ["meal-entries", groupId, date] });
      const prev = qc.getQueryData<Entry[]>(["meal-entries", groupId, date]) || [];
      const next = (() => {
        const idx = prev.findIndex(p => p.roommate_id === e.roommate_id);
        if (idx === -1) return [...prev, { ...e, entry_date: date }];
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...e, entry_date: date };
        return copy;
      })();
      qc.setQueryData(["meal-entries", groupId, date], next);
      return { prev };
    },
    onError: (_err: Error, _e, ctx) => {
      if (ctx?.prev) qc.setQueryData(["meal-entries", groupId, date], ctx.prev);
      toast.error("Couldn't save. Only the room owner can change meals.");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["meal-entries"] });
      qc.invalidateQueries({ queryKey: ["meal-summary"] });
      qc.invalidateQueries({ queryKey: ["meal-points-for-split"] });
    },
  });

  const shiftDay = (d: number) => setDate(format(addDays(parseISO(date), d), "yyyy-MM-dd"));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between gap-2 p-3">
          <Button variant="ghost" size="icon" onClick={() => shiftDay(-1)} aria-label="Previous day">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" />
          </div>
          <Button variant="ghost" size="icon" onClick={() => shiftDay(1)} aria-label="Next day">
            <ChevronRight className="h-5 w-5" />
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !roommates?.length ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Add roommates first.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {roommates.map(r => {
            const e = map.get(r.id) ?? { roommate_id: r.id, entry_date: date, breakfast: 0, lunch: 0, dinner: 0 };
            const totalMeals = (e.breakfast || 0) + (e.lunch || 0) + (e.dinner || 0);
            return (
              <Card key={r.id} className="overflow-hidden">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{r.full_name}</div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary tabular-nums">
                      {totalMeals} meal{totalMeals === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {(["breakfast", "lunch", "dinner"] as const).map((slot) => (
                      <MealRow
                        key={slot}
                        label={slot[0].toUpperCase() + slot.slice(1)}
                        weight={weights[slot]}
                        value={(e as any)[slot] || 0}
                        readOnly={!isOwner}
                        onChange={(v) => upsert.mutate({ ...e, [slot]: v })}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MealRow({
  label, value, weight, onChange, readOnly,
}: { label: string; value: number; weight: number; onChange: (v: number) => void; readOnly: boolean }) {
  const showWeight = Math.abs(weight - 1) > 1e-9;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {showWeight && (
          <div className="text-[11px] text-muted-foreground tabular-nums">counts as {formatPoints(weight)}</div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!readOnly && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 rounded-full"
            onClick={() => onChange(Math.max(0, value - 1))}
            aria-label={`Decrease ${label}`}
            disabled={value <= 0}
          >
            <Minus className="h-4 w-4" />
          </Button>
        )}
        <span className="min-w-7 text-center text-base font-bold tabular-nums">{value}</span>
        {!readOnly && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 rounded-full"
            onClick={() => onChange(value + 1)}
            aria-label={`Increase ${label}`}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface SummaryRow {
  id: string;
  name: string;
  breakfast: number;
  lunch: number;
  dinner: number;
  totalMeals: number;
  points: number;
  groceryPayable: number;
}

function useMealSummary(groupId: string | undefined, monthStart: string, monthEnd: string) {
  return useQuery({
    queryKey: ["meal-summary", groupId, monthStart, monthEnd],
    enabled: !!groupId,
    queryFn: async () => {
      const [rmRes, entriesRes, settingsRes, groceryRes] = await Promise.all([
        supabase.from("roommates").select("id, full_name").eq("group_id", groupId!),
        supabase.from("meal_entries")
          .select("roommate_id, entry_date, breakfast, lunch, dinner")
          .eq("group_id", groupId!)
          .gte("entry_date", monthStart).lte("entry_date", monthEnd),
        supabase.from("meal_settings")
          .select("meal_charge, breakfast_weight, lunch_weight, dinner_weight")
          .eq("group_id", groupId!)
          .maybeSingle(),
        supabase.from("expenses")
          .select("amount")
          .eq("group_id", groupId!)
          .eq("category", "Groceries")
          .gte("expense_date", monthStart).lte("expense_date", monthEnd),
      ]);

      const charge = Number(settingsRes.data?.meal_charge ?? 0);
      const weights: MealWeights = {
        breakfast: Number(settingsRes.data?.breakfast_weight ?? 1),
        lunch: Number(settingsRes.data?.lunch_weight ?? 1),
        dinner: Number(settingsRes.data?.dinner_weight ?? 1),
      };
      const roommates: Roommate[] = rmRes.data || [];

      const counts = new Map<string, MealCounts>();
      roommates.forEach(r => counts.set(r.id, { breakfast: 0, lunch: 0, dinner: 0 }));
      (entriesRes.data || []).forEach((e: any) => {
        const c = counts.get(e.roommate_id) || { breakfast: 0, lunch: 0, dinner: 0 };
        c.breakfast += e.breakfast || 0;
        c.lunch += e.lunch || 0;
        c.dinner += e.dinner || 0;
        counts.set(e.roommate_id, c);
      });

      const groceryTotal = (groceryRes.data || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

      const interim = roommates.map(r => {
        const c = counts.get(r.id) || { breakfast: 0, lunch: 0, dinner: 0 };
        return {
          id: r.id,
          name: r.full_name,
          ...c,
          totalMeals: c.breakfast + c.lunch + c.dinner,
          points: pointsFor(c, weights),
        };
      });

      const groceryShares = splitByPoints(groceryTotal, interim.map(r => r.points));

      const rows: SummaryRow[] = interim.map((r, i) => ({
        ...r,
        groceryPayable: groceryShares[i] ?? 0,
      }));

      const totalMeals = rows.reduce((s, r) => s + r.totalMeals, 0);
      const totalPoints = rows.reduce((s, r) => s + r.points, 0);
      return { rows, charge, weights, totalMeals, totalPoints, totalRevenue: totalPoints * charge, groceryTotal };
    },
  });
}

function MealSummary({ groupId }: { groupId?: string }) {
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const { data, isLoading } = useMealSummary(groupId, monthStart, monthEnd);

  if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total meals</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{data.totalMeals}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Food bill</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(data.groceryTotal)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Food bill share</CardTitle>
          <p className="text-xs text-muted-foreground">Bill divided based on meals eaten this month.</p>
        </CardHeader>
        <CardContent className="p-0">
          {!data.rows.length ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No roommates yet.</div>
          ) : (
            <ul className="divide-y">
              {data.rows.map(r => (
                <li key={r.id} className="space-y-1 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {r.totalMeals} meal{r.totalMeals === 1 ? "" : "s"} · B {r.breakfast} · L {r.lunch} · D {r.dinner}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] uppercase text-muted-foreground">Their share</div>
                      <div className="font-semibold tabular-nums">{formatCurrency(r.groceryPayable)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MonthlyMealReport({ groupId }: { groupId?: string }) {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const monthStart = `${month}-01`;
  const monthEnd = format(endOfMonth(parseISO(`${month}-01`)), "yyyy-MM-dd");
  const { data, isLoading } = useMealSummary(groupId, monthStart, monthEnd);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-3">
          <Label className="text-xs uppercase text-muted-foreground">Month</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 w-44" />
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-3 text-center">
              <div className="text-[11px] uppercase text-muted-foreground">Meals</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums">{data.totalMeals}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-[11px] uppercase text-muted-foreground">Food bill</div>
              <div className="mt-0.5 text-base font-semibold">{formatCurrency(data.groceryTotal)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-[11px] uppercase text-muted-foreground">Meal income</div>
              <div className="mt-0.5 text-base font-semibold">{formatCurrency(data.totalRevenue)}</div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Monthly breakdown</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!data.rows.length ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No data.</div>
              ) : (
                <ul className="divide-y">
                  {data.rows.map(r => (
                    <li key={r.id} className="space-y-1 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{r.name}</div>
                        <div className="font-semibold tabular-nums">{formatCurrency(r.groceryPayable)}</div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                        <span>B {r.breakfast} · L {r.lunch} · D {r.dinner}</span>
                        <span>{r.totalMeals} meals</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
