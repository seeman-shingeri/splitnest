import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Ticket } from "lucide-react";

export default function JoinPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [user, loading, navigate]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return toast.error("Enter a referral code");
    setBusy(true);
    try {
      // Find unused code
      const { data: rc, error: rcErr } = await supabase
        .from("referral_codes")
        .select("id, group_id, used")
        .eq("code", trimmed)
        .maybeSingle();
      if (rcErr) throw rcErr;
      if (!rc) throw new Error("Invalid referral code");
      if (rc.used) throw new Error("This referral code has already been used");

      // Mark code as used
      const { error: updErr } = await supabase
        .from("referral_codes")
        .update({ used: true, used_by: user.id, used_at: new Date().toISOString() })
        .eq("id", rc.id)
        .eq("used", false);
      if (updErr) throw updErr;

      // Add membership
      const { error: memErr } = await supabase
        .from("group_members")
        .insert({ group_id: rc.group_id, user_id: user.id, role: "member" });
      if (memErr && !memErr.message.includes("duplicate")) throw memErr;

      // Auto-generate a fresh code for that group (best-effort; may be blocked by RLS for non-owner — ignored)
      // Owner-only via RLS, so skip from this client.

      toast.success("You've joined the group!");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to join");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <Card className="w-full max-w-md shadow-[var(--shadow-elevated)]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Ticket className="h-6 w-6" />
          </div>
          <CardTitle>Join a group</CardTitle>
          <CardDescription>Enter the referral code your group owner shared with you</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Referral code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD1234"
                className="text-center font-mono text-lg tracking-widest"
                maxLength={16}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Join group
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/")}>
              Skip
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
