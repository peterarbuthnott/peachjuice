// Local JSON-file backed persistence.
//
// This replaces the old Firestore-backed src/firebase.ts. Every function
// below keeps the exact same name and signature the components already
// call, so App.tsx / HomeView.tsx / NamingView.tsx / ScoringView.tsx /
// ResultsView.tsx only had to change their import path — not their logic.
//
// Data lives in ./data/*.json on the server (see server.js), reached
// through same-origin fetch() calls to /api/*.

import { GameState, SavedPlayerProfile } from './types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface ApiErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleApiError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: ApiErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
  };
  console.error('Nominate API error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res;
}

// Save or Update Game State
export async function saveGameToCloud(gameState: GameState): Promise<void> {
  const path = `/api/games/${gameState.id}`;
  try {
    await apiFetch(path, {
      method: 'PUT',
      body: JSON.stringify({
        ...gameState,
        updatedAt: new Date().toISOString(),
      }),
    });
  } catch (error) {
    handleApiError(error, OperationType.WRITE, path);
  }
}

// Fetch a single Game State
export async function loadGameFromCloud(gameId: string): Promise<GameState | null> {
  const path = `/api/games/${gameId}`;
  try {
    const res = await fetch(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as GameState;
  } catch (error) {
    handleApiError(error, OperationType.GET, path);
  }
  return null;
}

// Get All Recent Games for History
export async function fetchRecentGamesFromCloud(limitCount = 10): Promise<GameState[]> {
  const path = `/api/games?limit=${limitCount}`;
  try {
    const res = await apiFetch(path);
    return (await res.json()) as GameState[];
  } catch (error) {
    handleApiError(error, OperationType.LIST, path);
  }
}

// Delete Game
export async function deleteGameFromCloud(gameId: string): Promise<void> {
  const path = `/api/games/${gameId}`;
  try {
    await apiFetch(path, { method: 'DELETE' });
  } catch (error) {
    handleApiError(error, OperationType.DELETE, path);
  }
}

// Fetch All Saved Players for Autocomplete/Stats
export async function fetchSavedPlayersFromCloud(): Promise<SavedPlayerProfile[]> {
  const path = '/api/players';
  try {
    const res = await apiFetch(path);
    return (await res.json()) as SavedPlayerProfile[];
  } catch (error) {
    handleApiError(error, OperationType.LIST, path);
  }
}

// Save or Update Player Profile
export async function savePlayerProfileToCloud(profile: SavedPlayerProfile): Promise<void> {
  const path = `/api/players/${profile.id}`;
  try {
    await apiFetch(path, { method: 'PUT', body: JSON.stringify(profile) });
  } catch (error) {
    handleApiError(error, OperationType.WRITE, path);
  }
}

// Clear all games and player profiles
export async function clearAllDatabaseDocs(): Promise<void> {
  const path = '/api/wipe';
  try {
    await apiFetch(path, { method: 'POST' });
  } catch (error) {
    handleApiError(error, OperationType.DELETE, path);
  }
}

// Update multiple player profiles with game end scores
export async function recordGameResultsForPlayers(players: { name: string; score: number; won: boolean; bidsMade: number }[]): Promise<void> {
  const path = '/api/players/record-results';
  try {
    await apiFetch(path, { method: 'POST', body: JSON.stringify(players) });
  } catch (error) {
    console.error('Error in recordGameResultsForPlayers wrapper:', error);
  }
}

// Lightweight readiness check used by App.tsx in place of the old
// Firebase anonymous-auth handshake — just confirms the local server
// (and therefore the JSON data files) is reachable.
export async function pingServer(): Promise<boolean> {
  try {
    const res = await fetch('/api/players');
    return res.ok;
  } catch {
    return false;
  }
}
