import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGroup } from "@/hooks/useGroup";
import { useBalances } from "./Settlements";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Receipt, Scale, TrendingUp, Loader2, UtensilsCrossed, Plus, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { data: group, isLoading: groupLoading } = useGroup();
  const { data: balances } = useBalances();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", group?.id],
    enabled: !!group?.id,
    queryFn: async () => {
      const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
      const [rmCount, monthExp, recentExp, mealEntries, mealSettings] = await Promise.all([
        supabase.from("roommates").select("id", { count: "exact", head: true }).eq("group_id", group!.id),
        supabase.from("expenses").select("amount").eq("group_id", group!.id)
          .gte("expense_date", monthStart).lte("expense_date", monthEnd),
        supabase.from("expenses")
          .select("id, title, amount, category, expense_date, paid_by")
          .eq("group_id", group!.id)
          .order("expense_date", { ascending: false }).order("created_at", { ascending: false })
          .limit(5),
        supabase.from("meal_entries")
          .select("breakfast, lunch, dinner")
          .eq("group_id", group!.id)
          .gte("entry_date", monthStart).lte("entry_date", monthEnd),
        supabase.from("meal_settings").select("meal_charge").eq("group_id", group!.id).maybeSingle(),
      ]);
      const monthSum = (monthExp.data || []).reduce((s: number, e: any) => s + Number(e.amount), 0);
      const points = (mealEntries.data || []).reduce(
        (s: number, e: any) => s + (e.breakfast || 0) + (e.lunch || 0) + (e.dinner || 0), 0
      );
      const mealRevenue = points * Number(mealSettings.data?.meal_charge ?? 0);
      return {
        roommateCount: rmCount.count ?? 0,
        monthSum,
        mealRevenue,
        mealPoints: points,
        recent: recentExp.data || [],
      };
    },
  });

  const { data: roommates } = useQuery({
    queryKey: ["roommates", group?.id],
    enabled: !!group?.id,
    queryFn: async () => {
      const { data } = await supabase.from("roommates").select("id, full_name").eq("group_id", group!.id);
      return data || [];
    },
  });
  const nameOf = (id: string) => roommates?.find(r => r.id === id)?.full_name ?? "—";

  const pendingSettlements = balances?.filter(b => Math.abs(b.net) > 0.01).length ?? 0;

  if (groupLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hi 👋</h1>
        <p className="text-sm text-muted-foreground">
          {group ? `Welcome to ${group.name}` : "Welcome"}
        </p>
      </div>

      <Card className="overflow-hidden border-0 shadow-[var(--shadow-elevated)]" style={{ background: "var(--gradient-primary)" }}>
        <CardContent className="space-y-4 p-5 text-primary-foreground">
          <div>
            <div className="text-xs uppercase tracking-wide opacity-80">This month spending</div>
            <div className="mt-0.5 text-3xl font-bold tabular-nums">{isLoading ? "…" : formatCurrency(stats?.monthSum ?? 0)}</div>
          </div>
          <div className="grid grid-cols-3 gap-3 border-t border-white/20 pt-3">
            <MiniStat label="People" value={String(stats?.roommateCount ?? 0)} />
            <MiniStat label="Pending" value={String(pendingSettlements)} />
            <MiniStat label="Meals" value={String(stats?.mealPoints ?? 0)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Receipt} label="Add expense" to="/expenses" />
        <StatCard icon={UtensilsCrossed} label="Log meals" to="/meals" />
        <StatCard icon={Scale} label="Settle up" to="/settlements" />
        <StatCard icon={TrendingUp} label="Reports" to="/reports" />
      </div>

      <SectionCard
        title="Recent expenses"
        action={<Link to="/expenses" className="flex items-center text-xs font-medium text-primary">View all <ArrowRight className="ml-0.5 h-3 w-3" /></Link>}
      >
        {!stats?.recent?.length ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <Receipt className="h-8 w-8" />
            <p>No expenses yet</p>
            {group?.isOwner && (
              <Button asChild size="sm" variant="outline" className="mt-1">
                <Link to="/expenses"><Plus className="mr-1 h-3.5 w-3.5" />Add the first one</Link>
              </Button>
            )}
          </div>
        ) : (
          <ul className="divide-y">
            {stats.recent.map((e: any) => (
              <li key={e.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{e.title}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {e.category} · {nameOf(e.paid_by)} · {format(new Date(e.expense_date), "MMM d")}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Top balances" action={<Link to="/settlements" className="flex items-center text-xs font-medium text-primary">Settle <ArrowRight className="ml-0.5 h-3 w-3" /></Link>}>
        {!balances?.length ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Add roommates and expenses to see balances.</div>
        ) : (
          <ul className="divide-y">
            {balances.slice(0, 5).map(b => (
              <li key={b.id} className="flex items-center justify-between p-3.5 text-sm">
                <span className="font-medium">{b.name}</span>
                <span className={`font-semibold tabular-nums ${b.net > 0.01 ? "text-success" : b.net < -0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                  {b.net >= 0 ? "+" : ""}{formatCurrency(b.net)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wide opacity-75">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function StatCard({ icon: Icon, label, to }: { icon: any; label: string; to: string }) {
  return (
    <Link to={to}>
      <Card className="h-full transition-transform active:scale-[0.97]">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Icon className="h-5 w-5" />
          </div>
          <span className="text-sm font-medium">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <Card><CardContent className="p-0">{children}</CardContent></Card>
    </div>
  );
}
