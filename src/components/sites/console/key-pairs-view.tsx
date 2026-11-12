"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteKeyPairsAction } from "@/app/actions/resources";
import { ApiErrorAlert, useApiAction } from "@/components/sites/console/api-action";
import { KeyPairRecoveryNotice } from "@/components/sites/console/key-pair-create";
import { ListActions } from "@/components/sites/console/list-actions";
import { PageHeader } from "@/components/sites/console/page-header";
import { Column, ResourceTable } from "@/components/sites/console/resource-table";
import { Shell } from "@/components/sites/console/shell";
import { OrangeButton, OutlineButton, PanelDialog, dash } from "@/components/sites/console/ui";
import { computeNav } from "@/lib/console-data";
import { formatEc2Time } from "@/lib/ebs";
import { KEY_TYPE_OPTIONS, type StoredKeyPair } from "@/lib/key-pair";
import type { ApiError } from "@/lib/vws-api/adapter";

export function KeyPairsView({ keyPairs, loadError }: { keyPairs: StoredKeyPair[]; loadError: ApiError | null }) {
  const router = useRouter();
  const action = useApiAction();
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
      key: "created",
      header: "Created",
      minWidth: 200,
      sortValue: (row) => row.created,
      cell: (row) => dash(formatEc2Time(row.created)),
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
        info="A key pair is a public key that VWS stores and a private key file that you store. You use it to connect to an instance."
        actions={
          <ListActions
            onRefresh={() => router.refresh()}
            items={[
              { label: "Import key pair", href: "/network/key-pairs/import", action: "ec2:CreateKeyPair" },
              { label: "Manage tags", disabled: true },
              {
                label: "Delete",
                action: "ec2:DeleteKeyPair",
                disabled: action.pending || selected.length === 0,
                onSelect: () => setConfirmDelete(true),
              },
            ]}
            createLabel="Create key pair"
            createAction="ec2:CreateKeyPair"
            onCreate={() => router.push("/network/key-pairs/create")}
          />
        }
      />
      <KeyPairRecoveryNotice knownNames={keyPairs.map((item) => item.name)} />
      <ApiErrorAlert error={loadError} title="Key pairs could not be loaded" />
      <ApiErrorAlert error={action.error} title="The key pair could not be deleted" />
      <ResourceTable
        rows={keyPairs}
        region={(row) => row.region ?? ""}
        getId={(row) => row.id}
        columns={columns}
        selectedIds={selected.map((item) => item.id)}
        onSelectedIds={setSelectedIds}
        emptyTitle=""
        emptyMessage={loadError ? "" : "No key pairs to display"}
        filterPlaceholder="Filter Key Pair by attribute or tag"
        variant="aws-list"
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
