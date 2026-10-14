"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { NavNode, NavTree } from "@/types/console";
import { cn } from "@/lib/utils";
import { OutlineButton, PanelDialog } from "@/components/sites/console/ui";

function initialOpen(nodes: NavNode[], acc: Record<string, boolean> = {}) {
  for (const node of nodes) {
    if (node.children?.length) {
      acc[node.id] = node.defaultOpen !== false;
      initialOpen(node.children, acc);
    }
  }
  return acc;
}

function isActive(href: string, pathname: string, tab: string | null) {
  const url = new URL(href, "http://vws.local");
  if (url.pathname !== pathname) return false;
  const wanted = url.searchParams.get("tab");
  if (wanted) return wanted === tab;
  if (url.pathname === "/storage/buckets") return tab !== "directory";
  return true;
}

export function SideNav({
  tree,
  header,
}: {
  tree: NavTree;
  header?: React.ReactNode;
}) {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  const [open, setOpen] = useState<Record<string, boolean>>(() => initialOpen(tree.sections));
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const renderNodes = (nodes: NavNode[], depth: number) =>
    nodes.map((node) => {
      if (node.children?.length) {
        const expanded = open[node.id] ?? true;
        return (
          <div key={node.id}>
            <button
              type="button"
              className="flex w-full items-start gap-1 rounded px-1 py-1 text-left text-[13px] font-bold hover:bg-[#f4f5f6]"
              style={{ paddingLeft: 4 + depth * 12 }}
              aria-expanded={expanded}
              onClick={() => setOpen((prev) => ({ ...prev, [node.id]: !expanded }))}
            >
              <span aria-hidden className="mt-[4px] w-3 shrink-0 text-[9px] leading-none">{expanded ? "▼" : "▶"}</span>
              <span className="min-w-0 break-words">{node.label}</span>
            </button>
            {expanded ? renderNodes(node.children, depth + 1) : null}
          </div>
        );
      }
      const active = node.href ? isActive(node.href, pathname, tab) : false;
      const className = cn(
        "flex w-full items-start rounded py-[5px] pr-2 text-left text-[12.5px] hover:bg-[#f4f5f6]",
        active && "font-semibold text-[#006ce0]",
      );
      const style = { paddingLeft: 20 + depth * 12 };
      const inner = (
        <>
          <span className="min-w-0 break-words">{node.label}</span>
          {node.badge ? <span className="ml-2 shrink-0 text-[11px] font-semibold text-[#006ce0]">{node.badge}</span> : null}
        </>
      );
      if (node.href) {
        return (
          <Link key={node.id} href={node.href} className={className} style={style}>
            {inner}
          </Link>
        );
      }
      return (
        <button key={node.id} type="button" className={className} style={style} onClick={() => setUnavailable(node.label)}>
          {inner}
        </button>
      );
    });

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2 pt-3 text-[18px] font-bold leading-6">{tree.title}</div>
      {header ? <div className="px-3 pb-2">{header}</div> : null}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label={tree.title}>
        {renderNodes(tree.sections, 0)}
      </nav>
      <PanelDialog open={unavailable !== null} title={unavailable ?? ""} onClose={() => setUnavailable(null)}
        footer={<OutlineButton onClick={() => setUnavailable(null)}>Close</OutlineButton>}
      >
        <p>{unavailable} is not part of this preview.</p>
      </PanelDialog>
    </div>
  );
}
