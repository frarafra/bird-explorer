import { Observation } from "../types";

export function shuffle<T>(arr: T[]) {
  return [...arr].sort(() => Math.random() - 0.5);
}


export function normalizeMCP(raw: any): Observation[] {
  if (Array.isArray(raw)) return raw;

  if (typeof raw === "string") return JSON.parse(raw);

  const text =
    raw?.content?.[0]?.text ||
    raw?.result?.content?.[0]?.text ||
    raw?.output;

  if (typeof text === "string") return JSON.parse(text);

  throw new Error("Invalid MCP response format");
}

export function normalizeRecording(raw: any, birdName: string) {
  const data =
    typeof raw === "string"
      ? JSON.parse(raw)
      : raw;

  const fromResults = data?.results?.[birdName];


  const direct = data?.[birdName];

  const recordings = fromResults ?? direct;

  if (!recordings?.length) {
    return [];
  }

  return recordings;
}