import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGroup } from "@/hooks/useGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Pencil, Trash2, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { formatCurrency } from "@/lib/currency";
import { notifyGroup } from "@/lib/notify";
import { pointsFor, formatPoints, splitByPoints, type MealWeights } from "@/lib/meals";

const CATEGORIES = ["Rent", "Electricity", "Water", "Internet", "Groceries", "Maintenance", "Other"];

interface Roommate { id: string; full_name: string }
interface Expense {
  id: string; title: string; amount: number; category: string; expense_date: string;
  paid_by: string; split_type: "equal" | "manual" | "meal_points"; notes: string | null;
}
interface Split { roommate_id: string; amount: number }

export default function ExpensesPage() {
  const { data: group } = useGroup();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const { data: roommates } = useQuery({
    queryKey: ["roommates", group?.id],
    enabled: !!group?.id,
    queryFn: async (): Promise<Roommate[]> => {
      const { data, error } = await supabase.from("roommates")
        .select("id, full_name").eq("group_id", group!.id).order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: expenses, isLoading } = useQuery({
    queryKey: ["expenses", group?.id],
    enabled: !!group?.id,
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await supabase.from("expenses")
        .select("id, title, amount, category, expense_date, paid_by, split_type, notes")
        .eq("group_id", group!.id)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((e: any) => ({ ...e, amount: Number(e.amount) }));
    },
  });

  const roommateName = (id: string) => roommates?.find(r => r.id === id)?.full_name ?? "—";

  const del = useMutation({
    mutationFn: async (e: Expense) => {
      const { error } = await supabase.from("expenses").delete().eq("id", e.id);
      if (error) throw error;
      if (group?.id) {
        await notifyGroup(group.id, "expense_deleted", "Expense removed", `${e.title} (${formatCurrency(e.amount)}) was deleted`);
      }
    },
    onSuccess: () => {
      toast.success("Expense deleted");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isOwner = group?.isOwner;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">Track and split shared costs</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }} disabled={!roommates?.length}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>

      {!roommates?.length && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Add at least one roommate before creating expenses.
        </CardContent></Card>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !expenses?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No expenses yet</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {expenses.map((e) => (
            <li key={e.id}>
              <Card>
                <CardContent className="flex items-start gap-3 p-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate font-medium">{e.title}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(e.amount)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="font-normal">{e.category}</Badge>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {roommateName(e.paid_by)} · {format(new Date(e.expense_date), "MMM d")}
                      </span>
                    </div>
                  </div>
                  {isOwner && (
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(e); setOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm(`Delete ${e.title}?`)) del.mutate(e); }}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ExpenseDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        roommates={roommates || []}
        groupId={group?.id}
      />
    </div>
  );
}

function ExpenseDialog({
  open, onOpenChange, editing, roommates, groupId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  editing: Expense | null;
  roommates: Roommate[];
  groupId?: string;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Other");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paidBy, setPaidBy] = useState("");
  const [notes, setNotes] = useState("");
  const [splitType, setSplitType] = useState<"equal" | "manual" | "meal_points">("equal");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<Record<string, string>>({});

  const { data: existingSplits } = useQuery({
    queryKey: ["splits", editing?.id],
    enabled: !!editing && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_splits")
        .select("roommate_id, amount").eq("expense_id", editing!.id);
      if (error) throw error;
      return (data || []).map((s: any) => ({ roommate_id: s.roommate_id, amount: Number(s.amount) }));
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setAmount(String(editing.amount));
      setCategory(editing.category);
      setDate(editing.expense_date);
      setPaidBy(editing.paid_by);
      setNotes(editing.notes ?? "");
      setSplitType(editing.split_type);
    } else {
      setTitle(""); setAmount(""); setCategory("Other");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setPaidBy(roommates[0]?.id ?? "");
      setNotes(""); setSplitType("equal");
      setSelected(new Set(roommates.map(r => r.id)));
      setManual({});
    }
  }, [open, editing, roommates]);

  // Auto-suggest meal-points split when picking Groceries (only on a fresh form)
  useEffect(() => {
    if (!open || editing) return;
    if (category === "Groceries") setSplitType("meal_points");
  }, [category, open, editing]);

  useEffect(() => {
    if (editing && existingSplits) {
      setSelected(new Set(existingSplits.map(s => s.roommate_id)));
      const m: Record<string, string> = {};
      existingSplits.forEach(s => { m[s.roommate_id] = String(s.amount); });
      setManual(m);
    }
  }, [existingSplits, editing]);

  // Meal points for the month of the expense — used when split type is meal_points
  const monthKey = useMemo(() => {
    const d = date ? parseISO(date) : new Date();
    return {
      start: format(startOfMonth(d), "yyyy-MM-dd"),
      end: format(endOfMonth(d), "yyyy-MM-dd"),
    };
  }, [date]);

  const { data: mealPoints } = useQuery({
    queryKey: ["meal-points-for-split", groupId, monthKey.start, monthKey.end],
    enabled: !!groupId && open,
    queryFn: async () => {
      const [entriesRes, settingsRes] = await Promise.all([
        supabase
          .from("meal_entries")
          .select("roommate_id, breakfast, lunch, dinner")
          .eq("group_id", groupId!)
          .gte("entry_date", monthKey.start)
          .lte("entry_date", monthKey.end),
        supabase
          .from("meal_settings")
          .select("breakfast_weight, lunch_weight, dinner_weight")
          .eq("group_id", groupId!)
          .maybeSingle(),
      ]);
      if (entriesRes.error) throw entriesRes.error;
      const weights: MealWeights = {
        breakfast: Number(settingsRes.data?.breakfast_weight ?? 1),
        lunch: Number(settingsRes.data?.lunch_weight ?? 1),
        dinner: Number(settingsRes.data?.dinner_weight ?? 1),
      };
      const map = new Map<string, number>();
      (entriesRes.data || []).forEach((e: any) => {
        const t = pointsFor(e, weights);
        map.set(e.roommate_id, (map.get(e.roommate_id) || 0) + t);
      });
      return map;
    },
  });

  const numericAmount = parseFloat(amount) || 0;
  const manualTotal = useMemo(() =>
    Array.from(selected).reduce((sum, id) => sum + (parseFloat(manual[id]) || 0), 0),
    [manual, selected]
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!groupId) throw new Error("No group");
      if (!title.trim()) throw new Error("Title required");
      if (numericAmount <= 0) throw new Error("Amount must be greater than 0");
      if (!paidBy) throw new Error("Select who paid");
      if (selected.size === 0) throw new Error("Select at least one roommate to split with");

      const ids = Array.from(selected);
      let splits: Split[] = [];
      if (splitType === "equal") {
        const totalCents = Math.round(numericAmount * 100);
        const baseCents = Math.floor(totalCents / ids.length);
        const remainderCents = totalCents - baseCents * ids.length;
        splits = ids.map((id, i) => ({
          roommate_id: id,
          amount: (baseCents + (i < remainderCents ? 1 : 0)) / 100,
        }));
      } else if (splitType === "meal_points") {
        const points = ids.map(id => mealPoints?.get(id) || 0);
        const totalPts = points.reduce((s, n) => s + n, 0);
        if (totalPts <= 0) {
          throw new Error("No meals logged for this month — log meals first or pick another split.");
        }
        const shares = splitByPoints(numericAmount, points);
        splits = ids.map((id, i) => ({ roommate_id: id, amount: shares[i] }));
      } else {
        splits = ids.map(id => ({ roommate_id: id, amount: parseFloat(manual[id]) || 0 }));
        const total = splits.reduce((s, x) => s + x.amount, 0);
        if (Math.abs(total - numericAmount) > 0.01) {
          throw new Error(`Manual split total (${total.toFixed(2)}) must equal expense amount (${numericAmount.toFixed(2)})`);
        }
      }

      const payload = {
        group_id: groupId,
        title: title.trim(),
        amount: numericAmount,
        category,
        expense_date: date,
        paid_by: paidBy,
        split_type: splitType,
        notes: notes.trim() || null,
      };

      let expenseId: string;
      if (editing) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", editing.id);
        if (error) throw error;
        expenseId = editing.id;
        await supabase.from("expense_splits").delete().eq("expense_id", expenseId);
      } else {
        const { data, error } = await supabase.from("expenses").insert(payload).select("id").single();
        if (error) throw error;
        expenseId = data.id;
      }
      const { error: spErr } = await supabase
        .from("expense_splits")
        .insert(splits.map(s => ({ ...s, expense_id: expenseId })));
      if (spErr) throw spErr;

      // Notify group members
      await notifyGroup(
        groupId,
        editing ? "expense_updated" : "expense_added",
        editing ? "Expense updated" : "New expense added",
        `${title.trim()} — ${formatCurrency(numericAmount)}`
      );
    },
    onSuccess: () => {
      toast.success(editing ? "Expense updated" : "Expense added");
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit expense" : "Add expense"}</DialogTitle>
        </DialogHeader>
        <form id="exp-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input type="number" inputMode="decimal" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Paid by *</Label>
              <Select value={paidBy} onValueChange={setPaidBy}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {roommates.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>How to split the bill</Label>
            <RadioGroup
              value={splitType}
              onValueChange={(v) => setSplitType(v as any)}
              className="grid grid-cols-3 gap-2"
            >
              {([
                { v: "equal", label: "Equal" },
                { v: "meal_points", label: "By meals" },
                { v: "manual", label: "Custom" },
              ] as const).map((opt) => (
                <label
                  key={opt.v}
                  htmlFor={`split-${opt.v}`}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                    splitType === opt.v ? "border-primary bg-primary/5 font-semibold" : "border-input"
                  }`}
                >
                  <RadioGroupItem id={`split-${opt.v}`} value={opt.v} />
                  <span className="truncate">{opt.label}</span>
                </label>
              ))}
            </RadioGroup>
            {splitType === "meal_points" && (
              <p className="text-[11px] text-muted-foreground">
                Food bill will be divided based on meals eaten in {format(parseISO(monthKey.start), "MMM yyyy")}.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <Label className="text-xs uppercase text-muted-foreground">Split among</Label>
            <div className="space-y-2">
              {roommates.map((r) => {
                const checked = selected.has(r.id);
                const pts = mealPoints?.get(r.id) || 0;
                return (
                  <div key={r.id} className="flex items-center gap-3">
                    <Checkbox checked={checked} onCheckedChange={() => toggleSelect(r.id)} />
                    <span className="flex-1 truncate text-sm">{r.full_name}</span>
                    {splitType === "manual" && checked && (
                      <Input
                        type="number" inputMode="decimal" step="0.01" min="0"
                        className="h-8 w-28"
                        placeholder="0.00"
                        value={manual[r.id] ?? ""}
                        onChange={(e) => setManual({ ...manual, [r.id]: e.target.value })}
                      />
                    )}
                    {splitType === "meal_points" && checked && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {formatPoints(pts)} meal{pts === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {splitType === "manual" && selected.size > 0 && (
              <div className={`mt-2 flex justify-between text-xs ${Math.abs(manualTotal - numericAmount) > 0.01 ? "text-destructive" : "text-success"}`}>
                <span>Total split: {formatCurrency(manualTotal)}</span>
                <span>Expense: {formatCurrency(numericAmount)}</span>
              </div>
            )}
          </div>

          {numericAmount > 0 && selected.size > 0 && (
            <SplitPreview
              amount={numericAmount}
              splitType={splitType}
              selected={selected}
              roommates={roommates}
              mealPoints={mealPoints}
              manual={manual}
            />
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button form="exp-form" type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SplitPreview({
  amount, splitType, selected, roommates, mealPoints, manual,
}: {
  amount: number;
  splitType: "equal" | "manual" | "meal_points";
  selected: Set<string>;
  roommates: Roommate[];
  mealPoints?: Map<string, number>;
  manual: Record<string, string>;
}) {
  const ids = roommates.filter((r) => selected.has(r.id)).map((r) => r.id);
  if (!ids.length || !(amount > 0)) return null;

  let shares: number[] = [];
  let pts: number[] = [];

  if (splitType === "equal") {
    const totalCents = Math.round(amount * 100);
    const baseCents = Math.floor(totalCents / ids.length);
    const remainder = totalCents - baseCents * ids.length;
    shares = ids.map((_, i) => (baseCents + (i < remainder ? 1 : 0)) / 100);
  } else if (splitType === "meal_points") {
    pts = ids.map((id) => mealPoints?.get(id) || 0);
    shares = splitByPoints(amount, pts);
  } else {
    shares = ids.map((id) => parseFloat(manual[id]) || 0);
  }

  const totalPts = pts.reduce((s, n) => s + n, 0);
  const sum = shares.reduce((s, n) => s + n, 0);
  const noMealData = splitType === "meal_points" && totalPts <= 0;

  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">Live preview</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">Total {formatCurrency(amount)}</div>
      </div>
      {noMealData ? (
        <p className="text-xs text-destructive">No meals logged for this month — log meals or pick another split.</p>
      ) : (
        <ul className="space-y-1">
          {ids.map((id, i) => {
            const r = roommates.find((x) => x.id === id);
            return (
              <li key={id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{r?.full_name ?? "—"}</span>
                <span className="text-right tabular-nums">
                  {splitType === "meal_points" && (
                    <span className="mr-2 text-[11px] text-muted-foreground">{formatPoints(pts[i])} meals</span>
                  )}
                  <span className="font-semibold">{formatCurrency(shares[i] || 0)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground tabular-nums">
        <span>Sum of shares</span>
        <span className={Math.abs(sum - amount) > 0.01 ? "text-destructive" : ""}>{formatCurrency(sum)}</span>
      </div>
    </div>
  );
}
