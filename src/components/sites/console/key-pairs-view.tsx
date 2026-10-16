"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteKeyPairsAction } from "@/app/actions/resources";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { useKeyPairCreator } from "@/components/sites/console/key-pair-create";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import {
  MenuButton,
  MenuChevron,
  OrangeButton,
  OutlineButton,
  PanelDialog,
  dash,
  menuTriggerClass,
} from "@/components/sites/console/ui";
import { computeNav } from "@/lib/console-data";
import { KEY_TYPE_OPTIONS, type StoredKeyPair } from "@/lib/key-pair";
import type { ApiError } from "@/lib/vws-api/adapter";

const INTRO =
  "A key pair is a public key that VWS stores, and a private key file that you store. You use the key pair to connect to an instance. For Linux instances, the private key lets you SSH into the instance. For Windows instances, the private key lets you decrypt the administrator password.";

export function KeyPairsView({ keyPairs, loadError }: { keyPairs: StoredKeyPair[]; loadError: ApiError | null }) {
  const router = useRouter();
  const action = useApiAction();
  const creator = useKeyPairCreator({ onCreated: () => router.refresh() });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selected = keyPairs.filter((item) => selectedIds.includes(item.id));

  const columns: Column<StoredKeyPair>[] = [
    { key: "name", header: "Name", minWidth: 160, sortValue: (row) => row.name, cell: (row) => row.name },
    {
      key: "type",
      header: "Type",
      minWidth: 120,
      sortValue: (row) => row.type,
      cell: (row) => dash(KEY_TYPE_OPTIONS.find((item) => item.value === row.type)?.label ?? row.type),
    },
    {
      key: "fingerprint",
      header: "Fingerprint",
      minWidth: 220,
      sortValue: (row) => row.fingerprint,
      cell: (row) => dash(row.fingerprint),
    },
    { key: "id", header: "ID", minWidth: 220, sortValue: (row) => row.id, cell: (row) => row.id },
  ];

  return (
    <Shell tree={computeNav}>
      <PageHeader
        crumbs={[{ label: "EC2", href: "/compute/instances" }, { label: "Key pairs" }]}
        title="Key pairs"
        actions={
          <>
            <MenuButton
              className={menuTriggerClass()}
              label={
                <>
                  Actions <MenuChevron />
                </>
              }
              items={[
                { label: "Import key pair", onSelect: creator.openImport },
                {
                  label: "Delete",
                  disabled: action.pending || selected.length === 0,
                  onSelect: () => setConfirmDelete(true),
                },
              ]}
            />
            <OrangeButton onClick={creator.openGenerate}>Create key pair</OrangeButton>
          </>
        }
      />
      <p className="max-w-4xl px-4 pb-3 text-[13px] text-[#5f6b7a]">{INTRO}</p>
      {creator.portal}
      <ApiErrorAlert error={loadError} title="Key pairs could not be loaded" />
      <ApiErrorAlert error={action.error} title="The key pair could not be deleted" />
      <ResourceTable
        rows={keyPairs}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle="No key pairs"
        emptyMessage="There are no key pairs."
        filterPlaceholder="Find key pairs"
        onRefresh={() => router.refresh()}
      />
      <PanelDialog
        open={confirmDelete}
        title={selected.length === 1 ? "Delete key pair" : "Delete key pairs"}
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <OutlineButton onClick={() => setConfirmDelete(false)}>Cancel</OutlineButton>
            <OrangeButton
              disabled={action.pending || selected.length === 0}
              onClick={() =>
                action.run(
                  () => deleteKeyPairsAction(selected.map((item) => item.id)),
                  () => {
                    setSelectedIds([]);
                    setConfirmDelete(false);
                  },
                )
              }
            >
              Delete
            </OrangeButton>
          </>
        }
      >
        <p>
          Deleting the key pair does not remove the public key from instances already launched with it. You cannot
          connect later without the private key file.
        </p>
        {selected.length > 0 ? (
          <ul className="mt-2 list-disc pl-5">
            {selected.map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        ) : null}
      </PanelDialog>
    </Shell>
  );
}
