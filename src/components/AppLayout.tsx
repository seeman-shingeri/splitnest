import { Outlet, NavLink, useLocation, useNavigate, Link } from "react-router-dom";
import { LayoutDashboard, Users, Receipt, UtensilsCrossed, BarChart3, Home, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGroup } from "@/hooks/useGroup";
import { NotificationBell } from "./NotificationBell";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { Button } from "@/components/ui/button";

const tabs = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/expenses", icon: Receipt, label: "Expenses" },
  { to: "/meals", icon: UtensilsCrossed, label: "Meals" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/roommates", icon: Users, label: "People" },
];

export function AppLayout() {
  const { user } = useAuth();
  const { data: group } = useGroup();
  useRealtimeSync(group?.id, user?.id);
  const location = useLocation();
  const navigate = useNavigate();

  // Tab roots — these are the bottom-tab destinations and should NOT show a back button.
  const tabRoots = new Set(["/", "/expenses", "/meals", "/reports", "/roommates"]);
  const isRoot = tabRoots.has(location.pathname);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const titleMap: Record<string, string> = {
    "/": "Dashboard",
    "/expenses": "Expenses",
    "/meals": "Meals",
    "/reports": "Reports",
    "/roommates": "Roommates",
    "/settlements": "Settlements",
    "/referral": "Referral",
    "/profile": "Profile",
    "/notifications": "Notifications",
  };
  const headerTitle = titleMap[location.pathname] ?? "SplitNest";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header
        className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {isRoot ? (
          <Link
            to="/profile"
            aria-label="Profile"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"
          >
            <Home className="h-4 w-4" />
          </Link>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Go back"
            onClick={handleBack}
            className="h-9 w-9 rounded-xl"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight">{headerTitle}</div>
          <div className="truncate text-[11px] text-muted-foreground">{group?.name ?? "—"}</div>
        </div>
        <NotificationBell />
      </header>

      <main
        className="flex-1 px-4 pt-4"
        style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto w-full max-w-3xl">
          <Outlet />
        </div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-5">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                        isActive ? "bg-accent" : ""
                      }`}
                    >
                      <t.icon className="h-5 w-5" />
                    </span>
                    <span className="font-medium">{t.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
