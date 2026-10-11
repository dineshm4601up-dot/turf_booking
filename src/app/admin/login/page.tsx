"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { signInAction, type SignInState } from "../actions";

const initialState: SignInState = { error: "" };

export default function AdminLoginPage() {
  const [state, formAction, isPending] = useActionState(signInAction, initialState);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="size-5 text-turf-700" aria-hidden="true" />
          <h1 className="text-xl font-bold text-slate-800">Admin sign in</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">Restricted to authorized administrators.</p>

        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-slate-600 mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-medium text-slate-600 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full min-h-11 rounded-lg border border-slate-300 px-3 text-sm focus:border-turf-600"
            />
          </div>

          {state.error && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full min-h-11 rounded-lg bg-turf-600 text-white text-sm font-semibold hover:bg-turf-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
