"use client";

import { logoutAction } from "@/app/actions/auth";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, CircleQuestionMark, Globe, LayoutGrid, Search, Settings, SquareTerminal } from "lucide-react";
import { linksIn, navTrees } from "@/lib/console-data";
import { useConsole } from "@/components/sites/console/console-provider";
import { Mark, MenuButton, MenuChevron, PanelDialog } from "@/components/sites/console/ui";

const pageLinks = Array.from(
  new Map(
    [...navTrees.flatMap((tree) => linksIn(tree)), { label: "Launch instance", href: "/compute/launch" }].map(
      (link) => [link.href, link],
    ),
  ).values(),
);

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const consoleApi = useConsole();
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const pages = pageLinks
      .filter((link) => link.label.toLowerCase().includes(q))
      .map((link) => ({ label: link.label, detail: "Page", href: link.href }));
    const resources = [
      ...consoleApi.instances.map((item) => ({
        label: item.name || item.id,
        detail: item.id,
        href: "/compute/instances",
      })),
      ...consoleApi.volumes.map((item) => ({
        label: item.name || item.id,
        detail: item.id,
        href: "/storage/volumes",
      })),
      ...consoleApi.accountBuckets.map((item) => ({
        label: item.name,
        detail: "Bucket",
        href: `/storage/buckets/${encodeURIComponent(item.name)}`,
      })),
    ].filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(q));
    return [...pages, ...resources].slice(0, 8);
  }, [consoleApi.accountBuckets, consoleApi.instances, consoleApi.volumes, query]);

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 bg-[#161d26] px-3 text-white">
      <button
        type="button"
        className="grid size-8 place-items-center rounded-md text-[#d5dbdb] hover:bg-white/10 lg:hidden"
        aria-label="Open navigation"
        onClick={onMenu}
      >
        <LayoutGrid className="size-4" />
      </button>
      <div className="hidden lg:block">
        <MenuButton
          label={
            <span className="grid size-8 place-items-center rounded-md text-[#d5dbdb] hover:bg-white/10 hover:text-white">
              <LayoutGrid className="size-4" />
              <span className="sr-only">Services</span>
            </span>
          }
          items={pageLinks.map((link) => ({ label: link.label, href: link.href }))}
        />
      </div>
      <Link href="/compute/instances" className="flex items-center gap-2 pr-2">
        <Mark />
      </Link>
      <div className="relative mx-2 hidden min-w-0 flex-1 sm:block">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[#9aa4ad]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search"
          className="h-8 w-full rounded-lg border border-white/10 bg-[#0f141a] pl-8 pr-2 text-[13px] text-white outline-none placeholder:text-[#9aa4ad] focus:border-[#006ce0]"
        />
        {hits.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-[#e6e8eb] bg-white text-[13px] text-[#16191f] shadow-lg">
            {hits.map((hit) => (
              <Link
                key={`${hit.href}-${hit.label}`}
                href={hit.href}
                className="flex items-center justify-between px-3 py-1.5 hover:bg-[#f2f8fd]"
                onClick={() => setQuery("")}
              >
                <span>{hit.label}</span>
                <span className="text-[12px] text-[#5f6b7a]">{hit.detail}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-0.5">
        <HeaderIcon
          label="Shell"
          onClick={() =>
            setNotice({
              title: "Shell",
              body: "The browser shell is not connected in this preview. Resource changes stay in this session.",
            })
          }
        >
          <SquareTerminal className="size-4" />
        </HeaderIcon>
        <HeaderIcon
          label="Notifications"
          onClick={() => setNotice({ title: "Notifications", body: "No notifications." })}
        >
          <Bell className="size-4" />
        </HeaderIcon>
        <MenuButton
          align="right"
          label={
            <span className="grid size-8 place-items-center rounded-md text-[#d5dbdb] hover:bg-white/10 hover:text-white">
              <Settings className="size-4" />
              <span className="sr-only">Settings</span>
            </span>
          }
          items={[
            {
              label: "Comfortable rows",
              checked: consoleApi.density === "comfortable",
              onSelect: () => consoleApi.setDensity("comfortable"),
            },
            {
              label: "Compact rows",
              checked: consoleApi.density === "compact",
              onSelect: () => consoleApi.setDensity("compact"),
            },
          ]}
        />
        <MenuButton
          align="right"
          label={
            <span className="grid size-8 place-items-center rounded-md text-[#d5dbdb] hover:bg-white/10 hover:text-white">
              <CircleQuestionMark className="size-4" />
              <span className="sr-only">Help</span>
            </span>
          }
          items={pageLinks.map((link) => ({ label: link.label, href: link.href }))}
        />
        <MenuButton
          align="right"
          className="ml-1 inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-white hover:bg-white/10"
          label={
            <>
              <Globe className="size-3.5" />
              <span className="max-w-32 truncate">{consoleApi.region}</span>
              <MenuChevron />
            </>
          }
          items={consoleApi.regions.map((region) => ({
            label: region,
            checked: region === consoleApi.region,
            onSelect: () => consoleApi.setRegion(region),
          }))}
        />
        <MenuButton
          align="right"
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-right hover:bg-white/10"
          label={
            <>
              <span className="leading-tight">
                <span className="block text-[12px]">{consoleApi.account.name}</span>
                <span className="block text-[11px] text-[#c6c9ce]">{consoleApi.account.id}</span>
              </span>
              <MenuChevron />
            </>
          }
          items={[
            { label: consoleApi.account.name, disabled: true },
            { label: `Account ${consoleApi.account.id}`, disabled: true },
            {
              label: "Show empty account",
              checked: consoleApi.mode === "empty",
              onSelect: consoleApi.showEmpty,
            },
            {
              label: "Show sample data",
              checked: consoleApi.mode === "sample",
              onSelect: consoleApi.showSample,
            },
            ...(consoleApi.signIn ? [{ label: "Sign out", onSelect: () => void logoutAction() }] : []),
          ]}
        />
      </div>
      <PanelDialog open={notice !== null} title={notice?.title ?? ""} onClose={() => setNotice(null)}>
        <p>{notice?.body}</p>
      </PanelDialog>
    </header>
  );
}

function HeaderIcon({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-8 place-items-center rounded-md text-[#d5dbdb] hover:bg-white/10 hover:text-white"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
