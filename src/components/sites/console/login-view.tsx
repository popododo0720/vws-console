"use client";

import { useActionState, useEffect } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { FieldLabel } from "@/components/sites/console/ui";

const initial: LoginState = { error: null };

export function LoginView({ next, expired }: { next: string; expired: boolean }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  // A full load, not a client transition: the root layout then renders the account menu for the new session.
  useEffect(() => {
    if (state.next) window.location.replace(state.next);
  }, [state.next]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f2f3f3] px-4">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-lg border border-[#d5dbdb] bg-white p-6 text-[13px] shadow-sm">
        <div>
          <p className="text-[20px] font-bold tracking-tight text-[#16191f]">VWS</p>
          <h1 className="mt-1 text-[16px] font-semibold">Sign in to the console</h1>
        </div>
        {expired && !state.error ? (
          <p role="status" className="rounded-md border border-[#0972d3] bg-[#f2f8fd] px-3 py-2">
            Your session ended. Sign in again.
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="rounded-md border border-[#d91515] bg-[#fff7f7] px-3 py-2 text-[#d91515]">
            {state.error}
          </p>
        ) : null}
        <input type="hidden" name="next" value={next} />
        <div>
          <FieldLabel>Account ID</FieldLabel>
          <input className="field" name="account" aria-label="Account ID" autoComplete="organization" inputMode="numeric" required />
        </div>
        <div>
          <FieldLabel>User name</FieldLabel>
          <input className="field" name="userName" aria-label="User name" autoComplete="username" required />
        </div>
        <div>
          <FieldLabel>Password</FieldLabel>
          <input className="field" name="password" type="password" aria-label="Password" autoComplete="current-password" required />
        </div>
        <div>
          <FieldLabel>MFA code (optional)</FieldLabel>
          <input className="field" name="mfaCode" aria-label="MFA code" autoComplete="one-time-code" inputMode="numeric" />
        </div>
        <button
          type="submit"
          disabled={pending || Boolean(state.next)}
          className="h-8 w-full rounded-lg bg-[#ff9900] font-semibold text-[#16191f] hover:bg-[#ec7211] disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
