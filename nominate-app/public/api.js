// Plain-JS port of src/api.ts. Same function names/signatures as before
// (and, one step further back, the same names the original src/firebase.ts
// used) so nothing calling these had to change its own logic — only the
// import path/extension. Talks to the JSON-file server (server.js) over
// same-origin fetch().

const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

function handleApiError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
  };
  console.error('Nominate API error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function apiFetch(path, init) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...(init || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res;
}

// Save or Update Game State
export async function saveGameToCloud(gameState) {
  const path = `api/games/${gameState.id}`;
  try {
    // POST rather than PUT: server.js's handleSaveGame accepts either
    // method identically (see the "PUT || POST" check in createHandler),
    // but a PUT to this same URL was observed coming through with an
    // empty body once deployed behind the real site (400 "Invalid JSON
    // body" - the request reached Node with no body at all, most likely
    // something in the reverse-proxy layer in front of it mishandling PUT
    // bodies specifically). POST is what dullas's own /api/score already
    // uses successfully on this same host, so this sidesteps whatever
    // that PUT-specific issue is.
    await apiFetch(path, {
      method: 'POST',
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
export async function loadGameFromCloud(gameId) {
  const path = `api/games/${gameId}`;
  try {
    const res = await fetch(path);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (error) {
    handleApiError(error, OperationType.GET, path);
  }
  return null;
}

// Get All Recent Games for History
export async function fetchRecentGamesFromCloud(limitCount = 10) {
  const path = `api/games?limit=${limitCount}`;
  try {
    const res = await apiFetch(path);
    return await res.json();
  } catch (error) {
    handleApiError(error, OperationType.LIST, path);
  }
}

// Delete Game
export async function deleteGameFromCloud(gameId) {
  const path = `api/games/${gameId}`;
  try {
    await apiFetch(path, { method: 'DELETE' });
  } catch (error) {
    handleApiError(error, OperationType.DELETE, path);
  }
}

// Fetch All Saved Players for Autocomplete/Stats
export async function fetchSavedPlayersFromCloud() {
  const path = 'api/players';
  try {
    const res = await apiFetch(path);
    return await res.json();
  } catch (error) {
    handleApiError(error, OperationType.LIST, path);
  }
}

// Fetch one page of the leaderboard (used by the standalone legends.html
// page). Same paginated shape standup's highscores endpoint returns:
// { entries, total, offset, limit, hasMore }.
export async function fetchLeaderboardPage(offset = 0, limit = 20) {
  const path = `api/players?offset=${offset}&limit=${limit}`;
  try {
    const res = await apiFetch(path);
    return await res.json();
  } catch (error) {
    handleApiError(error, OperationType.LIST, path);
  }
}

// Save or Update Player Profile
export async function savePlayerProfileToCloud(profile) {
  const path = `api/players/${profile.id}`;
  try {
    // Same PUT -> POST reasoning as saveGameToCloud above.
    await apiFetch(path, { method: 'POST', body: JSON.stringify(profile) });
  } catch (error) {
    handleApiError(error, OperationType.WRITE, path);
  }
}

// Clear all games and player profiles
export async function clearAllDatabaseDocs() {
  const path = 'api/wipe';
  try {
    await apiFetch(path, { method: 'POST' });
  } catch (error) {
    handleApiError(error, OperationType.DELETE, path);
  }
}

// Update multiple player profiles with game end scores
export async function recordGameResultsForPlayers(players) {
  const path = 'api/players/record-results';
  try {
    await apiFetch(path, { method: 'POST', body: JSON.stringify(players) });
  } catch (error) {
    console.error('Error in recordGameResultsForPlayers wrapper:', error);
  }
}

// Lightweight readiness check used by app.js in place of the old Firebase
// anonymous-auth handshake — just confirms the local server is reachable.
export async function pingServer() {
  try {
    const res = await fetch('api/players');
    return res.ok;
  } catch {
    return false;
  }
}
