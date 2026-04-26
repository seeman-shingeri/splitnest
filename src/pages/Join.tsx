import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Ticket, ArrowLeft } from "lucide-react";
import { notifyGroup } from "@/lib/notify";
import { clearPendingReferralCode, getPendingReferralCode, setPendingReferralCode } from "@/lib/join-flow";

export default function JoinPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const autoRedeemRan = useRef(false);

  // Pre-fill the input from a previously-saved code (from before sign-in)
  useEffect(() => {
    const pending = getPendingReferralCode();
    if (pending) setCode(pending);
  }, []);

  const getJoinErrorMessage = (message?: string) => {
    const normalized = message?.toLowerCase() ?? "";
    if (normalized.includes("invalid referral code")) return "That referral code is invalid. Please check it and try again.";
    if (normalized.includes("already been used")) return "That referral code has already been used. Ask the group owner for a new one.";
    if (normalized.includes("already own this group")) return "You're already the owner of this group.";
    if (normalized.includes("not authenticated")) return "Please sign in to join this group.";
    return "Unable to join group right now. Please try again.";
  };

  const redeem = async (rawCode: string) => {
    const trimmed = rawCode.trim().toUpperCase();
    if (!trimmed) {
      toast.error("Enter a referral code");
      return;
    }
    setBusy(true);
    try {
      const { data: groupId, error: rpcErr } = await supabase.rpc("redeem_referral_code", {
        _code: trimmed,
      });
      if (rpcErr) throw rpcErr;
      if (!groupId) throw new Error("Failed to join group");

      await notifyGroup(
        groupId as string,
        "referral_used",
        "New member joined",
        `Someone joined using code ${trimmed}`,
      );

      clearPendingReferralCode();
      // Switch the active group to the one we just joined.
      try {
        const { setActiveGroupId } = await import("@/hooks/useGroup");
        setActiveGroupId(groupId as string);
      } catch {/* ignore */}
      toast.success("You've joined the group!");
      navigate("/complete-profile", { replace: true });
    } catch (err: any) {
      toast.error(getJoinErrorMessage(err?.message));
    } finally {
      setBusy(false);
    }
  };

  // If user signs in and we have a pending code, auto-redeem it
  useEffect(() => {
    if (loading || !user || autoRedeemRan.current) return;
    const pending = getPendingReferralCode();
    if (pending) {
      autoRedeemRan.current = true;
      redeem(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return toast.error("Enter a referral code");

    if (!user) {
      // Save code and send them to sign in / sign up
      setPendingReferralCode(trimmed);
      toast.info("Sign in or create an account to join the group");
      navigate("/auth", { replace: false });
      return;
    }

    await redeem(trimmed);
  };

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(user ? "/" : "/auth");
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center p-4"
      style={{ background: "var(--gradient-subtle)" }}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleBack}
        className="absolute left-3 top-3"
        aria-label="Go back"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Back
      </Button>
      <Card className="w-full max-w-md shadow-[var(--shadow-elevated)]">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Ticket className="h-6 w-6" />
          </div>
          <CardTitle>Join a group</CardTitle>
          <CardDescription>
            {user
              ? "Enter the referral code your group owner shared with you"
              : "Enter your code — you'll sign in or sign up next, then we'll add you to the group"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || loading}>
              {(busy || loading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {user ? "Join group" : "Continue"}
            </Button>
            {user ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  clearPendingReferralCode();
                  navigate("/", { replace: true });
                }}
              >
                Skip for now
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    clearPendingReferralCode();
                    navigate("/auth", { replace: true });
                  }}
                >
                  Skip — sign in without a code
                </Button>
                <div className="text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link to="/auth" className="text-primary hover:underline">
                    Sign in
                  </Link>
                </div>
              </>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
