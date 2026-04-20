import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGroup } from "@/hooks/useGroup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Scale, ArrowRight, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

interface Roommate { id: string; full_name: string }

export function useBalances() {
  const { data: group } = useGroup();

  return useQuery({
    queryKey: ["balances", group?.id],
    enabled: !!group?.id,
    queryFn: async () => {
      const [rmRes, expRes, splitRes] = await Promise.all([
        supabase.from("roommates").select("id, full_name").eq("group_id", group!.id),
        supabase.from("expenses").select("id, paid_by, amount").eq("group_id", group!.id),
        supabase.from("expense_splits")
          .select("roommate_id, amount, expense:expenses!inner(group_id)")
          .eq("expense.group_id", group!.id),
      ]);
      if (rmRes.error) throw rmRes.error;
      if (expRes.error) throw expRes.error;
      if (splitRes.error) throw splitRes.error;

      const roommates = (rmRes.data || []) as Roommate[];
      const paid = new Map<string, number>();
      const owed = new Map<string, number>();
      roommates.forEach(r => { paid.set(r.id, 0); owed.set(r.id, 0); });
      (expRes.data || []).forEach((e: any) => {
        paid.set(e.paid_by, (paid.get(e.paid_by) || 0) + Number(e.amount));
      });
      (splitRes.data || []).forEach((s: any) => {
        owed.set(s.roommate_id, (owed.get(s.roommate_id) || 0) + Number(s.amount));
      });
      const rows = roommates.map(r => {
        const p = paid.get(r.id) || 0;
        const o = owed.get(r.id) || 0;
        return { id: r.id, name: r.full_name, paid: p, owed: o, net: p - o };
      });
      return rows;
    },
  });
}

interface Settlement { from: string; fromName: string; to: string; toName: string; amount: number }

function computeSettlements(balances: { id: string; name: string; net: number }[]): Settlement[] {
  // Greedy min-transactions
  const debtors = balances.filter(b => b.net < -0.01).map(b => ({ ...b, net: -b.net })); // amount they owe
  const creditors = balances.filter(b => b.net > 0.01).map(b => ({ ...b }));
  debtors.sort((a, b) => b.net - a.net);
  creditors.sort((a, b) => b.net - a.net);

  const result: Settlement[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].net, creditors[j].net);
    if (pay > 0.01) {
      result.push({
        from: debtors[i].id, fromName: debtors[i].name,
        to: creditors[j].id, toName: creditors[j].name,
        amount: Math.round(pay * 100) / 100,
      });
    }
    debtors[i].net -= pay;
    creditors[j].net -= pay;
    if (debtors[i].net < 0.01) i++;
    if (creditors[j].net < 0.01) j++;
  }
  return result;
}

export default function SettlementsPage() {
  const { data: balances, isLoading } = useBalances();
  const settlements = balances ? computeSettlements(balances) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settlements</h1>
        <p className="text-muted-foreground">Who owes whom — calculated automatically</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Balances</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : !balances?.length ? (
              <div className="p-8 text-center text-muted-foreground">No roommates yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Roommate</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Owes</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map(b => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(b.paid)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(b.owed)}</TableCell>
                      <TableCell className={`text-right font-semibold ${b.net > 0.01 ? "text-success" : b.net < -0.01 ? "text-destructive" : ""}`}>
                        {b.net >= 0 ? "+" : ""}{formatCurrency(b.net)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="h-4 w-4 text-primary" /> Suggested settlements
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : settlements.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 text-success" />
                <p>All settled up!</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {settlements.map((s, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.fromName}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{s.toName}</span>
                    </div>
                    <span className="font-semibold text-primary">{formatCurrency(s.amount)}</span>
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
