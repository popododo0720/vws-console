"use client";

import { RefreshIconButton, primaryPill, secondaryPill } from "@/components/sites/console/ebs-form-parts";
import { MenuButton, OrangeButton, menuTriggerClass, type MenuEntry } from "@/components/sites/console/ui";

/** The right side of a VPC list's title row: refresh, Actions menu and create button. */
export function ListActions({
  showLastUpdated = false,
  onRefresh,
  items,
  createLabel,
  onCreate,
}: {
  showLastUpdated?: boolean;
  onRefresh: () => void;
  items: MenuEntry[];
  createLabel: string;
  onCreate: () => void;
}) {
  return (
    <>
      {showLastUpdated ? (
        <span className="text-right text-[12px] leading-4 text-[#5f6b7a]">
          Last updated
          <br />
          less than a minute ago
        </span>
      ) : null}
      <RefreshIconButton label="Refresh" onClick={onRefresh} />
      <MenuButton
        className={`${menuTriggerClass()} ${secondaryPill} gap-1.5`}
        label={
          <>
            Actions{" "}
            <span aria-hidden className="text-[9px]">
              ▼
            </span>
          </>
        }
        items={items}
      />
      <OrangeButton className={primaryPill} onClick={onCreate}>
        {createLabel}
      </OrangeButton>
    </>
  );
}
