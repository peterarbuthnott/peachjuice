import { useState, useEffect } from 'react';
import { GameState } from './types';
import { createNewGame } from './gameEngine';
import { saveGameToCloud, pingServer } from './api';
import HomeView from './components/HomeView';
import NamingView from './components/NamingView';
import ScoringView from './components/ScoringView';
import ResultsView from './components/ResultsView';

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // No cloud auth needed any more — this just confirms the local
    // JSON-file server is up before letting the player in.
    let cancelled = false;
    pingServer()
      .then((ok) => {
        if (cancelled) return;
        if (!ok) setAuthError('Could not reach the local Nominate server.');
        setLoadingAuth(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setAuthError(err instanceof Error ? err.message : String(err));
        setLoadingAuth(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (gameState) {
      saveGameToCloud(gameState);
    }
  }, [gameState]);

  const handleStartNewGame = (numPlayers: number) => {
    const game = createNewGame(numPlayers);
    game.status = 'setup_names';
    setGameState(game);
  };

  const handleConfirmNames = (names: string[]) => {
    if (!gameState) return;

    const updatedPlayers = gameState.players.map((p, idx) => ({
      ...p,
      name: names[idx] || p.name,
    }));

    setGameState({
      ...gameState,
      status: 'scoring',
      players: updatedPlayers,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateGame = (game: GameState) => {
    setGameState(game);
  };

  const handleResumeGame = (game: GameState) => {
    setGameState(game);
  };

  const handleRestart = () => {
    setGameState(null);
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-10 h-10 rounded-full border-t-2 border-[#E5C07B] animate-spin mb-4"></div>
        <h2 className="text-xl font-serif text-[#E5C07B] tracking-tight mb-1">Nominate</h2>
        <p className="text-[10px] font-mono text-white/80 uppercase tracking-widest">Establishing secure protocol...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      {!gameState && (
        <HomeView
          onStartNewGame={handleStartNewGame}
          onResumeGame={handleResumeGame}
        />
      )}

      {gameState && gameState.status === 'setup_names' && (
        <NamingView
          gameState={gameState}
          onConfirmNames={handleConfirmNames}
          onBackToHome={handleRestart}
        />
      )}

      {gameState && gameState.status === 'scoring' && (
        <ScoringView
          gameState={gameState}
          onUpdateGame={handleUpdateGame}
          onExitToHome={handleRestart}
        />
      )}

      {gameState && gameState.status === 'completed' && (
        <ResultsView
          gameState={gameState}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}
