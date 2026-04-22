import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGroup } from "@/hooks/useGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, Users, Phone, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Roommate {
  id: string;
  full_name: string;
  room_number: string;
  phone: string | null;
  join_date: string;
}

export default function RoommatesPage() {
  const { data: group } = useGroup();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Roommate | null>(null);
  const [form, setForm] = useState({ full_name: "", room_number: "", phone: "", join_date: format(new Date(), "yyyy-MM-dd") });

  const { data: roommates, isLoading } = useQuery({
    queryKey: ["roommates", group?.id],
    enabled: !!group?.id,
    queryFn: async (): Promise<Roommate[]> => {
      const { data, error } = await supabase
        .from("roommates")
        .select("id, full_name, room_number, phone, join_date")
        .eq("group_id", group!.id)
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!group) throw new Error("No group");
      if (!form.full_name.trim()) throw new Error("Full name required");
      if (!form.room_number.trim()) throw new Error("Room number required");
      const payload = {
        group_id: group.id,
        full_name: form.full_name.trim(),
        room_number: form.room_number.trim(),
        phone: form.phone.trim() || null,
        join_date: form.join_date,
      };
      if (editing) {
        const { error } = await supabase.from("roommates").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("roommates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Roommate updated" : "Roommate added");
      qc.invalidateQueries({ queryKey: ["roommates"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("roommates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Roommate removed");
      qc.invalidateQueries({ queryKey: ["roommates"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ full_name: "", room_number: "", phone: "", join_date: format(new Date(), "yyyy-MM-dd") });
    setOpen(true);
  };
  const openEdit = (r: Roommate) => {
    setEditing(r);
    setForm({ full_name: r.full_name, room_number: r.room_number, phone: r.phone ?? "", join_date: r.join_date });
    setOpen(true);
  };

  const isOwner = group?.isOwner;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Roommates</h1>
          <p className="text-sm text-muted-foreground">Manage people in your group</p>
        </div>
        {isOwner && (
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !roommates?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No roommates yet</p>
            {isOwner && <Button onClick={openNew} variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" />Add the first roommate</Button>}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {roommates.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="flex items-center gap-3 p-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-foreground">
                    {r.full_name.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.full_name}</span>
                      <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">Room {r.room_number}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                      {r.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.phone}</span>}
                      {r.join_date && !isNaN(new Date(r.join_date).getTime()) && (
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{format(new Date(r.join_date), "MMM yyyy")}</span>
                      )}
                    </div>
                  </div>
                  {isOwner && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { if (confirm(`Remove ${r.full_name}?`)) del.mutate(r.id); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit roommate" : "Add roommate"}</DialogTitle>
          </DialogHeader>
          <form id="rm-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-2">
              <Label>Full name *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Room number *</Label>
                <Input value={form.room_number} onChange={(e) => setForm({ ...form, room_number: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Join date</Label>
              <Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button form="rm-form" type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
