import { create } from "zustand";

export type Vertical = "cloud_gpu_spot_arbitrage" | "hardware_restock_arbitrage";

export type Witness = {
  id: string;
  vertical: Vertical;
  sku: string;
  promo: string;
  claimedBps: number;
  refCents: number;
  obsCents: number;
  merkle: string;
  hashLock: string;
  observedAt: number;
  burned: boolean;
  revealed: boolean;
};

export type LogLine = { id: string; ts: number; text: string; tone: "ok" | "warn" | "bad" };

type State = {
  ready: boolean;
  now: number;
  witnesses: Witness[];
  bondUnits: number;
  slaUnits: number;
  emittedToday: number;
  agents: number;
  tier2Used: number;
  tier2Enabled: boolean;
  tier3Open: boolean;
  kill: boolean;
  killReason: string | null;
  log: LogLine[];
  init: () => void;
  tick: () => void;
  unlockTier1: (id: string) => string;
  streamTick: () => string;
  lockTier3: (id: string) => string;
  resetTier3: () => void;
  setShares: (a: number, b: number, c: number) => void;
  shares: [number, number, number];
  tier4: { phase: "idle" | "filled" | "refunded"; secret: string | null };
  settleTier4: () => void;
  refundTier4: () => void;
  runSlash: (claimed: number, ref: number, obs: number) => { actual: number; slashed: boolean };
  tripSchema: () => void;
  replenish: () => void;
  rearm: (signed: boolean) => string;
};

