export interface PlayerRoundScore {
  tricksNominated: number;
  tricksWon: number;
  score: number;
  madeBid: boolean;
}

export interface PlayerState {
  name: string;
  isDealer: boolean;
  currentScore: number;
  madeBids: number;
  roundScores: Record<number, PlayerRoundScore>; // Key is 1-indexed round number (1 to 18)
}

export interface RoundInfo {
  roundNumber: number;
  trumpSuit: string;
  isRedSuit: boolean;
  suit: string;
  tricks: number;
  isMiss: boolean;
  isBlind: boolean;
}

export interface GameState {
  id: string;
  status: 'setup_players' | 'setup_names' | 'scoring' | 'completed';
  currentRound: number; // 1 to 18
  roundState: number; // 0 = bidding stage, 1 = actual tricks won input stage
  numberOfPlayers: number;
  players: PlayerState[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedPlayerProfile {
  id: string; // usually name-based or generated
  name: string;
  gamesPlayed: number;
  gamesWon: number;
  totalScore: number;
  totalBidsMade: number;
  lastPlayed: string;
}
