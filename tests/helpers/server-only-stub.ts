// Stub for the "server-only" package in tests: vitest runs everything in a
// Node (server) context, so the browser-import guard that package provides
// doesn't apply and would otherwise throw outside Next's own bundler.
export {};
