import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { CountrySheet } from "./countries.js";

export interface DisplayedCountry {
  entryId: string;
  country: CountrySheet;
  displayedAt: string; // ISO 8601
}

export interface SessionSnapshot {
  sessionId: string;
  currentEntry: DisplayedCountry | null;
  history: DisplayedCountry[];
}

interface SessionState {
  currentEntry: DisplayedCountry | null;
  history: DisplayedCountry[];
  sseClients: Set<Response>;
}

export const DEFAULT_SESSION = "default";
const MAX_HISTORY = 20;
const MAX_SESSION_LENGTH = 64;

const sessions = new Map<string, SessionState>();

export function normalizeSessionId(raw?: unknown): string {
  if (typeof raw !== "string") {
    return DEFAULT_SESSION;
  }
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, MAX_SESSION_LENGTH);
  return cleaned || DEFAULT_SESSION;
}

function getOrCreateSession(sessionId: string): SessionState {
  const key = normalizeSessionId(sessionId);
  let session = sessions.get(key);
  if (!session) {
    session = {
      currentEntry: null,
      history: [],
      sseClients: new Set<Response>(),
    };
    sessions.set(key, session);
  }
  return session;
}

function cleanupSessionIfEmpty(sessionId: string): void {
  const key = normalizeSessionId(sessionId);
  const session = sessions.get(key);
  if (session && session.sseClients.size === 0 && session.history.length === 0) {
    sessions.delete(key);
  }
}

function broadcast(sessionId: string, event: string, data: unknown): void {
  const session = sessions.get(normalizeSessionId(sessionId));
  if (!session) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of session.sseClients) {
    try {
      client.write(payload);
    } catch {
      session.sseClients.delete(client);
    }
  }
  cleanupSessionIfEmpty(sessionId);
}

export function addSseClient(sessionId: string, res: Response): void {
  getOrCreateSession(sessionId).sseClients.add(res);
}

export function removeSseClient(sessionId: string, res: Response): void {
  const key = normalizeSessionId(sessionId);
  const session = sessions.get(key);
  if (!session) return;
  session.sseClients.delete(res);
  cleanupSessionIfEmpty(key);
}

export function getSseClientCount(sessionId?: string): number {
  if (sessionId !== undefined) {
    return sessions.get(normalizeSessionId(sessionId))?.sseClients.size ?? 0;
  }
  let total = 0;
  for (const session of sessions.values()) {
    total += session.sseClients.size;
  }
  return total;
}

export function getSessionSnapshot(sessionId: string): SessionSnapshot {
  const key = normalizeSessionId(sessionId);
  const session = sessions.get(key);
  return {
    sessionId: key,
    currentEntry: session?.currentEntry ?? null,
    history: session ? [...session.history] : [],
  };
}

export function getSessionCount(): number {
  return sessions.size;
}

export function displayCountryInSession(sessionId: string, country: CountrySheet): DisplayedCountry {
  const key = normalizeSessionId(sessionId);
  const session = getOrCreateSession(key);

  const entry: DisplayedCountry = {
    entryId: randomUUID(),
    country,
    displayedAt: new Date().toISOString(),
  };

  session.currentEntry = entry;
  session.history = [
    entry,
    ...session.history.filter((item) => item.country.id !== country.id),
  ].slice(0, MAX_HISTORY);

  broadcast(key, "session_update", getSessionSnapshot(key));
  return entry;
}

export function resetSession(sessionId: string): void {
  const key = normalizeSessionId(sessionId);
  const session = sessions.get(key);
  if (!session) return;
  session.currentEntry = null;
  session.history = [];
  broadcast(key, "reset", { sessionId: key });
  cleanupSessionIfEmpty(key);
}
