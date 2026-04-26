import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGroup } from "@/hooks/useGroup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";

export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: group, isLoading: groupLoading } = useGroup();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentInfo, setPaymentInfo] = useState("");
  const [saving, setSaving] = useState(false);

  const getSaveErrorMessage = (message?: string) => {
    const normalized = message?.toLowerCase() ?? "";
    if (normalized.includes("full name is required")) return "Please enter your full name to continue.";
    if (normalized.includes("not a member of this group")) return "We couldn't confirm your group access. Please try joining again.";
    if (normalized.includes("not authenticated")) return "Please sign in again to continue.";
    return "Unable to save your details right now. Please try again.";
  };

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["member-profile", user?.id, group?.id],
    enabled: !!user && !!group?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_profiles" as any)
        .select("full_name, email, phone, preferred_payment_info")
        .eq("user_id", user!.id)
        .eq("group_id", group!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as {
        full_name?: string | null;
        email?: string | null;
        phone?: string | null;
        preferred_payment_info?: string | null;
      } | null;
    },
  });

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
    setPaymentInfo(profile.preferred_payment_info ?? "");
  }, [profile]);

  useEffect(() => {
    if (group && group.isOwner) navigate("/", { replace: true });
  }, [group, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group?.id) return toast.error("No group found");
    if (!fullName.trim()) return toast.error("Full name is required");

    setSaving(true);
    const { error } = await (supabase as any).rpc("complete_member_profile", {
      _group_id: group.id,
      _full_name: fullName.trim(),
      _phone: phone.trim() || null,
      _preferred_payment_info: paymentInfo.trim() || null,
    });
    setSaving(false);

    if (error) return toast.error(getSaveErrorMessage(error.message));

    await Promise.all([
      qc.invalidateQueries({ queryKey: ["member-profile"] }),
      qc.invalidateQueries({ queryKey: ["member-profile-check"] }),
      qc.invalidateQueries({ queryKey: ["roommates"] }),
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      qc.invalidateQueries({ queryKey: ["balances"] }),
    ]);

    toast.success("You have successfully joined the group.");
    navigate("/", { replace: true });
  };

  if (groupLoading || profileLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Complete profile</h1>
        <p className="text-sm text-muted-foreground">Finish your details to join {group?.name ?? "the group"}.</p>
      </div>

      <Card className="shadow-[var(--shadow-elevated)]">
        <CardHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <UserRoundCheck className="h-6 w-6" />
          </div>
          <CardTitle>Your member details</CardTitle>
          <CardDescription>{profile?.email ?? user?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full-name">Full name</Label>
              <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Contact number</Label>
              <Input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment">Preferred payment info</Label>
              <Input id="payment" value={paymentInfo} onChange={(e) => setPaymentInfo(e.target.value)} placeholder="Optional" />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save and continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}