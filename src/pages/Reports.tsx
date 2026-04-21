import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGroup } from "@/hooks/useGroup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { formatCurrency } from "@/lib/currency";

const COLORS = ["#1f7aed", "#4ea8ff", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const CATEGORIES = ["All", "Rent", "Electricity", "Water", "Internet", "Groceries", "Maintenance", "Other"];

export default function ReportsPage() {
  const { data: group } = useGroup();
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [category, setCategory] = useState("All");
  const [roommateId, setRoommateId] = useState("all");

  const monthStart = `${month}-01`;
  const monthEnd = format(endOfMonth(parseISO(monthStart)), "yyyy-MM-dd");

  const { data: roommates } = useQuery({
    queryKey: ["roommates", group?.id],
    enabled: !!group?.id,
    queryFn: async () => {
      const { data } = await supabase.from("roommates").select("id, full_name").eq("group_id", group!.id);
      return data || [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["reports", group?.id, month, category, roommateId],
    enabled: !!group?.id,
    queryFn: async () => {
      const sixAgo = format(startOfMonth(subMonths(parseISO(monthStart), 5)), "yyyy-MM-dd");

      const [trendRes, monthRes, splitRes, mealRes, mealSettingsRes] = await Promise.all([
        // 6-month trend
        supabase.from("expenses")
          .select("amount, expense_date, category")
          .eq("group_id", group!.id)
          .gte("expense_date", sixAgo)
          .lte("expense_date", monthEnd),
        // current-month expenses (for category pie + per-payer totals)
        supabase.from("expenses")
          .select("id, amount, category, paid_by")
          .eq("group_id", group!.id)
          .gte("expense_date", monthStart).lte("expense_date", monthEnd),
        // splits joined to expenses for the same period
        supabase.from("expense_splits")
          .select("amount, roommate_id, expense:expenses!inner(group_id, expense_date, category)")
          .eq("expense.group_id", group!.id)
          .gte("expense.expense_date", monthStart).lte("expense.expense_date", monthEnd),
        // meal entries this month
        supabase.from("meal_entries")
          .select("roommate_id, breakfast, lunch, dinner")
          .eq("group_id", group!.id)
          .gte("entry_date", monthStart).lte("entry_date", monthEnd),
        supabase.from("meal_settings").select("meal_charge").eq("group_id", group!.id).maybeSingle(),
      ]);

      // Trend by month
      const trendMap = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const m = format(subMonths(parseISO(monthStart), i), "yyyy-MM");
        trendMap.set(m, 0);
      }
      (trendRes.data || []).forEach((e: any) => {
        if (category !== "All" && e.category !== category) return;
        const m = e.expense_date.slice(0, 7);
        if (trendMap.has(m)) trendMap.set(m, (trendMap.get(m) || 0) + Number(e.amount));
      });
      const trend = Array.from(trendMap.entries()).map(([m, v]) => ({
        month: format(parseISO(`${m}-01`), "MMM"),
        amount: Math.round(v * 100) / 100,
      }));

      // Filter expenses for current month by category and (optionally) payer
      const monthExpenses = (monthRes.data || []).filter((e: any) =>
        (category === "All" || e.category === category) &&
        (roommateId === "all" || e.paid_by === roommateId)
      );

      // Category pie
      const catMap = new Map<string, number>();
      monthExpenses.forEach((e: any) => {
        catMap.set(e.category, (catMap.get(e.category) || 0) + Number(e.amount));
      });
      const byCategory = Array.from(catMap.entries()).map(([name, value]) => ({
        name, value: Math.round(value * 100) / 100,
      }));

      // Per-roommate spending (paid)
      const paidMap = new Map<string, number>();
      (roommates || []).forEach(r => paidMap.set(r.id, 0));
      (monthRes.data || []).forEach((e: any) => {
        if (category !== "All" && e.category !== category) return;
        paidMap.set(e.paid_by, (paidMap.get(e.paid_by) || 0) + Number(e.amount));
      });

      // Per-roommate owed
      const owedMap = new Map<string, number>();
      (roommates || []).forEach(r => owedMap.set(r.id, 0));
      (splitRes.data || []).forEach((s: any) => {
        if (category !== "All" && s.expense?.category !== category) return;
        owedMap.set(s.roommate_id, (owedMap.get(s.roommate_id) || 0) + Number(s.amount));
      });

      // Meal payable
      const charge = Number(mealSettingsRes.data?.meal_charge ?? 0);
      const mealPts = new Map<string, number>();
      (roommates || []).forEach(r => mealPts.set(r.id, 0));
      (mealRes.data || []).forEach((e: any) => {
        const t = (e.breakfast || 0) + (e.lunch || 0) + (e.dinner || 0);
        mealPts.set(e.roommate_id, (mealPts.get(e.roommate_id) || 0) + t);
      });

      const perRoommate = (roommates || []).map(r => ({
        id: r.id,
        name: r.full_name,
        paid: paidMap.get(r.id) || 0,
        owed: owedMap.get(r.id) || 0,
        net: (paidMap.get(r.id) || 0) - (owedMap.get(r.id) || 0),
        mealPoints: mealPts.get(r.id) || 0,
        mealPayable: (mealPts.get(r.id) || 0) * charge,
      }));

      const totalSpent = monthExpenses.reduce((s: number, e: any) => s + Number(e.amount), 0);

      return { trend, byCategory, perRoommate, totalSpent, mealCharge: charge };
    },
  });

  const filteredPerRoommate = useMemo(() => {
    if (!data) return [];
    if (roommateId === "all") return data.perRoommate;
    return data.perRoommate.filter(r => r.id === roommateId);
  }, [data, roommateId]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Spending trends and meal payables</p>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-[11px] uppercase text-muted-foreground">Month</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase text-muted-foreground">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] uppercase text-muted-foreground">Roommate</Label>
            <Select value={roommateId} onValueChange={setRoommateId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {(roommates || []).map(r => <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">6-month trend</CardTitle></CardHeader>
            <CardContent className="h-60 px-2 pb-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                    formatter={(v: any) => formatCurrency(Number(v))}
                  />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">By category</CardTitle>
              <p className="text-xs text-muted-foreground">Total this month: {formatCurrency(data.totalSpent)}</p>
            </CardHeader>
            <CardContent className="h-72 px-2 pb-3">
              {!data.byCategory.length ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No expenses this month.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.byCategory} dataKey="value" nameKey="name" outerRadius={88} innerRadius={48} paddingAngle={2}>
                      {data.byCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Per roommate</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!filteredPerRoommate.length ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No data.</div>
              ) : (
                <ul className="divide-y">
                  {filteredPerRoommate.map(r => (
                    <li key={r.id} className="space-y-1 p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{r.name}</span>
                        <span className={`text-sm font-semibold ${r.net > 0.01 ? "text-success" : r.net < -0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                          {r.net >= 0 ? "+" : ""}{formatCurrency(r.net)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                        <span>Paid: <span className="font-medium text-foreground">{formatCurrency(r.paid)}</span></span>
                        <span>Owes: <span className="font-medium text-foreground">{formatCurrency(r.owed)}</span></span>
                        <span>Meals: <span className="font-medium text-foreground">{formatCurrency(r.mealPayable)}</span></span>
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
