"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  Menu,
  Plug,
  Search,
  X,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const navigation = [
  {
    href: "/dashboard",
    label: "Applications",
    icon: BriefcaseBusiness,
    exact: true,
  },
  { href: "/dashboard/research", label: "AI Jobs Found", icon: Search },
  { href: "/dashboard/feed", label: "Feed", icon: Activity },
  { href: "/dashboard/statistics", label: "Statistics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings & connections", icon: Plug },
];

export function DashboardSidebar({ email }: { email?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const content = (
    <>
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <BriefcaseBusiness className="size-5" />
        </div>
        <div>
          <p className="font-semibold leading-none">Job Tracker</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Research to offer
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navigation.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        {email && (
          <p className="mb-3 truncate px-2 text-xs text-muted-foreground">
            {email}
          </p>
        )}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r bg-background md:flex">
        {content}
      </aside>

      <div className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <div className="flex items-center gap-2 font-semibold">
          <BriefcaseBusiness className="size-5" />
          Job Tracker
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
        >
          <Menu />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          showCloseButton={false}
          className="top-0 left-0 flex h-dvh max-h-dvh w-72 max-w-[90vw] translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none p-0 sm:max-w-72"
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          {content}
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-3 top-3"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
