import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGroup } from "@/hooks/useGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Loader2, Users } from "lucide-react";
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
      toast.success("Roommate deleted");
      qc.invalidateQueries({ queryKey: ["roommates"] });
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
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Roommates</h1>
          <p className="text-muted-foreground">Manage people in your group</p>
        </div>
        {isOwner && (
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Add roommate
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : !roommates?.length ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Users className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">No roommates yet</p>
              {isOwner && <Button onClick={openNew} variant="outline"><Plus className="mr-2 h-4 w-4" />Add your first roommate</Button>}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead className="hidden md:table-cell">Phone</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  {isOwner && <TableHead className="w-24 text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {roommates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell>{r.room_number}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{r.phone ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{format(new Date(r.join_date), "MMM d, yyyy")}</TableCell>
                    {isOwner && (
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete ${r.full_name}?`)) del.mutate(r.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit roommate" : "Add roommate"}</DialogTitle>
          </DialogHeader>
          <form
            id="rm-form"
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
          >
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
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
