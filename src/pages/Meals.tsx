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
import { Loader2, UtensilsCrossed, Settings2, ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { addDays, format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { formatCurrency, CURRENCY } from "@/lib/currency";

interface Roommate { id: string; full_name: string }
interface Entry { id?: string; roommate_id: string; entry_date: string; breakfast: number; lunch: number; dinner: number; }

export default function MealsPage() {
  const { data: group } = useGroup();
  const isOwner = !!group?.isOwner;
  const [tab, setTab] = useState<"entry" | "summary" | "report">("entry");

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meals</h1>
          <p className="text-sm text-muted-foreground">Track daily meals and monthly bills</p>
        </div>
        {isOwner && <MealSettingsButton groupId={group!.id} />}
      </div>

      <MealChargeBanner groupId={group?.id} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="entry">Entry</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>
        <TabsContent value="entry" className="mt-4">
          <MealEntry groupId={group?.id} />
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

function useMealCharge(groupId: string | undefined) {
  return useQuery({
    queryKey: ["meal-charge", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data } = await supabase
        .from("meal_settings")
        .select("meal_charge")
        .eq("group_id", groupId!)
        .maybeSingle();
      return Number(data?.meal_charge ?? 0);
    },
  });
}

function MealChargeBanner({ groupId }: { groupId?: string }) {
  const { data: charge } = useMealCharge(groupId);
  return (
    <Card className="border-primary/20 bg-accent/40">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Meal charge</div>
            <div className="text-lg font-semibold">{formatCurrency(charge ?? 0)} <span className="text-xs font-normal text-muted-foreground">/ meal</span></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MealSettingsButton({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const { data: charge } = useMealCharge(groupId);
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const n = parseFloat(val);
      if (isNaN(n) || n < 0) throw new Error("Enter a valid charge");
      const { data: existing } = await supabase
        .from("meal_settings").select("id").eq("group_id", groupId).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("meal_settings").update({ meal_charge: n }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("meal_settings").insert({ group_id: groupId, meal_charge: n });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Meal charge updated");
      qc.invalidateQueries({ queryKey: ["meal-charge"] });
      qc.invalidateQueries({ queryKey: ["meal-summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setVal(String(charge ?? 0)); setOpen(true); }}>
        <Settings2 className="mr-1.5 h-4 w-4" /> Settings
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Meal charge</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Charge per meal ({CURRENCY})</Label>
            <Input type="number" step="0.01" min="0" value={val} onChange={(e) => setVal(e.target.value)} />
            <p className="text-xs text-muted-foreground">Each meal counted (breakfast, lunch, dinner) is charged at this rate.</p>
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

function MealEntry({ groupId }: { groupId?: string }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: roommates } = useQuery({
    queryKey: ["roommates", groupId],
    enabled: !!groupId,
    queryFn: async (): Promise<Roommate[]> => {
      const { data, error } = await supabase
        .from("roommates").select("id, full_name").eq("group_id", groupId!).order("created_at");
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meal-entries"] });
      qc.invalidateQueries({ queryKey: ["meal-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
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
            const total = (e.breakfast || 0) + (e.lunch || 0) + (e.dinner || 0);
            return (
              <Card key={r.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{r.full_name}</div>
                    <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                      {total} pt{total === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["breakfast", "lunch", "dinner"] as const).map(slot => (
                      <MealCounter
                        key={slot}
                        label={slot[0].toUpperCase() + slot.slice(1)}
                        value={(e as any)[slot] || 0}
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

function MealCounter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="rounded-xl border bg-card p-2">
      <div className="text-center text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </Button>
        <span className="min-w-6 text-center text-lg font-bold tabular-nums">{value}</span>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => onChange(value + 1)}>
          +
        </Button>
      </div>
    </div>
  );
}

function useMealSummary(groupId: string | undefined, monthStart: string, monthEnd: string) {
  return useQuery({
    queryKey: ["meal-summary", groupId, monthStart, monthEnd],
    enabled: !!groupId,
    queryFn: async () => {
      const [rmRes, entriesRes, settingsRes] = await Promise.all([
        supabase.from("roommates").select("id, full_name").eq("group_id", groupId!),
        supabase.from("meal_entries")
          .select("roommate_id, entry_date, breakfast, lunch, dinner")
          .eq("group_id", groupId!)
          .gte("entry_date", monthStart).lte("entry_date", monthEnd),
        supabase.from("meal_settings").select("meal_charge").eq("group_id", groupId!).maybeSingle(),
      ]);
      const charge = Number(settingsRes.data?.meal_charge ?? 0);
      const roommates: Roommate[] = rmRes.data || [];
      const totals = new Map<string, number>();
      roommates.forEach(r => totals.set(r.id, 0));
      (entriesRes.data || []).forEach((e: any) => {
        const t = (e.breakfast || 0) + (e.lunch || 0) + (e.dinner || 0);
        totals.set(e.roommate_id, (totals.get(e.roommate_id) || 0) + t);
      });
      const rows = roommates.map(r => {
        const points = totals.get(r.id) || 0;
        return { id: r.id, name: r.full_name, points, payable: points * charge };
      });
      const totalPoints = rows.reduce((s, r) => s + r.points, 0);
      const totalRevenue = totalPoints * charge;
      return { rows, charge, totalPoints, totalRevenue };
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
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total points</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{data.totalPoints}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Meal revenue</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(data.totalRevenue)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">This month — by roommate</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!data.rows.length ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No roommates yet.</div>
          ) : (
            <ul className="divide-y">
              {data.rows.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.points} point{r.points === 1 ? "" : "s"}</div>
                  </div>
                  <div className="text-right font-semibold">{formatCurrency(r.payable)}</div>
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
              <div className="text-[11px] uppercase text-muted-foreground">Charge</div>
              <div className="mt-0.5 text-base font-semibold">{formatCurrency(data.charge)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-[11px] uppercase text-muted-foreground">Points</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums">{data.totalPoints}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <div className="text-[11px] uppercase text-muted-foreground">Revenue</div>
              <div className="mt-0.5 text-base font-semibold">{formatCurrency(data.totalRevenue)}</div>
            </CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Payable per roommate</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!data.rows.length ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No data.</div>
              ) : (
                <ul className="divide-y">
                  {data.rows.map(r => (
                    <li key={r.id} className="flex items-center justify-between p-4">
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.points} pts × {formatCurrency(data.charge)}</div>
                      </div>
                      <div className="font-semibold">{formatCurrency(r.payable)}</div>
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
