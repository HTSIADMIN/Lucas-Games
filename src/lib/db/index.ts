// Single re-export point so call sites import from "@/lib/db".
// When Supabase lands, swap "./mock" for the real client. No call site changes.
export * from "./mock";
export * from "./types";
