// Plain-JS port of the original src/gameEngine.ts — logic is byte-for-byte
// the same, only the TypeScript type annotations are gone. See types.md in
// this folder for the shape comments that used to be types.ts.

const TRUMP_SUITS = ["clubs ♣", "diamonds ♦", "hearts ♥", "spades ♠"];
const RED_SUITS = [false, true, true, false];

export function getRoundInfo(roundNumber) {
  let tricks = 0;
  let trumpSuit = "no";
  let isRedSuit = false;
  let isMiss = false;
  let isBlind = false;

  if (roundNumber <= 7) {
    tricks = roundNumber;
    const index = roundNumber < 5 ? roundNumber - 1 : roundNumber - 5;
    trumpSuit = TRUMP_SUITS[index];
    isRedSuit = RED_SUITS[index];
  } else if (roundNumber > 7 && roundNumber < 12) {
    isMiss = true;
    tricks = 0; // Tricks won must sum to 7 in 'Miss' rounds
    if (roundNumber === 8 || roundNumber === 10) {
      const index = roundNumber < 9 ? roundNumber - 5 : roundNumber - 10;
      trumpSuit = TRUMP_SUITS[index];
      isRedSuit = RED_SUITS[index];
    } else {
      trumpSuit = "no";
      isRedSuit = false;
    }
    if (roundNumber > 9) {
      isBlind = true;
    }
  } else {
    tricks = 19 - roundNumber;
    const index = roundNumber < 15 ? roundNumber - 11 : roundNumber - 15;
    trumpSuit = TRUMP_SUITS[index];
    isRedSuit = RED_SUITS[index];
    isBlind = false;
  }

  const suit = trumpSuit === "no" ? "no" : trumpSuit.slice(-2);

  return {
    roundNumber,
    trumpSuit,
    isRedSuit,
    suit,
    tricks,
    isMiss,
    isBlind,
  };
}

export function createNewGame(numPlayers) {
  const gameId = Math.random().toString(36).substring(2, 11);
  const players = [];

  const createEmptyRoundScores = () => {
    const roundScores = {};
    for (let i = 1; i <= 18; i++) {
      roundScores[i] = {
        tricksNominated: 0,
        tricksWon: 0,
        score: 0,
        madeBid: false,
      };
    }
    return roundScores;
  };

  for (let idx = 1; idx <= numPlayers; idx++) {
    players.push({
      name: `Player ${idx}`,
      isDealer: idx === 1, // First player is initial dealer
      currentScore: 0,
      madeBids: 0,
      roundScores: createEmptyRoundScores(),
    });
  }

  return {
    id: gameId,
    status: 'setup_players',
    currentRound: 1,
    roundState: 0,
    numberOfPlayers: numPlayers,
    players,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Move dealer to the next player
export function shiftDealer(players) {
  const dealerIdx = players.findIndex(p => p.isDealer);
  if (dealerIdx === -1) {
    return players.map((p, idx) => ({ ...p, isDealer: idx === 0 }));
  }

  return players.map((p, idx) => {
    const isNewDealer = idx === (dealerIdx + 1) % players.length;
    return {
      ...p,
      isDealer: isNewDealer,
    };
  });
}

// Calculate scores for round
export function computeScoredPlayers(players, roundNumber, isMiss) {
  return players.map((player) => {
    const scores = { ...player.roundScores };
    const currentRoundScore = { ...scores[roundNumber] };
    let scoreGained = 0;
    let madeBid = false;

    if (isMiss) {
      // In a "Miss" hand, score is -3 * tricksWon. Bid is made if they got exactly 0 tricks
      scoreGained = -3 * currentRoundScore.tricksWon;
      madeBid = currentRoundScore.tricksWon === 0;
    } else {
      if (currentRoundScore.tricksWon === currentRoundScore.tricksNominated) {
        madeBid = true;
        scoreGained = 10 + currentRoundScore.tricksNominated;
      } else {
        scoreGained = currentRoundScore.tricksWon;
      }
    }

    currentRoundScore.score = scoreGained;
    currentRoundScore.madeBid = madeBid;

    scores[roundNumber] = currentRoundScore;

    return {
      ...player,
      roundScores: scores,
      currentScore: player.currentScore + scoreGained,
      madeBids: player.madeBids + (madeBid ? 1 : 0),
    };
  });
}
