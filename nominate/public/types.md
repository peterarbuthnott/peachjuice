# Data shapes

Plain JavaScript has no compile-time types, so the interfaces that used to
live in `src/types.ts` are documented here instead, as a reference for the
shape of the plain objects passed around `gameEngine.js`, `api.js`, and the
`views/*.js` files.

```
PlayerRoundScore
  tricksNominated: number
  tricksWon: number
  score: number
  madeBid: boolean

PlayerState
  name: string
  isDealer: boolean
  currentScore: number
  madeBids: number
  roundScores: { [roundNumber: 1..18]: PlayerRoundScore }

RoundInfo
  roundNumber: number
  trumpSuit: string        // e.g. "clubs ♣" or "no"
  isRedSuit: boolean
  suit: string              // e.g. "♣" or "no"
  tricks: number
  isMiss: boolean
  isBlind: boolean

GameState
  id: string
  status: 'setup_players' | 'setup_names' | 'scoring' | 'completed'
  currentRound: number      // 1 to 18
  roundState: number        // 0 = bidding stage, 1 = tricks-won stage
  numberOfPlayers: number
  players: PlayerState[]
  createdAt: string         // ISO timestamp
  updatedAt: string         // ISO timestamp

SavedPlayerProfile
  id: string                // normalized (lower-cased) name
  name: string
  gamesPlayed: number
  gamesWon: number
  totalScore: number
  totalBidsMade: number
  lastPlayed: string         // ISO timestamp
```
