import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGroup } from "@/hooks/useGroup";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Scale, ArrowRight, CheckCircle2, Check } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";
import { notifyGroup } from "@/lib/notify";

interface Roommate { id: string; full_name: string }

export function useBalances() {
  const { data: group } = useGroup();

  return useQuery({
    queryKey: ["balances", group?.id],
    enabled: !!group?.id,
    queryFn: async () => {
      const [rmRes, expRes, splitRes, paymentsRes] = await Promise.all([
        supabase.from("roommates").select("id, full_name").eq("group_id", group!.id),
        supabase.from("expenses").select("id, paid_by, amount").eq("group_id", group!.id),
        supabase.from("expense_splits")
          .select("roommate_id, amount, expense:expenses!inner(group_id)")
          .eq("expense.group_id", group!.id),
        supabase.from("settlement_payments")
          .select("from_roommate_id, to_roommate_id, amount")
          .eq("group_id", group!.id),
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
      // Recorded settlement payments shift the net: payer reduces what they owe; payee reduces what they're owed.
      (paymentsRes.data || []).forEach((p: any) => {
        const amt = Number(p.amount);
        paid.set(p.from_roommate_id, (paid.get(p.from_roommate_id) || 0) + amt);
        owed.set(p.to_roommate_id, (owed.get(p.to_roommate_id) || 0) + amt);
      });
      return roommates.map(r => {
        const p = paid.get(r.id) || 0;
        const o = owed.get(r.id) || 0;
        return { id: r.id, name: r.full_name, paid: p, owed: o, net: p - o };
      });
    },
  });
}

interface Settlement { from: string; fromName: string; to: string; toName: string; amount: number }

function computeSettlements(balances: { id: string; name: string; net: number }[]): Settlement[] {
  const debtors = balances.filter(b => b.net < -0.01).map(b => ({ ...b, net: -b.net }));
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
  const { data: group } = useGroup();
  const { data: balances, isLoading } = useBalances();
  const qc = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const settlements = balances ? computeSettlements(balances) : [];

  const markPaid = useMutation({
    mutationFn: async (s: Settlement) => {
      if (!group?.id) throw new Error("No group");
      const { error } = await supabase.from("settlement_payments").insert({
        group_id: group.id,
        from_roommate_id: s.from,
        to_roommate_id: s.to,
        amount: s.amount,
      });
      if (error) throw error;
      await notifyGroup(
        group.id,
        "settlement_paid",
        "Settlement recorded",
        `${s.fromName} paid ${s.toName} ${formatCurrency(s.amount)}`
      );
    },
    onSuccess: () => {
      toast.success("Marked as paid");
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusyKey(null),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settlements</h1>
        <p className="text-sm text-muted-foreground">Who owes whom — calculated automatically</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <h2 className="text-sm font-semibold">Balances</h2>
          </div>
          {isLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : !balances?.length ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No roommates yet.</div>
          ) : (
            <ul className="divide-y">
              {balances.map(b => (
                <li key={b.id} className="space-y-1 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{b.name}</span>
                    <span className={`text-sm font-semibold tabular-nums ${b.net > 0.01 ? "text-success" : b.net < -0.01 ? "text-destructive" : "text-muted-foreground"}`}>
                      {b.net >= 0 ? "+" : ""}{formatCurrency(b.net)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <span>Paid: <span className="font-medium text-foreground">{formatCurrency(b.paid)}</span></span>
                    <span>Owes: <span className="font-medium text-foreground">{formatCurrency(b.owed)}</span></span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b p-4">
            <Scale className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Suggested settlements</h2>
          </div>
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : settlements.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <p>All settled up!</p>
            </div>
          ) : (
            <ul className="divide-y">
              {settlements.map((s, idx) => {
                const k = `${s.from}-${s.to}-${idx}`;
                return (
                  <li key={k} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{s.fromName}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{s.toName}</span>
                      </div>
                      <div className="mt-0.5 text-base font-semibold text-primary">{formatCurrency(s.amount)}</div>
                    </div>
                    {group?.isOwner && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyKey === k || markPaid.isPending}
                        onClick={() => { setBusyKey(k); markPaid.mutate(s); }}
                      >
                        {busyKey === k ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 h-4 w-4" /> Mark paid</>}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