function hex(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

function merkle(id: string) {
  return `${hex(id + "a")}${hex(id + "b")}${hex(id + "c")}${hex(id + "d")}${hex(id + "e")}${hex(id + "f")}${hex(id + "g")}${hex(id + "h")}`;
}

const SEEDS: Omit<Witness, "observedAt" | "merkle" | "hashLock" | "burned" | "revealed">[] = [
  { id: "w_live_h200_01", vertical: "cloud_gpu_spot_arbitrage", sku: "NVIDIA-H200-SXM-8X-SPOT", promo: "QMA2-FLASH-18OFF", claimedBps: 1649, refCents: 850, obsCents: 710 },
  { id: "w_live_b200_02", vertical: "cloud_gpu_spot_arbitrage", sku: "NVIDIA-B200-NVL72-SPOT", promo: "CLUSTER-PRIME", claimedBps: 2250, refCents: 2400, obsCents: 1860 },
  { id: "w_hw_rtx5090_01", vertical: "hardware_restock_arbitrage", sku: "NVIDIA-RTX-5090-FE-BATCH-04", promo: "DIRECT-ALLOC-PARITY", claimedBps: 2000, refCents: 249900, obsCents: 199920 },
  { id: "w_hw_m4_hist", vertical: "hardware_restock_arbitrage", sku: "APPLE-MAC-STUDIO-M4-ULTRA-512GB", promo: "EDU-OPEN", claimedBps: 1500, refCents: 699900, obsCents: 594915 },
  { id: "w_hist_b200_00", vertical: "cloud_gpu_spot_arbitrage", sku: "NVIDIA-B200-SXM-HIST", promo: "PROOF-ALPHA", claimedBps: 2100, refCents: 1900, obsCents: 1501 },
];

const AGES = [18, 74, 41, 980, 1120];

function push(log: LogLine[], text: string, tone: LogLine["tone"]): LogLine[] {
  return [{ id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, ts: Date.now(), text, tone }, ...log].slice(0, 12);
}

export const useOracle = create<State>((set, get) => ({
  ready: false,
  now: 0,
  witnesses: [],
  bondUnits: 10_000_000,
  slaUnits: 50_000_000,
  emittedToday: 4,
  agents: 1,
  tier2Used: 3,
  tier2Enabled: true,
  tier3Open: true,
  kill: false,
  killReason: null,
  log: [],
  shares: [50, 30, 20],
  tier4: { phase: "idle", secret: null },

  init: () => {
    if (get().ready) return;
    const now = Date.now();
    const witnesses: Witness[] = SEEDS.map((s, idx) => ({
      ...s,
      observedAt: now - AGES[idx] * 1000,
      merkle: merkle(s.id),
      hashLock: hex(s.id + "_secret_K"),
      burned: false,
      revealed: AGES[idx] >= 900,
    }));
    set({
      ready: true,
      now,
      witnesses,
      log: [
        { id: "l0", ts: now, text: "Oracle ready. 2 verticals active. Base L2 bond = 10 USDC.", tone: "ok" },
        { id: "l1", ts: now - 1000, text: "PandaForge bridge healthy at 127.0.0.1:8787.", tone: "ok" },
      ],
    });
  },

  tick: () => {
    set((s) => ({ now: Date.now() }));
  },

  unlockTier1: (id) => {
    const s = get();
    if (s.kill) return "Rejected: auto-kill-switch armed.";
    const target = s.witnesses.find((w) => w.id === id);
    if (!target) return "Witness not found.";
    if (target.burned) return "HTTP 403: witness was burned via Tier 3 exclusive snipe.";
    set((st) => ({
      witnesses: st.witnesses.map((w) => (w.id === id ? { ...w, revealed: true } : w)),
      log: push(st.log, `Tier 1: unlocked ${id} for $0.25. Key revealed.`, "ok"),
    }));
    return `Unlocked ${id}: SKU=${target.sku} PROMO=${target.promo}`;
  },

  streamTick: () => {
    const s = get();
    if (s.kill) return "Rejected: kill switch.";
    if (s.tier2Used >= 25) return "Hourly quota (25 reveals) exhausted.";
    const next = s.tier2Used + 1;
    set((st) => ({
      tier2Used: next,
      log: push(st.log, `Tier 2 SSE: push reveal #${next}/25 delivered (<5ms).`, "ok"),
    }));
    return `Tier 2 stream healthy: reveal #${next}/25 emitted.`;
  },

  lockTier3: (id) => {
    const s = get();
    if (s.kill) return "Rejected: kill switch.";
    const target = s.witnesses.find((w) => w.id === id);
    if (!target) return "Witness not found.";
    if (target.burned) return "Already burned.";
    set((st) => ({
      witnesses: st.witnesses.map((w) => (w.id === id ? { ...w, burned: true, revealed: true } : w)),
      tier3Open: false,
      log: push(st.log, `Tier 3: $25 exclusive burn on ${id}. Pool purged.`, "warn"),
    }));
    return `BURNED ${id}. Re-locking for 24h. Competing buyers will receive HTTP 403.`;
  },

  resetTier3: () => {
    set((st) => ({
      tier3Open: true,
      log: push(st.log, "Tier 3 re-gated for next epoch.", "ok"),
    }));
  },

  setShares: (a, b, c) => set({ shares: [a, b, c] }),

  settleTier4: () => {
    const [a, b, c] = get().shares;
    const total = a + b + c;
    if (total !== 100) {
      set((st) => ({
        log: push(st.log, `Tier 4 settle failed: allocations sum to ${total}%, must be 100%.`, "warn"),
      }));
      return;
    }
    const secret = "SECRET_PREIMAGE_WHOLESALE_ALLOC_K402_VERIFIED_7x9";
    set((st) => ({
      tier4: { phase: "filled", secret },
      log: push(st.log, "Tier 4 settled: 3/3 buyers funded. Wholesale secret unlocked.", "ok"),
    }));
  },

  refundTier4: () => {
    set((st) => ({
      tier4: { phase: "refunded", secret: null },
      log: push(st.log, "Tier 4 timeout triggered: refunds dispatched, ciphertext destroyed.", "warn"),
    }));
  },

  runSlash: (claimed, ref, obs) => {
    const actual = Math.floor(((ref - obs) * 10_000) / ref);
    if (actual < claimed) {
      set((st) => ({
        bondUnits: 0,
        kill: true,
        killReason: `Bond slashed: claimed ${claimed} bps > actual ${actual} bps.`,
        log: push(st.log, `SLASH TRIP: claim=${claimed}bps actual=${actual}bps. 10 USDC drained.`, "bad"),
      }));
      return { actual, slashed: true };
    }
    set((st) => ({
      log: push(st.log, `Predicate verified: actual ${actual}bps >= claim ${claimed}bps. Bond safe.`, "ok"),
    }));
    return { actual, slashed: false };
  },

  tripSchema: () => {
    set((st) => ({
      kill: true,
      killReason: "Simulated selector drift on cloud.example-gpu-market.io (NaN price).",
      log: push(st.log, "Auto-kill-switch tripped in 0.0275ms. All emissions suspended.", "bad"),
    }));
  },

  replenish: () => {
    set((st) => ({
      bondUnits: 10_000_000,
      log: push(st.log, "Bond replenished to 10 USDC (unverified until rearm).", "ok"),
    }));
  },

  rearm: (signed) => {
    const s = get();
    if (s.bondUnits < 10_000_000) return "Gate 1 failed: bond is below 10 USDC.";
    if (!signed) return "Gate 2 failed: operator signature missing.";
    set((st) => ({
      kill: false,
      killReason: null,
      log: push(st.log, "Gate 3 passed: 3 dry-run canaries verified. Rails RE-ARMED.", "ok"),
    }));
    return "Rails RE-ARMED. Green status restored.";
  },
}));
