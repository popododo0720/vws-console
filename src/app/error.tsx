"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-white p-6 text-[#16191f]">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">This page hit a problem</h1>
        <p className="mt-2 text-sm text-[#5f6b7a]">
          The console could not render this view. Try again to reload it.
        </p>
        <button
          type="button"
          className="mt-4 h-8 rounded-lg bg-[#ff9900] px-3 text-sm font-semibold"
          onClick={reset}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
