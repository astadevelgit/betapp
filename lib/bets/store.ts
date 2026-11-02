"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { MAX_LEGS } from "./math";
import type { AddLegResult, BetSlipLeg, BetType } from "./types";

interface BetSlipState {
  legs: BetSlipLeg[];
  stake: string;
  mode: BetType;
  addLeg: (leg: BetSlipLeg) => AddLegResult;
  removeLeg: (selectionId: string) => void;
  removeLegs: (selectionIds: string[]) => void;
  clear: () => void;
  setStake: (stake: string) => void;
  setMode: (mode: BetType) => void;
  updateOdds: (selectionId: string, odds: number) => void;
  pruneStarted: () => number;
  normalize: () => void;
}

function modeFor(count: number): BetType {
  return count > 1 ? "accumulator" : "single";
}

export const useBetSlipStore = create<BetSlipState>()(
  persist(
    (set, get) => ({
      legs: [],
      stake: "100",
      mode: "single",

      addLeg: (leg) => {
        const current = get().legs;
        const existing = current.find(
          (item) => item.selectionId === leg.selectionId,
        );

        if (existing) {
          set({ legs: current.filter((item) => item.selectionId !== leg.selectionId) });
          return "removed";
        }

        const sameMatch = current.find((item) => item.matchId === leg.matchId);
        if (sameMatch) {
          const next = current.map((item) =>
            item.matchId === leg.matchId ? leg : item,
          );
          set({ legs: next, mode: modeFor(next.length) });
          return "replaced";
        }

        if (current.length >= MAX_LEGS) {
          return "limit";
        }

        const next = [...current, leg];
        set({ legs: next, mode: modeFor(next.length) });
        return "added";
      },

      removeLeg: (selectionId) => {
        const next = get().legs.filter((leg) => leg.selectionId !== selectionId);
        set({ legs: next, mode: modeFor(next.length) });
      },

      removeLegs: (selectionIds) => {
        const ids = new Set(selectionIds);
        const next = get().legs.filter((leg) => !ids.has(leg.selectionId));
        set({ legs: next, mode: modeFor(next.length) });
      },

      clear: () => set({ legs: [], mode: "single" }),

      setStake: (stake) => {
        const digits = stake.replace(/[^\d]/g, "").slice(0, 6);
        set({ stake: digits });
      },

      setMode: (mode) => set({ mode }),

      updateOdds: (selectionId, odds) => {
        set({
          legs: get().legs.map((leg) =>
            leg.selectionId === selectionId
              ? { ...leg, odds: Number(odds) }
              : leg,
          ),
        });
      },

      pruneStarted: () => {
        const cutoff = Date.now() + 60_000;
        const current = get().legs;
        const next = current.filter((leg) => {
          const kickoff = new Date(leg.kickoffAt).getTime();
          return Number.isFinite(kickoff) && kickoff > cutoff;
        });
        const removed = current.length - next.length;

        if (removed > 0) {
          set({ legs: next, mode: modeFor(next.length) });
        }

        return removed;
      },

      normalize: () => {
        const seenMatches = new Set<string>();
        const seenSelections = new Set<string>();
        const next: BetSlipLeg[] = [];

        for (const leg of get().legs) {
          if (
            !leg ||
            typeof leg.selectionId !== "string" ||
            typeof leg.matchId !== "string" ||
            seenMatches.has(leg.matchId) ||
            seenSelections.has(leg.selectionId)
          ) {
            continue;
          }

          seenMatches.add(leg.matchId);
          seenSelections.add(leg.selectionId);
          next.push(leg);

          if (next.length === MAX_LEGS) break;
        }

        if (next.length !== get().legs.length) {
          set({ legs: next, mode: modeFor(next.length) });
        } else if (get().mode !== modeFor(next.length)) {
          set({ mode: modeFor(next.length) });
        }
      },
    }),
    {
      name: "betapp-bet-slip",
      version: 1,
      partialize: (state) => ({
        legs: state.legs,
        stake: state.stake,
        mode: state.mode,
      }),
    },
  ),
);
