import { dash } from "@/components/sites/console/ui";

/** Lists a resource's tags as read from the VWS API. */
export function TagsTable({ tags }: { tags: Record<string, string> }) {
  const entries = Object.entries(tags).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return <p className="text-[13px] text-[#5f6b7a]">No tags</p>;
  return (
    <table className="w-full max-w-2xl text-left text-[13px]">
      <thead>
        <tr className="border-b border-[#e6e8eb] text-[#5f6b7a]">
          <th className="py-1 pr-3 font-semibold">Key</th>
          <th className="py-1 font-semibold">Value</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key} className="border-b border-[#f2f3f3]">
            <td className="py-1 pr-3">{key}</td>
            <td className="py-1">{dash(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
