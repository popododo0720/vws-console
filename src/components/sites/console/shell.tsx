"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { NavTree } from "@/types/console";
import { TOGGLE_NAV_EVENT } from "@/components/sites/console/page-header";
import { SideNav } from "@/components/sites/console/side-nav";
import { TopBar } from "@/components/sites/console/top-bar";
import { OutlineButton, PanelDialog } from "@/components/sites/console/ui";

const notices: Record<string, string> = {
  Shell: "The browser shell is not connected in this preview.",
  Toolkit: "The local toolkit is not installed in this preview.",
  "Mobile app": "There is no mobile companion for this preview.",
  Privacy: "This preview keeps data in memory for the browser tab. Nothing is uploaded.",
  Terms: "VWS is a local mock of a cloud console. It is not a cloud provider.",
  "Cookie preferences": "This preview does not set tracking cookies.",
};

export function Shell({
  tree,
  navMode = "docked",
  navHeader,
  children,
}: {
  tree: NavTree | null;
  navMode?: "docked" | "overlay-only";
  navHeader?: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const toggle = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) setCollapsed((value) => !value);
      else setMobileOpen((value) => !value);
    };
    window.addEventListener(TOGGLE_NAV_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_NAV_EVENT, toggle);
  }, []);
  const showDocked = tree && navMode === "docked" && !collapsed;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white text-[#16191f]">
      <TopBar onMenu={() => setMobileOpen(true)} />
      <div className="flex min-h-0 flex-1">
        {showDocked ? (
          <div className="relative hidden w-[200px] shrink-0 border-r border-[#e6e8eb] bg-white lg:block">
            <button
              type="button"
              aria-label="Collapse navigation"
              className="absolute right-2 top-3.5 z-10 grid size-6 place-items-center rounded text-[#5f6b7a] hover:bg-[#f4f5f6]"
              onClick={() => setCollapsed(true)}
            >
              <ChevronLeft className="size-4" />
            </button>
            <Suspense fallback={null}>
              <SideNav tree={tree} header={navHeader} />
            </Suspense>
          </div>
        ) : null}
        {tree && navMode === "docked" && collapsed ? (
          <button
            type="button"
            aria-label="Expand navigation"
            className="mt-3 hidden h-6 w-6 shrink-0 place-items-center rounded-full border border-[#c6c9ce] bg-white lg:grid"
            onClick={() => setCollapsed(false)}
          >
            <ChevronRight className="size-3.5" />
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
      <footer className="flex h-7 shrink-0 items-center justify-between gap-3 bg-[#161d26] px-3 text-[12px] text-[#d5dbdb]">
        <div className="flex items-center gap-3">
          {["Shell", "Toolkit", "Mobile app"].map((label) => (
            <button key={label} type="button" className="hover:underline" onClick={() => setNotice(label)}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline">© 2026 VWS</span>
          {["Privacy", "Terms", "Cookie preferences"].map((label) => (
            <button key={label} type="button" className="hover:underline" onClick={() => setNotice(label)}>
              {label}
            </button>
          ))}
        </div>
      </footer>
      {tree && mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[260px] bg-white shadow-xl">
            <Suspense fallback={null}>
              <SideNav tree={tree} header={navHeader} />
            </Suspense>
          </div>
        </div>
      ) : null}
      <PanelDialog
        open={notice !== null}
        title={notice ?? ""}
        onClose={() => setNotice(null)}
        footer={<OutlineButton onClick={() => setNotice(null)}>Close</OutlineButton>}
      >
        <p>{notice ? notices[notice] : ""}</p>
      </PanelDialog>
    </div>
  );
}
