"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Info, Settings } from "lucide-react";

export function DetailDock({
  title,
  info,
  tabs,
  tab,
  onTab,
  height,
  onHeight,
  children,
}: {
  title: string;
  info?: string;
  tabs?: { id: string; label: string }[];
  tab?: string;
  onTab?: (id: string) => void;
  height: number;
  onHeight: (height: number) => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <section
      className="relative min-h-0 shrink-0 overflow-hidden border-t border-[#d5dbdb] bg-white"
      style={{ height: collapsed ? 36 : height, maxHeight: collapsed ? 36 : "42vh" }}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize details"
        className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize hover:bg-[#006ce0]"
        onPointerDown={(event) => {
          event.preventDefault();
          const startY = event.clientY;
          const startH = collapsed ? 220 : height;
          const move = (ev: PointerEvent) => {
            onHeight(Math.min(520, Math.max(140, startH - (ev.clientY - startY))));
            setCollapsed(false);
          };
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      />
      <div className="flex h-full flex-col pt-1.5">
        <div className="flex items-center px-3">
          <div className="flex flex-1 items-center justify-center gap-1 text-[13px] font-semibold">
            {title}
            {info ? (
              <button
                type="button"
                aria-label="About this panel"
                className="text-[#006ce0]"
                onClick={() => setInfoOpen((value) => !value)}
              >
                <Info className="size-3.5" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Reset detail height"
            className="grid size-7 place-items-center rounded hover:bg-[#f4f5f6]"
            onClick={() => {
              onHeight(230);
              setCollapsed(false);
            }}
          >
            <Settings className="size-3.5 text-[#5f6b7a]" />
          </button>
          <button
            type="button"
            aria-label={collapsed ? "Expand details" : "Collapse details"}
            className="grid size-7 place-items-center rounded hover:bg-[#f4f5f6]"
            onClick={() => setCollapsed((value) => !value)}
          >
            <ChevronDown className={collapsed ? "size-4 rotate-180" : "size-4"} />
          </button>
        </div>
        {collapsed ? null : (
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            {tabs && tabs.length > 0 ? (
              <div className="flex gap-4 overflow-x-auto border-b border-[#e6e8eb] px-4 text-[13px]">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "shrink-0 border-b-2 pb-1.5",
                      tab === item.id
                        ? "border-[#006ce0] font-semibold text-[#006ce0]"
                        : "border-transparent text-[#5f6b7a]",
                    )}
                    onClick={() => onTab?.(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 px-4 py-3">
              {infoOpen && info ? <p className="mb-2 text-[12px] text-[#5f6b7a]">{info}</p> : null}
              {children}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
