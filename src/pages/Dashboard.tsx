import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGroup } from "@/hooks/useGroup";
import { useBalances } from "./Settlements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Receipt, Scale, TrendingUp, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Button } from "@/components/ui/button";
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
      const [rmCount, monthExp, totalExp] = await Promise.all([
        supabase.from("roommates").select("id", { count: "exact", head: true }).eq("group_id", group!.id),
        supabase.from("expenses").select("amount").eq("group_id", group!.id)
          .gte("expense_date", monthStart).lte("expense_date", monthEnd),
        supabase.from("expenses").select("amount").eq("group_id", group!.id),
      ]);
      const monthSum = (monthExp.data || []).reduce((s: number, e: any) => s + Number(e.amount), 0);
      const totalSum = (totalExp.data || []).reduce((s: number, e: any) => s + Number(e.amount), 0);
      return {
        roommateCount: rmCount.count ?? 0,
        monthSum,
        totalSum,
      };
    },
  });

  const pendingSettlements = balances?.filter(b => Math.abs(b.net) > 0.01).length ?? 0;

  if (groupLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back{group ? ` to ${group.name}` : ""}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Roommates" value={String(stats?.roommateCount ?? 0)} loading={isLoading} />
        <StatCard icon={Receipt} label="This month" value={formatCurrency(stats?.monthSum ?? 0)} loading={isLoading} />
        <StatCard icon={TrendingUp} label="Total expenses" value={formatCurrency(stats?.totalSum ?? 0)} loading={isLoading} />
        <StatCard icon={Scale} label="Pending settlements" value={String(pendingSettlements)} loading={isLoading} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link to="/roommates">Manage roommates</Link></Button>
            <Button asChild variant="outline"><Link to="/expenses">Add expense</Link></Button>
            <Button asChild variant="outline"><Link to="/settlements">View settlements</Link></Button>
            {group?.isOwner && <Button asChild variant="outline"><Link to="/referral">Referral code</Link></Button>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top balances</CardTitle></CardHeader>
          <CardContent>
            {!balances?.length ? (
              <p className="text-sm text-muted-foreground">No data yet — add roommates and expenses to see balances.</p>
            ) : (
              <ul className="space-y-2">
                {balances.slice(0, 5).map(b => (
                  <li key={b.id} className="flex items-center justify-between text-sm">
                    <span>{b.name}</span>
                    <span className={`font-semibold ${b.net > 0.01 ? "text-success" : b.net < -0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                      {b.net >= 0 ? "+" : ""}{formatCurrency(b.net)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, loading }: { icon: any; label: string; value: string; loading: boolean }) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="truncate text-xl font-bold">{loading ? "…" : value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
