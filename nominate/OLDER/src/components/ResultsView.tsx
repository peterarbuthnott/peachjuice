import React, { useEffect, useState } from "react";
import { GameState } from "../types";
import { recordGameResultsForPlayers } from "../api";
import {
  Trophy,
  Crown,
  Award,
  Share2,
  Home,
  Sparkles,
  Zap,
  Medal,
  Activity,
} from "lucide-react";
import { motion } from "motion/react";

interface ResultsViewProps {
  gameState: GameState;
  onRestart: () => void;
}

export default function ResultsView({
  gameState,
  onRestart,
}: ResultsViewProps) {
  const [syncedCloudStatus, setSyncedCloudStatus] = useState<
    "idle" | "syncing" | "synced" | "failed"
  >("idle");

  // Sort players by final score
  const scoreboard = [...gameState.players].sort(
    (a, b) => b.currentScore - a.currentScore,
  );
  const winner = scoreboard[0];

  useEffect(() => {
    // Automatically save endgame records to the players data file
    async function uploadFinalStats() {
      setSyncedCloudStatus("syncing");
      try {
        const payload = gameState.players.map((p) => ({
          name: p.name,
          score: p.currentScore,
          won: p.name === winner.name,
          bidsMade: p.madeBids,
        }));
        await recordGameResultsForPlayers(payload);
        setSyncedCloudStatus("synced");
      } catch (e) {
        console.error(e);
        setSyncedCloudStatus("failed");
      }
    }
    uploadFinalStats();
  }, [gameState, winner]);

  // Handle standard clipboard text generation
  const handleShare = () => {
    const trophyPodium = scoreboard
      .map(
        (p, idx) =>
          `${idx + 1}. ${p.name} - ${p.currentScore} pts (bids: ${p.madeBids}/18)`,
      )
      .join("\n");
    const shareText = `🏆 Nominate Scoring App Result!\n\nWinner: ${winner?.name} with ${winner?.currentScore} points!\n\nFinal Standings:\n${trophyPodium}\n\nPlayed on Nominate Whist scoring App.`;

    navigator.clipboard.writeText(shareText);
    alert(
      "📋 Results copied to clipboard! You can paste and share with friends.",
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#050505] flex flex-col p-6 text-white justify-between">
      <div>
        {/* Header decoration */}
        <div className="text-center my-6">
          <motion.div
            initial={{ scale: 0, rotate: 180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#1A1A1A] border border-[#E5C07B]/40 shadow-xl shadow-black/40 mb-3"
          >
            <Trophy className="w-6 h-6 text-[#E5C07B]" />
          </motion.div>
          <h2 className="text-3xl font-serif text-[#E5C07B] tracking-tight">
            Grand Finale
          </h2>
          <p className="text-[9px] text-white/80 font-mono tracking-widest uppercase mt-1">
            18 rounds scoring complete
          </p>
        </div>

        {/* Podium visualization */}
        <div className="flex justify-center items-end gap-3 my-8 h-32">
          {/* Second place */}
          {scoreboard[1] && (
            <div className="flex flex-col items-center flex-1 max-w-[100px]">
              <div className="text-xs font-semibold text-center text-white/70 truncate w-full mb-1">
                {scoreboard[1].name}
              </div>
              <div className="text-[10px] font-mono text-white/40 mb-1.5">
                {scoreboard[1].currentScore} pts
              </div>
              <div className="w-full h-12 bg-[#121212] rounded-t-xl flex items-center justify-center border-t border-x border-white/10">
                <span className="font-mono text-white/30 text-base font-black">
                  2
                </span>
              </div>
            </div>
          )}

          {/* First place */}
          {scoreboard[0] && (
            <div className="flex flex-col items-center flex-1 max-w-[110px]">
              <Crown className="w-5 h-5 text-[#E5C07B] mb-1 animate-bounce" />
              <div className="text-sm font-bold text-center text-[#E5C07B] truncate w-full mb-0.5">
                {scoreboard[0].name}
              </div>
              <div className="text-[10px] font-mono text-[#E5C07B] mb-1.5 p-0.5 bg-[#E5C07B]/10 rounded border border-[#E5C07B]/20">
                {scoreboard[0].currentScore} pts
              </div>
              <div className="w-full h-18 bg-[#E5C07B]/5 rounded-t-xl flex items-center justify-center border-t-2 border-x border-[#E5C07B]/40 glow-selected">
                <span className="font-mono text-[#E5C07B] text-xl font-bold">
                  1
                </span>
              </div>
            </div>
          )}

          {/* Third place */}
          {scoreboard[2] && (
            <div className="flex flex-col items-center flex-1 max-w-[100px]">
              <div className="text-xs font-semibold text-center text-white/70 truncate w-full mb-1">
                {scoreboard[2].name}
              </div>
              <div className="text-[10px] font-mono text-white/40 mb-1.5">
                {scoreboard[2].currentScore} pts
              </div>
              <div className="w-full h-9 bg-[#121212] rounded-t-xl flex items-center justify-center border-t border-x border-white/10">
                <span className="font-mono text-white/20 text-sm font-black">
                  3
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Sync telemetry loader status */}
        <div className="text-center mb-6">
          {syncedCloudStatus === "syncing" ? (
            <span className="text-[9px] bg-[#121212] border border-white/10 text-white/50 px-3 py-1 rounded-full font-mono">
              Saving totals to cloud database...
            </span>
          ) : syncedCloudStatus === "synced" ? (
            <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full font-mono font-bold">
              ✓ Scores Logged to Global Leaderboard
            </span>
          ) : (
            <span className="text-[9px] bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3 py-1 rounded-full font-mono">
              Database offline, scores saved locally
            </span>
          )}
        </div>

        {/* Detailed Scores lists */}
        <div className="bg-[#121212] border border-white/10 rounded-2xl p-4 shadow-xl">
          <h3 className="text-xs font-serif text-[#E5C07B] uppercase tracking-wider mb-3.5 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-[#E5C07B]" />
            Performance
          </h3>

          <div className="space-y-2">
            {scoreboard.map((p, idx) => (
              <div
                key={p.name}
                className="flex items-center justify-between p-3 rounded-xl bg-[#050505]/40 border border-white/5 transition-all hover:border-white/10"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-[#121212] text-white/40 font-bold text-xs flex items-center justify-center font-mono border border-white/10">
                    #{idx + 1}
                  </span>
                  <span className="text-sm font-semibold text-white/90">
                    {p.name}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-white/40 text-right font-mono leading-none">
                    Bids Hit:{" "}
                    <b className="text-white/80 font-bold block text-xs mt-0.5">
                      {p.madeBids}/18
                    </b>
                  </span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-[#E5C07B] font-mono">
                      {p.currentScore}
                    </span>
                    <span className="text-[8px] font-mono text-white/30 block mt-0.5">
                      points
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Primary Action bar */}
      <div className="mt-8 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={handleShare}
          className="w-full h-11 rounded-lg border border-white/10 bg-[#121212] hover:bg-[#1A1A1B] text-white/80 font-mono text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5 text-[#E5C07B]" />
          Share Match Summary
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="w-full h-12 rounded-lg bg-[#E5C07B] hover:bg-[#d4b06a] text-black font-serif text-sm font-semibold tracking-wider flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
        >
          <Home className="w-4 h-4" />
          Back to Start Screen
        </button>
      </div>
    </div>
  );
}
