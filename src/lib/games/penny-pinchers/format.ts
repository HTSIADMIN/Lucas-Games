// Back-compat re-export. The formatter is now site-wide at
// `@/lib/format` — every game uses the same one. Local aliases
// `formatPC` / `formatRate` are kept so the Penny Pinchers files
// that already import them don't need to change.
export { formatAmount as formatPC, formatRate } from "@/lib/format";
