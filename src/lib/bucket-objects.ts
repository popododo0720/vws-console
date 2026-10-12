import type { BucketObject } from "@/types/console";

export type ObjectRow = {
  key: string;
  name: string;
  isFolder: boolean;
  sizeBytes: number;
  modified: string;
  storageClass: string;
};

/** Objects directly under `prefix`, with deeper keys collapsed into folder rows. */
export function listAtPrefix(objects: BucketObject[], prefix: string): ObjectRow[] {
  const rows = new Map<string, ObjectRow>();
  for (const item of objects) {
    if (!item.key.startsWith(prefix) || item.key === prefix) continue;
    const rest = item.key.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) {
      rows.set(item.key, { key: item.key, name: rest, isFolder: false, sizeBytes: item.sizeBytes, modified: item.modified, storageClass: item.storageClass });
    } else {
      const folder = prefix + rest.slice(0, slash + 1);
      if (!rows.has(folder)) rows.set(folder, { key: folder, name: rest.slice(0, slash + 1), isFolder: true, sizeBytes: 0, modified: "", storageClass: "" });
    }
  }
  return [...rows.values()];
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** S3 key rule used here: no empty segments, no leading slash. */
export function validFolderName(name: string): boolean {
  return name.length > 0 && !name.includes("/") && name.trim() === name;
}
