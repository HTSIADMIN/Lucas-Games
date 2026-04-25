import { hash, verify } from "@node-rs/argon2";

const PEPPER = process.env.PIN_PEPPER ?? "lucas-games-dev-pepper-change-me";

const OPTS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPin(pin: string): Promise<string> {
  return hash(pin + PEPPER, OPTS);
}

export async function verifyPin(pinHash: string, pin: string): Promise<boolean> {
  try {
    return await verify(pinHash, pin + PEPPER);
  } catch {
    return false;
  }
}
