import React, { useState, useEffect } from 'react';
import { GameState, SavedPlayerProfile } from '../types';
import {
  fetchRecentGamesFromCloud,
  fetchSavedPlayersFromCloud,
  deleteGameFromCloud,
  clearAllDatabaseDocs
} from '../api';
import {
  Trophy,
  PlusCircle,
  History,
  Trash2,
  Users,
  Sparkles,
  Play,
  Crown,
  Share2,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HomeViewProps {
  onStartNewGame: (numPlayers: number) => void;
  onResumeGame: (gameState: GameState) => void;
}

export default function HomeView({ onStartNewGame, onResumeGame }: HomeViewProps) {
  const [numPlayers, setNumPlayers] = useState<number>(4);
  const [recentGames, setRecentGames] = useState<GameState[]>([]);
  const [savedPlayers, setSavedPlayers] = useState<SavedPlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'new' | 'resume' | 'players'>('new');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confirmingWipe, setConfirmingWipe] = useState(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Load database items on mount
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [games, players] = await Promise.all([
        fetchRecentGamesFromCloud(10),
        fetchSavedPlayersFromCloud()
      ]);
      setRecentGames(games || []);

      // Sort players by win rate or games played
      const sortedPlayers = [...(players || [])].sort((a, b) => b.gamesWon - a.gamesWon);
      setSavedPlayers(sortedPlayers);
      setLoading(false);
    }
    loadData();
  }, []);

  const handleDeleteGame = async (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this game record?')) {
      await deleteGameFromCloud(gameId);
      setRecentGames(prev => prev.filter(g => g.id !== gameId));
      setToastMessage('Game record deleted.');
    }
  };

  const handleWipeAllData = async () => {
    try {
      setLoading(true);
      await clearAllDatabaseDocs();
      localStorage.clear();
      setRecentGames([]);
      setSavedPlayers([]);
      setToastMessage('All app data completely removed.');
      setConfirmingWipe(false);
    } catch (err) {
      setToastMessage('Error wiping data: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#050505] flex flex-col p-6 text-white">

      {/* Visual Logo Header matching the design */}
      <header className="mb-6 border-b border-white/10 pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-serif tracking-tight text-[#E5C07B]">Nominate</h1>
          <p className="text-white/85 text-[10px] tracking-widest uppercase mt-1">Whist Scoring</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-white/60 mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> SYNC ACTIVE
          </div>
          <p className="text-[8px] text-white/65 uppercase tracking-wider italic">v1.0.4 Protocol</p>
        </div>
      </header>

      {/* Quick Info Bar */}
      <div className="grid grid-cols-2 gap-3 mb-6 text-center">
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="text-[9px] font-mono uppercase text-white/40 tracking-wider">Cloud State</div>
          <div className="text-xs font-semibold text-emerald-400 font-mono flex items-center justify-center gap-1 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Synchronized
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="text-[9px] font-mono uppercase text-white/40 tracking-wider">Players Tracked</div>
          <div className="text-xs font-medium text-white/80 mt-1 font-mono">
            {savedPlayers.length} profiles
          </div>
        </div>
      </div>

      {/* Internal Navigation Tabs inside Simulated App */}
      <div className="flex bg-white/5 p-1 rounded-xl mb-5 border border-white/10">
        <button
          onClick={() => setActiveTab('new')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
            activeTab === 'new'
              ? 'bg-[#E5C07B]/10 text-[#E5C07B] border border-[#E5C07B]/20 font-semibold'
              : 'text-white/60 hover:text-white/90'
          }`}
        >
          <PlusCircle className="w-3.5 h-3.5" />
          New Game
        </button>
        <button
          onClick={() => setActiveTab('resume')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
            activeTab === 'resume'
              ? 'bg-[#E5C07B]/10 text-[#E5C07B] border border-[#E5C07B]/20 font-semibold'
              : 'text-white/60 hover:text-white/90'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Resume
          {recentGames.filter(g => g.status !== 'completed').length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#E5C07B] animate-ping"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('players')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
            activeTab === 'players'
              ? 'bg-[#E5C07B]/10 text-[#E5C07B] border border-[#E5C07B]/20 font-semibold'
              : 'text-white/60 hover:text-white/90'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          Legends
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <AnimatePresence mode="wait">
          {activeTab === 'new' && (
            <motion.div
              key="tab-new"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex-1 flex flex-col justify-between"
            >
              <div className="bg-white/5 p-4 rounded-2xl border border-white/10 mb-6 shadow-xl">
                <h3 className="text-xs font-serif text-[#E5C07B] uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4" />
                  Configure Game Session
                </h3>

                <label className="text-[10px] text-white/40 uppercase tracking-wider mb-2.5 block font-mono">
                  Nominee Selection: How many players? (2 to 8)
                </label>

                <div className="grid grid-cols-4 gap-2 mb-5">
                  {[2, 3, 4, 5, 6, 7, 8].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setNumPlayers(num)}
                      className={`h-11 rounded-lg text-xs font-bold border transition-all ${
                        numPlayers === num
                          ? 'bg-[#E5C07B] border-[#E5C07B] text-black shadow-lg shadow-[#E5C07B]/15 scale-[1.02]'
                          : 'bg-[#121212] border-white/10 text-white/80 hover:border-white/20'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>

                <div className="text-[11px] text-white/60 leading-relaxed bg-[#121212] p-3 rounded-xl border border-white/5 flex gap-2">
                  <Users className="w-4.5 h-4.5 text-[#E5C07B] shrink-0 mt-0.5" />
                  <span>
                    Players take turns dealing. Nomination Whist has 18 rounds. Sum of bids cannot equal total tricks for the round to guarantee high drama!
                  </span>
                </div>
              </div>

              <button
                id="btn-start-game"
                onClick={() => onStartNewGame(numPlayers)}
                className="w-full h-13 rounded-xl bg-[#E5C07B] hover:bg-[#d4b06a] active:scale-[0.98] font-serif tracking-wide text-black text-sm font-semibold transition-all shadow-xl shadow-black/40 flex items-center justify-center gap-2 mb-4 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                Initialize Scoring Card
              </button>
            </motion.div>
          )}

          {activeTab === 'resume' && (
            <motion.div
              key="tab-resume"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex-1"
            >
              <h3 className="text-xs font-serif text-[#E5C07B] uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <History className="w-4 h-4" />
                Durable Game Records
              </h3>

              {loading ? (
                <div className="text-center py-10">
                  <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-[#E5C07B] border-t-transparent mb-2"></div>
                  <p className="text-[10px] text-white/80 font-mono">Loading telemetry...</p>
                </div>
              ) : recentGames.filter(g => g.status !== 'completed').length === 0 ? (
                <div className="bg-white/5 border border-white/5 rounded-2xl p-8 text-center text-white/80">
                  <Calendar className="w-8 h-8 mx-auto stroke-1 mb-2 text-[#E5C07B]" />
                  <div className="text-xs font-semibold mb-1 text-white">No active games in progress</div>
                  <p className="text-[10px] text-white/85 max-w-xs mx-auto">
                    Start a game of Whist and it will instantly save to cloud database storage for you to resume later.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {recentGames.filter(g => g.status !== 'completed').map((game) => (
                    <div
                      key={game.id}
                      onClick={() => onResumeGame(game)}
                      className="group bg-[#121212] border border-white/10 rounded-xl p-3 flex items-center justify-between cursor-pointer hover:border-[#E5C07B]/40 hover:bg-[#1A1A1B] active:scale-[0.99] transition-all"
                    >
                      <div className="flex-1 pr-2">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="bg-[#E5C07B]/10 text-[#E5C07B] text-[9px] font-mono uppercase px-1.5 py-0.5 rounded">
                            Round {game.currentRound}/18
                          </span>
                          <span className="text-[9px] text-white/40 font-mono">
                            {new Date(game.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="text-xs font-medium text-white/90 line-clamp-1">
                          {game.players.map(p => p.name).join(', ')}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteGame(e, game.id)}
                        className="p-2 text-white/30 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors"
                        title="Delete log"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'players' && (
            <motion.div
              key="tab-players"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex-1"
            >
              <h3 className="text-xs font-serif text-[#E5C07B] uppercase tracking-wider mb-4 flex items-center gap-1.5">
                <Crown className="w-4 h-4" />
                Player Profiles Leaderboard
              </h3>

              {loading ? (
                <div className="text-center py-10">
                  <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-[#E5C07B] border-t-transparent mb-2"></div>
                  <p className="text-[10px] text-white/80 font-mono">Loading telemetry...</p>
                </div>
              ) : savedPlayers.length === 0 ? (
                <div className="bg-white/5 border border-white/5 rounded-2xl p-8 text-center text-white/80">
                  <Users className="w-8 h-8 mx-auto stroke-1 mb-2 text-[#E5C07B]" />
                  <div className="text-xs font-semibold mb-1 text-white">No profiles loaded</div>
                  <p className="text-[10px] text-white/85 max-w-xs mx-auto">
                    Player statistics are created automatically when names are entered and games finish.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {savedPlayers.map((profile, i) => (
                    <div
                      key={profile.id}
                      className="bg-[#121212] border border-white/10 rounded-xl p-3 flex items-center justify-between shadow"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded bg-[#1A1A1B] flex items-center justify-center font-bold text-xs text-[#E5C07B] font-serif border border-white/5">
                          #{i+1}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white/90 flex items-center gap-1">
                            {profile.name}
                            {i === 0 && <Crown className="w-3 h-3 text-[#E5C07B]" />}
                          </div>
                          <div className="text-[9px] text-white/40 font-mono">
                            Played {profile.gamesPlayed} • Win Rate {Math.round((profile.gamesWon / profile.gamesPlayed) * 100)}%
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-[#E5C07B] font-mono">
                          {profile.totalScore} pts
                        </div>
                        <div className="text-[9px] text-white/30 font-mono">
                          {profile.totalBidsMade} bids won
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Wipe All Data Action (Danger Zone) */}
      <div className="mt-8 pt-4 border-t border-white/5 flex flex-col gap-2">
        {!confirmingWipe ? (
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest">Database Settings</span>
            <button
              onClick={() => setConfirmingWipe(true)}
              className="text-[9px] font-mono text-red-400 hover:text-red-300 transition-colors flex items-center gap-1 bg-red-950/20 hover:bg-red-950/40 px-2.5 py-1 rounded border border-red-900/30 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              Remove All App Data
            </button>
          </div>
        ) : (
          <div className="bg-red-950/10 border border-red-900/30 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="text-[10px] text-white/80 leading-relaxed font-mono">
                <span className="text-red-400 font-bold font-mono">WARNING:</span> This will permanently delete all cloud-synced games, scores, and player statistics from the preview database. This cannot be undone.
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmingWipe(false)}
                className="px-2.5 py-1 rounded text-[9px] font-mono font-bold bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleWipeAllData}
                className="px-2.5 py-1 rounded text-[9px] font-mono font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg transition-colors cursor-pointer"
              >
                Wipe Everything
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Status Toast Notifications */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 left-6 right-6 md:left-auto md:right-6 md:w-80 bg-zinc-900 border border-zinc-700 text-white p-3.5 rounded-xl shadow-2xl flex items-center gap-2.5 z-55"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[#E5C07B] animate-ping" />
            <span className="text-[10px] font-mono text-zinc-300">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
