import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  Lock,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useOracle, type Witness } from "@/lib/oracle-store";

const FREE_MS = 900_000;

function bpsLabel(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

function short(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function countdown(w: Witness, now: number) {
  const left = FREE_MS - (now - w.observedAt);
  if (left <= 0) return { free: true, label: "FREE KEY" };
  const s = Math.ceil(left / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return { free: false, label: `${m}:${r.toString().padStart(2, "0")}` };
}

export function Console() {
  const ready = useOracle((s) => s.ready);
  const now = useOracle((s) => s.now);
  const witnesses = useOracle((s) => s.witnesses);
  const bondUnits = useOracle((s) => s.bondUnits);
  const slaUnits = useOracle((s) => s.slaUnits);
  const emittedToday = useOracle((s) => s.emittedToday);
  const agents = useOracle((s) => s.agents);
  const tier2Used = useOracle((s) => s.tier2Used);
  const tier3Open = useOracle((s) => s.tier3Open);
  const kill = useOracle((s) => s.kill);
  const killReason = useOracle((s) => s.killReason);
  const log = useOracle((s) => s.log);
  const shares = useOracle((s) => s.shares);
  const tier4 = useOracle((s) => s.tier4);
  const init = useOracle((s) => s.init);
  const tick = useOracle((s) => s.tick);
  const unlockTier1 = useOracle((s) => s.unlockTier1);
  const streamTick = useOracle((s) => s.streamTick);
  const lockTier3 = useOracle((s) => s.lockTier3);
  const resetTier3 = useOracle((s) => s.resetTier3);
  const setShares = useOracle((s) => s.setShares);
  const settleTier4 = useOracle((s) => s.settleTier4);
  const refundTier4 = useOracle((s) => s.refundTier4);
  const runSlash = useOracle((s) => s.runSlash);
  const tripSchema = useOracle((s) => s.tripSchema);
  const replenish = useOracle((s) => s.replenish);
  const rearm = useOracle((s) => s.rearm);

  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("Select a witness, then run a tier.");
  const [claimed, setClaimed] = useState(1649);
  const [refC, setRefC] = useState(2850);
  const [obsC, setObsC] = useState(2380);
  const [slashNote, setSlashNote] = useState("Integer predicate idle.");
  const [signed, setSigned] = useState(false);
  const [rearmNote, setRearmNote] = useState("");

  useEffect(() => {
    init();
    const id = window.setInterval(() => tick(), 250);
    return () => window.clearInterval(id);
  }, [init, tick]);

  const live = useMemo(
    () => witnesses.filter((w) => !countdown(w, now).free && !w.burned),
    [witnesses, now],
  );

  const active = witnesses.find((w) => w.id === selected) ?? witnesses[0];

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg text-fg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-primary text-primary-ink">
              <Activity size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-wide">Alpha Witness</p>
              <p className="num text-xs text-muted">@pandaforge/alpha-witness-mcp · v1.2.0</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Pill ok>Heat 4%</Pill>
            <Pill ok={!kill}>{kill ? "KILL ARMED" : "RAILS GREEN"}</Pill>
            <span className="num text-muted">{ready ? "LEDGER LIVE" : "SYNC"}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-12">
        <section className="lg:col-span-7">
          <Panel title="Witness feed" hint="DSSE commitments · 900s free preimage">
            <ul className="flex flex-col gap-2">
              {witnesses.map((w) => {
                const cd = countdown(w, now || w.observedAt);
                const on = active?.id === w.id;
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(w.id)}
                      className={`w-full rounded-md border px-3 py-3 text-left transition-colors ${
                        on ? "border-primary bg-raised" : "border-line bg-bg hover:bg-raised"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="num text-xs font-semibold text-primary">{w.id}</span>
                            <span className="rounded bg-line px-1.5 py-0.5 text-[10px] text-muted">
                              {w.vertical === "cloud_gpu_spot_arbitrage" ? "GPU SPOT" : "HW RESTOCK"}
                            </span>
                            {w.burned && <Pill>BURNED</Pill>}
                            {w.revealed && <Pill ok>REVEALED</Pill>}
                          </div>
                          <p className="num truncate text-xs text-fg">{w.sku}</p>
                          <p className="num text-[11px] text-muted">
                            ref ${ (w.refCents / 100).toFixed(2) } → obs ${ (w.obsCents / 100).toFixed(2) }
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="num text-sm font-semibold text-primary">+{bpsLabel(w.claimedBps)}</p>
                          <span
                            className={`num inline-block rounded px-1.5 py-0.5 text-[10px] ${
                              cd.free ? "bg-primary/20 text-primary" : "bg-line text-muted"
                            }`}
                          >
                            {cd.label}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted">
                        <span className="num">merkle: {short(w.merkle)}</span>
                        <span>·</span>
                        <span className="num">lock: {short(w.hashLock)}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <div className="mt-4">
            <Panel title="Event tape" hint="Local audit log">
              <div className="flex flex-col gap-1.5 text-xs">
                {log.length === 0 && <p className="text-muted">No events yet.</p>}
                {log.map((l) => (
                  <div key={l.id} className="flex items-baseline justify-between gap-2 border-b border-line/50 pb-1">
                    <span className="num text-[10px] text-muted">{new Date(l.ts).toISOString().slice(11, 19)}</span>
                    <span
                      className={`min-w-0 flex-1 text-right num ${
                        l.tone === "bad" ? "text-danger" : l.tone === "warn" ? "text-amber-300" : "text-fg"
                      }`}
                    >
                      {l.text}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </section>

        <section className="flex flex-col gap-4 lg:col-span-5">
          <Panel title="Selected commitment" hint={active ? active.id : "None"}>
            {active ? (
              <div className="flex flex-col gap-3 text-xs">
                <div>
                  <p className="num text-[11px] text-muted">Encrypted SKU / Promo payload</p>
                  <p className="num font-semibold text-fg">{active.sku}</p>
                  <p className="num text-muted">Promo token: {active.promo}</p>
                </div>

                <div className="rounded-md border border-line bg-raised p-2 text-[11px]">
                  <p className="text-muted">x402 unlock rails:</p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <Action
                      icon={<Zap size={14} />}
                      label="Tier 1 · Spot reveal ($0.25)"
                      onClick={() => setNote(unlockTier1(active.id))}
                    />
                    <Action
                      icon={<Radio size={14} />}
                      label={`Tier 2 · Priority stream ($4.50/hr · ${tier2Used}/25)`}
                      onClick={() => setNote(streamTick())}
                    />
                    <Action
                      icon={<Lock size={14} />}
                      label="Tier 3 · Exclusive burn ($25.00)"
                      danger
                      onClick={() => setNote(lockTier3(active.id))}
                    />
                    {!tier3Open && (
                      <button
                        type="button"
                        onClick={resetTier3}
                        className="rounded border border-line px-2 py-1 text-[11px] text-muted hover:text-fg"
                      >
                        Re-gate Tier 3 (simulate next epoch)
                      </button>
                    )}
                  </div>
                </div>

                <p className="num text-[11px] text-primary">{note}</p>
              </div>
            ) : (
              <p className="text-xs text-muted">No witness available.</p>
            )}
          </Panel>

          <Panel title="Tier 4 · Syndicate threshold co-buy" hint="Standby prototype">
            <div className="flex flex-col gap-2.5 text-xs">
              <p className="text-muted text-[11px]">
                3-buyer escrow. Secret remains locked until allocations sum to 100%.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Field
                  label="Buyer A"
                  value={shares[0]}
                  onChange={(n) => setShares(n, shares[1], shares[2])}
                />
                <Field
                  label="Buyer B"
                  value={shares[1]}
                  onChange={(n) => setShares(shares[0], n, shares[2])}
                />
                <Field
                  label="Buyer C"
                  value={shares[2]}
                  onChange={(n) => setShares(shares[0], shares[1], n)}
                />
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted">Total allocated:</span>
                <span className="num font-semibold text-fg">
                  {shares[0] + shares[1] + shares[2]}% / 100%
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={settleTier4}
                  className="flex-1 rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-ink hover:opacity-90"
                >
                  Settle pool
                </button>
                <button
                  type="button"
                  onClick={refundTier4}
                  className="rounded border border-line px-3 py-1.5 text-xs text-muted hover:text-fg"
                >
                  Simulate 70% timeout
                </button>
              </div>

              {tier4.phase === "filled" && (
                <div className="rounded border border-primary/40 bg-raised p-2 text-[11px] text-primary">
                  <p className="font-semibold">Threshold met · Preimage opened</p>
                  <p className="num truncate text-[10px]">{tier4.secret}</p>
                </div>
              )}
              {tier4.phase === "refunded" && (
                <p className="text-[11px] text-muted">Refunded to all buyers · Preimage destroyed.</p>
              )}
            </div>
          </Panel>

          <Panel title="Slash verifier" hint="10 USDC bond invariant">
            <div className="flex flex-col gap-2 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <Field label="Claim bps" value={claimed} onChange={setClaimed} />
                <Field label="Ref cents" value={refC} onChange={setRefC} />
                <Field label="Obs cents" value={obsC} onChange={setObsC} />
              </div>
              <button
                type="button"
                onClick={() => {
                  const r = runSlash(claimed, refC, obsC);
                  setSlashNote(
                    r.slashed
                      ? `SLASHED: actual ${bpsLabel(r.actual)} < claim ${bpsLabel(claimed)}. Bond drained.`
                      : `VALID: actual ${bpsLabel(r.actual)} >= claim ${bpsLabel(claimed)}. Bond safe.`,
                  );
                }}
                className="rounded border border-line bg-raised px-3 py-1.5 text-xs font-medium text-fg hover:border-primary"
              >
                Assert integer-cent predicate
              </button>
              <p className="num text-[11px] text-muted">{slashNote}</p>
            </div>
          </Panel>

          <Panel title="Governance & rails" hint="Day-1 constraints">
            <div className="flex flex-col gap-2 text-xs">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border border-line bg-surface p-2">
                  <p className="text-muted">Allow-list</p>
                  <p className="num font-semibold text-fg">2 domains locked</p>
                </div>
                <div className="rounded border border-line bg-surface p-2">
                  <p className="text-muted">Daily cap</p>
                  <p className="num font-semibold text-fg">{emittedToday} / 200 witnesses</p>
                </div>
                <div className="rounded border border-line bg-surface p-2">
                  <p className="text-muted">External agents</p>
                  <p className="num font-semibold text-fg">{agents} / 5 agents</p>
                </div>
                <div className="rounded border border-line bg-surface p-2">
                  <p className="text-muted">Witness bond</p>
                  <p className="num font-semibold text-fg">
                    {(bondUnits / 1_000_000).toFixed(2)} USDC / 10.00
                  </p>
                </div>
              </div>

              {kill && (
                <div className="rounded border border-danger/40 bg-danger-ink p-2 text-[11px] text-danger">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <ShieldAlert size={14} />
                    Auto-kill-switch armed
                  </div>
                  <p className="mt-1 text-[10px] text-fg">{killReason}</p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={replenish}
                      className="rounded border border-line bg-surface px-2 py-1 text-[10px] text-fg"
                    >
                      Step 1: Replenish bond to 10 USDC
                    </button>
                    <label className="flex items-center gap-2 text-[10px] text-fg">
                      <input
                        type="checkbox"
                        checked={signed}
                        onChange={(e) => setSigned(e.target.checked)}
                      />
                      Step 2: Sign operator Ed25519 re-arm key
                    </label>
                    <button
                      type="button"
                      onClick={() => setRearmNote(rearm(signed))}
                      className="rounded bg-primary px-2 py-1 text-[10px] font-semibold text-primary-ink"
                    >
                      Step 3: Execute re-arm
                    </button>
                    {rearmNote && <p className="num text-[10px] text-primary">{rearmNote}</p>}
                  </div>
                </div>
              )}

              {!kill && (
                <button
                  type="button"
                  onClick={tripSchema}
                  className="rounded border border-line px-2 py-1 text-[10px] text-muted hover:text-danger"
                >
                  Simulate selector drift (trip kill-switch)
                </button>
              )}
            </div>
          </Panel>
        </section>
      </main>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3.5">
      <div className="mb-2.5 flex items-baseline justify-between gap-2 border-b border-line pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-fg">{title}</h2>
        <span className="num text-[10px] text-muted">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Pill({ children, ok }: { children: ReactNode; ok?: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
        ok ? "bg-primary/20 text-primary" : "bg-danger/20 text-danger"
      }`}
    >
      {children}
    </span>
  );
}

function Action({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded border px-2.5 py-1.5 text-left text-xs transition-colors ${
        danger
          ? "border-danger/40 bg-danger-ink/40 text-danger hover:border-danger hover:bg-danger-ink"
          : "border-line bg-surface text-fg hover:border-primary hover:bg-raised"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="num min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-muted">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="num rounded border border-line bg-bg px-2 py-1 text-xs text-fg focus:border-primary focus:outline-none"
      />
    </label>
  );
}
