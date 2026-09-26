import React, { useState, useEffect } from 'react';
import { GameState, SavedPlayerProfile } from '../types';
import { fetchSavedPlayersFromCloud } from '../api';
import {
  Users,
  ArrowRight,
  UserPlus,
  Sparkles,
  CheckCircle,
  HelpCircle,
  Shuffle
} from 'lucide-react';
import { motion } from 'motion/react';

interface NamingViewProps {
  gameState: GameState;
  onConfirmNames: (playerNames: string[]) => void;
  onBackToHome: () => void;
}

const FUN_NAMES = ["Alice", "Bob", "Charlie", "David", "Emma", "Frank", "Grace", "Henry", "Isabella", "Jack", "Kate", "Liam"];

export default function NamingView({ gameState, onConfirmNames, onBackToHome }: NamingViewProps) {
  const [names, setNames] = useState<string[]>([]);
  const [cloudProfiles, setCloudProfiles] = useState<SavedPlayerProfile[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);

  // Load potential profiles on load
  useEffect(() => {
    async function loadProfiles() {
      const profiles = await fetchSavedPlayersFromCloud();
      setCloudProfiles(profiles);
    }
    loadProfiles();
  }, []);

  // Initialize name arrays based on players amount
  useEffect(() => {
    const initialized = Array(gameState.numberOfPlayers)
      .fill('')
      .map((_, i) => gameState.players[i]?.name || `Player ${i + 1}`);
    setNames(initialized);
  }, [gameState]);

  const handleNameChange = (index: number, val: string) => {
    setNames(prev => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleSelectAutocomplete = (profileName: string) => {
    // Avoid double Selecting the same player name
    if (names.includes(profileName)) return;

    handleNameChange(activeIndex, profileName);
    // Move on to next player if possible
    if (activeIndex < gameState.numberOfPlayers - 1) {
      setActiveIndex(prev => prev + 1);
    }
  };

  const handleRandomize = () => {
    const randomName = FUN_NAMES[Math.floor(Math.random() * FUN_NAMES.length)];
    if (!names.includes(randomName)) {
      handleNameChange(activeIndex, randomName);
    }
  };

  const handleDone = () => {
    // Basic verification: clean and sanitize name inputs
    const validatedNames = names.map((name, i) => {
      const trimmed = name.trim();
      return trimmed === '' ? `Player ${i + 1}` : trimmed;
    });
    onConfirmNames(validatedNames);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#050505] flex flex-col p-6 text-white justify-between">

      {/* Visual Header */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={onBackToHome}
            className="text-xs text-white/50 hover:text-white font-mono transition-colors cursor-pointer"
          >
            ← Cancel
          </button>
          <span className="text-xs text-white/20">•</span>
          <span className="text-xs text-white/40 font-mono">Phase 2: Naming Players</span>
        </div>

        <h2 className="text-2xl font-serif text-[#E5C07B] mb-2 flex items-center gap-2 tracking-tight">
          <Users className="w-5 h-5 text-[#E5C07B]" />
          Configure Seating Order
        </h2>
        <p className="text-xs text-white/80 mb-5 leading-relaxed">
          Input player names in clockwise dealing order. You can choose from active saved profiles.
        </p>

        {/* Dynamic Name Inputs list */}
        <div className="space-y-3 mb-6">
          {names.map((name, index) => {
            const isActive = index === activeIndex;
            return (
              <motion.div
                key={index}
                onClick={() => setActiveIndex(index)}
                className={`border rounded-xl p-3 flex.5 p-3 flex items-center gap-3 transition-all cursor-pointer ${
                  isActive
                    ? 'border-[#E5C07B] bg-[#E5C07B]/5 glow-selected'
                    : 'border-white/10 bg-[#121212]/50 hover:bg-[#1A1A1B]'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold font-serif text-xs transition-all ${
                  isActive
                    ? 'bg-[#E5C07B] text-black shadow-md'
                    : 'bg-[#121212] text-white/40 border border-white/10'
                }`}>
                  {index === 0 ? '👑' : index + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-[9px] uppercase font-bold text-white/40 font-mono flex items-center gap-1.5">
                    Slot {index + 1} {index === 0 && <span className="bg-[#E5C07B]/10 text-[#E5C07B] px-1 py-0.2 rounded font-mono text-[8px] font-extrabold">DEALER</span>}
                  </div>
                  <input
                    type="text"
                    value={name}
                    id={`player-input-${index}`}
                    onClick={(e) => { e.stopPropagation(); setActiveIndex(index); }}
                    onChange={(e) => handleNameChange(index, e.target.value)}
                    placeholder={`Player ${index + 1}`}
                    className="w-full bg-transparent text-white text-sm font-semibold outline-none border-none p-0 focus:ring-0 placeholder:text-white/20 mt-0.5"
                  />
                </div>

                {name.trim() !== '' && (
                  <CheckCircle className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Saved Player Autocomplete Pill Panel */}
        {cloudProfiles.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-mono uppercase tracking-wider text-white/45 font-extrabold">
                Saved Legends (Tap to fill)
              </span>
              <button
                type="button"
                onClick={handleRandomize}
                className="text-[9px] font-mono tracking-wider text-[#E5C07B] hover:text-[#d3af6b] flex items-center gap-1"
                title="Random Name Hint"
              >
                <Shuffle className="w-3 h-3" />
                Randomize
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto">
              {cloudProfiles
                .filter(p => !names.includes(p.name))
                .slice(0, 10)
                .map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => handleSelectAutocomplete(profile.name)}
                    className="text-xs bg-[#121212] hover:bg-[#1A1A1B] hover:border-white/20 text-white/80 px-2.5 py-1 rounded-lg border border-white/10 transition-all font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <UserPlus className="w-3 h-3 text-[#E5C07B]" />
                    {profile.name}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Done Trigger */}
      <div className="mt-8">
        <button
          id="btn-naming-done"
          onClick={handleDone}
          className="w-full h-12 rounded-xl bg-[#E5C07B] hover:bg-[#d4b06a] active:scale-[0.98] font-serif tracking-wide text-black text-sm font-semibold transition-all shadow-xl shadow-black/40 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          Begin nomination scoring
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
}
