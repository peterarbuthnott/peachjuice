import React, { useState, useEffect } from 'react';
import { GameState, PlayerState, RoundInfo } from '../types';
import { getRoundInfo, computeScoredPlayers, shiftDealer } from '../gameEngine';
import { saveGameToCloud } from '../api';
import {
  Trophy,
  HelpCircle,
  AlertCircle,
  Settings,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Award,
  RefreshCw,
  Home,
  Check,
  Flame,
  Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ScoringViewProps {
  gameState: GameState;
  onUpdateGame: (gameState: GameState) => void;
  onExitToHome: () => void;
}

export default function ScoringView({ gameState, onUpdateGame, onExitToHome }: ScoringViewProps) {
  // Local state for bidding & won dropdowns to prevent lagging
  const [bids, setBids] = useState<Record<string, number>>({});
  const [won, setWon] = useState<Record<string, number>>({});
  const [errorText, setErrorText] = useState<string | null>(null);
  const [selectedPlayerName, setSelectedPlayerName] = useState<string>('');
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [mobileShowResults, setMobileShowResults] = useState<boolean>(false);

  // Monitor size of screen / user agent for mobile layout adjustments
  useEffect(() => {
    const handleResize = () => {
      const isMobileWidth = window.innerWidth < 800;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(isMobileWidth || isMobileUA);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const currentRound = gameState.currentRound;
  const roundState = gameState.roundState; // 0 = bidding list, 1 = actual won list
  const roundInfo = getRoundInfo(currentRound);

  // Sync state variables
  useEffect(() => {
    // Pre-populate selectors based on current state parameters
    const initialBids: Record<string, number> = {};
    const initialWon: Record<string, number> = {};

    gameState.players.forEach(p => {
      const prs = p.roundScores[currentRound];
      if (prs) {
        initialBids[p.name] = prs.tricksNominated || 0;
        initialWon[p.name] = prs.tricksWon || 0;
      }
    });

    setBids(initialBids);
    setWon(initialWon);
    setErrorText(null);

    // Initial select: player after the dealer
    const dealerIndex = gameState.players.findIndex(p => p.isDealer);
    const nextIndex = dealerIndex !== -1 ? (dealerIndex + 1) % gameState.players.length : 0;
    const initialSelected = gameState.players[nextIndex]?.name || '';
    setSelectedPlayerName(initialSelected);
  }, [currentRound, roundState, gameState]);

  // Handle value triggers
  const handleBidChange = (playerName: string, val: number) => {
    setBids(prev => ({ ...prev, [playerName]: val }));
  };

  const handleWonChange = (playerName: string, val: number) => {
    setWon(prev => ({ ...prev, [playerName]: val }));
  };

  // Nominator done trigger page
  const handleBiddingDone = () => {
    let totalBids = 0;
    let dealerName = "";

    gameState.players.forEach(p => {
      totalBids += (bids[p.name] ?? 0);
      if (p.isDealer) dealerName = p.name;
    });

    // Valid number of tricks
    const tricksAvailable = roundInfo.tricks;

    if (totalBids === tricksAvailable) {
      setErrorText(`The total nominated bids (${totalBids}) cannot equal the total tricks (${tricksAvailable}). Dealer [${dealerName}] must adjust their bid to ensure drama!`);
      // Scroll to view
      return;
    }

    // Apply temporary values to players
    const updatedPlayers = gameState.players.map(p => {
      const copyRoundScores = { ...p.roundScores };
      copyRoundScores[currentRound] = {
        ...copyRoundScores[currentRound],
        tricksNominated: bids[p.name] ?? 0,
      };
      return {
        ...p,
        roundScores: copyRoundScores
      };
    });

    const updatedGame: GameState = {
      ...gameState,
      players: updatedPlayers,
      roundState: 1, // Advance to Tricking/Won state
      updatedAt: new Date().toISOString(),
    };

    saveGameToCloud(updatedGame).catch(err => {
      console.error("Failed to save bidding state to cloud:", err);
    });

    onUpdateGame(updatedGame);
    setErrorText(null);
  };

  // Tricking done trigger
  const handleTrickingDone = () => {
    let totalTricksWon = 0;
    // In Miss rounds, total tricks scored is always 7
    const tricksAvailable = roundInfo.isMiss ? 7 : roundInfo.tricks;

    gameState.players.forEach(p => {
      totalTricksWon += (won[p.name] ?? 0);
    });

    if (totalTricksWon !== tricksAvailable) {
      setErrorText(`Total tricks won (${totalTricksWon}) must equal the tricks available in this round (${tricksAvailable}). Please correct.`);
      return;
    }

    // Apply actual answers
    let updatedPlayers = gameState.players.map(p => {
      const copyRoundScores = { ...p.roundScores };
      copyRoundScores[currentRound] = {
        ...copyRoundScores[currentRound],
        tricksWon: won[p.name] ?? 0,
      };
      return {
        ...p,
        roundScores: copyRoundScores
      };
    });

    // Calculate score points gained
    updatedPlayers = computeScoredPlayers(updatedPlayers, currentRound, roundInfo.isMiss);

    const nextRound = currentRound + 1;
    let nextRoundState = 0;
    let nextStatus = gameState.status;

    if (nextRound > 18) {
      nextStatus = 'completed';
    } else {
      // Shift active dealer to the next player
      updatedPlayers = shiftDealer(updatedPlayers);
      // If the next round is a 'Miss' round, we skip bidding (there's no bidding in miss rounds)
      const nextRoundInfo = getRoundInfo(nextRound);
      if (nextRoundInfo.isMiss) {
        nextRoundState = 1; // Straight to won tricks input
      }
    }

    const updatedGame: GameState = {
      ...gameState,
      status: nextStatus,
      currentRound: nextRound,
      roundState: nextRoundState,
      players: updatedPlayers,
      updatedAt: new Date().toISOString(),
    };

    saveGameToCloud(updatedGame).catch(err => {
      console.error("Failed to save completed round to cloud:", err);
    });

    onUpdateGame(updatedGame);
    setErrorText(null);
  };

  const getSuitSymbol = (suit: string) => {
    if (suit.includes('♣')) return <b className="text-zinc-950 font-bold font-sans">♣</b>;
    if (suit.includes('♦')) return <b className="text-rose-600 font-bold font-sans">♦</b>;
    if (suit.includes('♥')) return <b className="text-rose-600 font-bold font-sans">♥</b>;
    if (suit.includes('♠')) return <b className="text-zinc-950 font-bold font-sans">♠</b>;
    return <span className="text-zinc-500 font-bold font-sans">NT</span>;
  };

  const dealerPlayerName = gameState.players.find(p => p.isDealer)?.name || 'None';

  // Helper JSX to keep ledger table DRY
  const ledgerTableElement = (
    <div className="overflow-x-auto custom-scrollbar select-text py-1 overscroll-x-contain">
      <table className="w-full text-center border-collapse min-w-[500px] select-text text-zinc-800">
        <thead>
          <tr className="border-b border-zinc-300 text-[10px] text-zinc-600 font-mono uppercase tracking-wider bg-zinc-200/60 font-black">
            <th className="py-2.5 px-2 text-left font-bold font-serif text-zinc-900">ROUND / SUIT</th>
            {gameState.players.map(p => (
              <th key={p.name} colSpan={3} className="py-2.5 px-1 border-l border-zinc-300 font-serif text-zinc-800 font-extrabold text-[11px]">
                {p.name}
              </th>
            ))}
          </tr>
          <tr className="border-b border-zinc-250 text-[8px] font-bold font-mono text-zinc-500 bg-zinc-100/40">
            <th className="py-1 px-2 text-left font-normal text-zinc-400">No. / Trump</th>
            {gameState.players.map((p, idx) => (
              <React.Fragment key={idx}>
                <td className="py-1 px-1 border-l border-zinc-250 font-bold">BID</td>
                <td className="py-1 px-1 font-bold">WON</td>
                <td className="py-1 px-1 text-amber-800 font-extrabold">PTS</td>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 18 }, (_, idx) => {
            const roundNum = idx + 1;
            const rInfo = getRoundInfo(roundNum);
            const isCurrent = roundNum === currentRound;

            return (
              <tr
                key={roundNum}
                className={`border-b border-zinc-200 text-[10px] py-1 select-text transition-all ${
                  isCurrent
                    ? 'bg-amber-100 text-amber-950 font-bold border-l-4 border-l-amber-500 shadow-sm'
                    : rInfo.isMiss
                      ? 'bg-rose-50/70 text-rose-950'
                      : rInfo.isBlind
                        ? 'bg-amber-50/70 text-amber-900'
                        : 'hover:bg-zinc-200/40 text-zinc-800'
                }`}
              >
                {/* Round descriptor cell */}
                <td className="py-1.5 px-2 text-left font-semibold">
                  <span className="font-mono text-[8px] text-zinc-400 mr-1.5">R{roundNum}</span>
                  {rInfo.isBlind ? '🙈' : ''} {rInfo.isMiss ? '❌' : ''}
                  <span className="font-mono">{rInfo.isMiss ? 'Miss' : rInfo.tricks}</span>
                  <span className="ml-1.5 select-text">{getSuitSymbol(rInfo.trumpSuit)}</span>
                </td>

                {/* Each player's scores */}
                {gameState.players.map((p, pIdx) => {
                  const userRoundScore = p.roundScores[roundNum];
                  const isPlayed = roundNum < currentRound;
                  const hasActiveBids = isCurrent && roundState === 1;

                  return (
                    <React.Fragment key={pIdx}>
                      {/* Nominated cell */}
                      <td className={`py-1.5 px-1 border-l border-zinc-200 font-mono text-center ${
                        isPlayed ? 'text-zinc-600' : isCurrent ? 'text-amber-800 font-extrabold' : 'text-zinc-400'
                      }`}>
                        {isPlayed ? userRoundScore.tricksNominated : isCurrent ? (bids[p.name] ?? '-') : '-'}
                      </td>
                      {/* Won tricks cell */}
                      <td className={`py-1.5 px-1 font-mono text-center ${
                        isPlayed ? 'text-zinc-600' : isCurrent && hasActiveBids ? 'text-amber-800 font-extrabold' : 'text-zinc-400'
                      }`}>
                        {isPlayed ? userRoundScore.tricksWon : (isCurrent && hasActiveBids ? (won[p.name] ?? '-') : '-')}
                      </td>
                      {/* Points earned cell */}
                      <td className={`py-1.5 px-0.5 font-bold font-mono text-center ${
                        isPlayed
                          ? userRoundScore.madeBid
                            ? 'bg-emerald-100 text-emerald-800 font-black'
                            : 'bg-rose-50 text-rose-700 font-semibold'
                          : isCurrent
                            ? 'text-amber-900 bg-amber-100/40 font-black'
                            : 'text-zinc-400'
                      }`}>
                        {isPlayed ? `${userRoundScore.score > 0 ? '+' : ''}${userRoundScore.score}` : '-'}
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-zinc-200 border-t-2 border-zinc-400 text-[10px] font-black text-zinc-900">
            <td className="py-4 px-3 text-left font-serif text-amber-950 uppercase tracking-wider font-extrabold text-[11px]">
              AGGREGATE SCORING
            </td>
            {gameState.players.map((p, idx) => (
              <React.Fragment key={idx}>
                <td colSpan={2} className="py-4 border-l border-zinc-300 text-zinc-600 font-mono text-[9px]">
                  Hit: <b className="text-zinc-950 font-extrabold">{p.madeBids}</b>/18
                </td>
                <td className="py-4 px-2 text-center font-extrabold font-mono text-amber-900 text-sm bg-zinc-300/40">
                  {p.currentScore}
                </td>
              </React.Fragment>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#050505] flex flex-col justify-between p-4 text-white">

      {/* HUD Top Bar */}
      <div>
        <div className="flex items-center justify-between mb-3 text-white/40">
          <button
            type="button"
            onClick={onExitToHome}
            className="text-xs text-white/55 hover:text-white flex items-center gap-1 font-mono transition-all cursor-pointer"
          >
            ← Leave App
          </button>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-[10px] font-mono font-bold text-white/40">PROTOCOL: {gameState.id.toUpperCase()}</span>
          </div>
        </div>

        {/* Dynamic Micro-Round Card */}
        <div className="bg-[#121212] border border-white/10 rounded-2xl p-4 mb-4 relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#E5C07B]/5 to-transparent pointer-events-none"></div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-[9px] uppercase font-bold text-[#E5C07B] font-mono tracking-widest mb-1">
                ACTIVE ROUND
              </div>
              <h2 className="text-2xl font-serif tracking-tight text-white flex items-center gap-2">
                Round {currentRound} of 18
              </h2>
            </div>

            {/* Trump Identifier stamp - LIGHT GREY BACKGROUND WITH SUIT COLOR */}
            <div className="bg-zinc-100 border-2 border-zinc-300 rounded-2xl px-5 py-2.5 text-center shadow-md min-w-[124px] scale-105 transform hover:scale-110 transition-all duration-300">
              <span className="text-[10px] block text-zinc-500 font-mono font-bold uppercase tracking-widest mb-1">TRUMP</span>
              <span className="text-xl font-serif font-extrabold flex items-center justify-center gap-1">
                {roundInfo.trumpSuit !== 'no' ? (
                  <span className={`${roundInfo.isRedSuit ? 'text-rose-600 font-black' : 'text-zinc-950 font-black'} text-xl`}>
                    {roundInfo.trumpSuit.toUpperCase()}
                  </span>
                ) : (
                  <span className="text-zinc-500 text-base tracking-wider font-sans font-bold">NO TRUMP</span>
                )}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-3.5 border-t border-white/5 text-center">
            <div className="bg-[#050505]/40 rounded-xl p-2 border border-white/5">
              <span className="text-[8px] block text-white/35 font-mono">DEALER</span>
              <span className="text-xs font-semibold text-white/80 truncate block mt-0.5" title={dealerPlayerName}>
                💬 {dealerPlayerName}
              </span>
            </div>
            <div className="bg-[#050505]/40 rounded-xl p-2 border border-white/5">
              <span className="text-[8px] block text-white/35 font-mono">TRICKS LIMIT</span>
              <span className="text-xs font-bold text-[#E5C07B] block mt-0.5 font-mono">
                {roundInfo.isMiss ? '7 (M)' : `${roundInfo.tricks}`}
              </span>
            </div>
            <div className="bg-[#050505]/40 rounded-xl p-2 border border-white/5">
              <span className="text-[8px] block text-white/35 font-mono">RULES TYPE</span>
              <span className={`text-xs font-bold block mt-0.5 ${
                roundInfo.isBlind ? 'text-[#E5C07B] animate-pulse' : roundInfo.isMiss ? 'text-rose-400' : 'text-white/60'
              }`}>
                {roundInfo.isBlind && '🙈 BLIND'}
                {roundInfo.isMiss ? '❌ MISS' : '⭐ REGULAR'}
              </span>
            </div>
          </div>
        </div>

        {/* Validation error widget */}
        <AnimatePresence>
          {errorText && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-rose-500/10 border border-rose-500/25 rounded-xl p-3.5 mb-4 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-200 leading-relaxed font-medium">
                {errorText}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isMobile && mobileShowResults ? (
          /* MOBILE ONLY REPLACEMENT RESULTS VIEW SHEET */
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-3"
          >
            <button
              type="button"
              onClick={() => setMobileShowResults(false)}
              className="w-full h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow active:scale-[0.98] transition-all cursor-pointer border border-white/10"
            >
              ← Back to Round Scoring Input
            </button>

            {/* Prominent high contrast aggregate scoring summary card */}
            <div className="bg-zinc-100 border border-zinc-250 rounded-2xl p-4 text-zinc-950 shadow-lg">
              <h4 className="text-[11px] font-mono font-bold text-amber-900 uppercase tracking-widest mb-3.5 border-b border-zinc-200 pb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-600 animate-pulse" />
                  CURRENT STANDINGS
                </span>
                <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded text-[8px] font-mono">
                  AGGREGATE SCORING
                </span>
              </h4>
              <div className="space-y-2.5">
                {[...gameState.players].sort((a,b) => b.currentScore - a.currentScore).map((p, idx) => {
                  const isPlayerDealer = p.name === dealerPlayerName;
                  return (
                    <div key={p.name} className="flex items-center justify-between font-mono py-2 border-b border-zinc-200 last:border-0">
                      <span className="text-xs font-extrabold text-zinc-900 flex items-center gap-1">
                        <span className="text-[10px] text-zinc-400 bg-zinc-200 w-5 h-5 rounded-full flex items-center justify-center shrink-0 font-bold">#{idx + 1}</span>
                        {p.name} {isPlayerDealer && <span className="text-[10px] text-amber-900 bg-amber-100 border border-amber-250 px-1 rounded">DEALER</span>}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-zinc-500">Hit: {p.madeBids}/18</span>
                        <span className="text-sm font-black text-amber-900 bg-zinc-300/40 px-2.5 py-1 rounded border border-zinc-305 shadow-sm leading-none shrink-0 min-w-[54px] text-center">
                          {p.currentScore} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Full horizontal matrix schema ledger info card */}
            <div className="bg-zinc-100 border-2 border-zinc-300 rounded-2xl overflow-hidden p-4 shadow-xl text-zinc-800">
              <h3 className="text-xs font-serif text-zinc-900 uppercase tracking-wider mb-2 flex items-center justify-between border-b border-zinc-200 pb-2">
                <span className="flex items-center gap-1.5 font-bold">
                  <Trophy className="w-4 h-4 text-amber-600" />
                  Score Sheet Ledger
                </span>
                <span className="text-[8px] font-mono font-bold text-zinc-500 bg-zinc-200 border border-zinc-300 px-1.5 py-0.5 rounded">
                  SCROLL MATRIX
                </span>
              </h3>
              {ledgerTableElement}
            </div>

            <button
              type="button"
              onClick={() => setMobileShowResults(false)}
              className="w-full mt-2 h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow active:scale-[0.98] transition-all cursor-pointer border border-white/10"
            >
              ← Return to Active Round Input
            </button>
          </motion.div>
        ) : (
          /* REGULAR INPUT PANEL FOR SCORING ACTIVES (BID / WON TRICKS) */
          <div>
            <div className="bg-[#121212] border border-white/10 rounded-2xl p-4 mb-4 shadow-xl">
              <h3 className="text-[10px] font-mono font-bold text-white/45 uppercase tracking-wider mb-3.5 flex items-center justify-between">
                <span>
                  {roundState === 0 ? '📝 Bid Nominations' : '🎰 Won Trick Allocation'}
                </span>
                <span className="bg-[#050505] text-[#E5C07B] border border-white/10 px-2 py-0.5 rounded text-[8px] font-mono">
                  STAGE {roundState + 1}/2
                </span>
              </h3>

              <div className="space-y-2.5">
                {gameState.players.map((p) => (
                  <div
                    key={p.name}
                    onClick={() => setSelectedPlayerName(p.name)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                      selectedPlayerName === p.name
                        ? 'bg-[#E5C07B]/8 border-[#E5C07B]/40 shadow-inner scale-[1.01] ring-1 ring-[#E5C07B]/20 glow-selected'
                        : 'bg-[#050505]/40 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className={`text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded font-mono ${
                        p.isDealer ? 'bg-[#E5C07B]/10 text-[#E5C07B]' : 'bg-white/5 text-white/40'
                      }`}>
                        {p.isDealer ? 'Dealer' : 'Opp'}
                      </span>
                      <span className="text-xs font-semibold text-white/90 truncate">{p.name}</span>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {roundState === 0 ? (
                        /* Select nominations dropdown */
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-white/40 font-mono">Nominate:</span>
                          <select
                            id={`select-bid-${p.name}`}
                            value={bids[p.name] ?? 0}
                            onChange={(e) => handleBidChange(p.name, parseInt(e.target.value))}
                            className="bg-[#121212] border border-white/10 text-white font-mono font-bold text-xs rounded-lg px-2 py-1 w-16 focus:ring-1 focus:ring-[#E5C07B] outline-none cursor-pointer"
                          >
                            {Array.from({ length: roundInfo.tricks + 1 }, (_, i) => (
                              <option key={i} value={i} className="font-mono bg-[#121212] text-white">{i}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        /* Select won dropdown */
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-white/40">
                            Bid: <b className="text-[#E5C07B] bg-white/5 px-1 py-0.5 rounded border border-white/10 font-mono">{bids[p.name] ?? p.roundScores[currentRound]?.tricksNominated ?? 0}</b>
                          </span>
                          <span className="text-[10px] text-white/40 font-mono">Won:</span>
                          <select
                            id={`select-won-${p.name}`}
                            value={won[p.name] ?? 0}
                            onChange={(e) => handleWonChange(p.name, parseInt(e.target.value))}
                            className="bg-[#121212] border border-white/10 text-white font-mono font-bold text-xs rounded-lg px-2 py-1 w-16 focus:border-[#E5C07B] outline-none cursor-pointer"
                          >
                            {/* If miss, max trick is 7 (all hand size). Otherwise max tricks round */}
                            {Array.from({ length: (roundInfo.isMiss ? 8 : roundInfo.tricks + 1) }, (_, i) => (
                              <option key={i} value={i} className="font-mono bg-[#121212] text-white">{i}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button
                id={roundState === 0 ? "btn-bid-done" : "btn-won-done"}
                onClick={roundState === 0 ? handleBiddingDone : handleTrickingDone}
                className={`w-full h-11 rounded-lg active:scale-[0.98] font-serif tracking-widest text-black text-xs font-bold uppercase transition-all mt-4 flex items-center justify-center gap-1.5 cursor-pointer ${
                  roundState === 0
                    ? "bg-cyan-400 hover:bg-cyan-300 shadow-md shadow-cyan-400/20"
                    : "bg-[#E5C07B] hover:bg-[#d4b06a] shadow-md shadow-[#E5C07B]/5"
                }`}
              >
                {roundState === 0 ? (
                  <>
                    Confirm Bids
                    <ChevronRight className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-black" />
                    Submit Results
                  </>
                )}
              </button>
            </div>

            {isMobile && (
              /* MOBILE-ONLY VIEW GAME RESULTS TRIGGER BUTTON */
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setMobileShowResults(true)}
                className="w-full h-12 mb-4 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-serif font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xl active:scale-[0.98] transition-all cursor-pointer border border-zinc-305"
              >
                <Trophy className="w-4 h-4 text-amber-600 shrink-0" />
                View Score Details
              </motion.button>
            )}
          </div>
        )}
      </div>

      {/* HORIZONTAL BOARD SCROLL (Faithful Ledger Card) */}
      {!isMobile && (
        <div className="mt-2 mb-4 bg-zinc-100 border-2 border-zinc-300 rounded-2xl overflow-hidden p-4 shadow-xl transition-all duration-300 select-text text-zinc-800">
          <h3 className="text-xs font-serif text-zinc-800 uppercase tracking-wider mb-3 flex items-center justify-between select-text border-b border-zinc-200 pb-2">
            <span className="flex items-center gap-1.5 font-bold">
              <Trophy className="w-4 h-4 text-amber-600" />
              Game Results
            </span>
            <span className="text-[8px] font-mono font-bold text-zinc-500 bg-zinc-200 border border-zinc-300 px-1.5 py-0.5 rounded">
              SCROLLABLE MATRIX DATA
            </span>
          </h3>
          {ledgerTableElement}
        </div>
      )}

    </div>
  );
}
