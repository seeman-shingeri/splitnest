import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useGroup } from "@/hooks/useGroup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, Copy, Ticket } from "lucide-react";
import { toast } from "sonner";

function generateCode() {
  // 8-char uppercase alphanumeric, no ambiguous chars
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function ReferralPage() {
  const { data: group } = useGroup();
  const qc = useQueryClient();

  const { data: code, isLoading } = useQuery({
    queryKey: ["referral-active", group?.id],
    enabled: !!group?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_codes")
        .select("id, code, used, created_at")
        .eq("group_id", group!.id)
        .eq("used", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!group) throw new Error("No group");
      // Invalidate any existing unused codes (set used=true so only one is active)
      await supabase.from("referral_codes").update({ used: true }).eq("group_id", group.id).eq("used", false);
      const newCode = generateCode();
      const { error } = await supabase.from("referral_codes").insert({ group_id: group.id, code: newCode });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("New referral code generated");
      qc.invalidateQueries({ queryKey: ["referral-active"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code.code);
    toast.success("Code copied");
  };

  if (!group?.isOwner) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Owner only</CardTitle>
            <CardDescription>Only the group owner can manage referral codes.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Referral Code</h1>
        <p className="text-muted-foreground">Share a one-time code so someone can join your group</p>
      </div>

      <Card className="shadow-[var(--shadow-elevated)]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" /> Active code
          </CardTitle>
          <CardDescription>The code becomes invalid after one successful join. A new one is auto-generated when you click below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : code ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-accent p-6">
              <span className="font-mono text-3xl font-bold tracking-widest text-accent-foreground">{code.code}</span>
              <Button size="sm" variant="outline" onClick={copy}><Copy className="mr-2 h-4 w-4" />Copy</Button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
              No active code — generate one below.
            </div>
          )}
          <Button onClick={() => generate.mutate()} disabled={generate.isPending} className="w-full">
            {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {code ? "Generate new code" : "Generate code"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Share the code with someone you want to add to your group.</p>
          <p>2. They sign up, then visit <span className="font-mono text-foreground">/join</span> and enter the code.</p>
          <p>3. The code is invalidated after one use and a new one is auto-generated.</p>
        </CardContent>
      </Card>
    </div>
  );
}
