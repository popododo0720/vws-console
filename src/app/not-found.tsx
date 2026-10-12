import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-white text-[#16191f]">
      <div className="text-center">
        <h1 className="text-lg font-semibold">This page is not in the console</h1>
        <Link href="/compute/instances" className="mt-3 inline-block text-[#006ce0] hover:underline">
          Back to instances
        </Link>
      </div>
    </div>
  );
}
