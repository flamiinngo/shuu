import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export interface HistoryEntry {
  ts:           number;             // unix ms when settled
  market:       string;             // e.g. "BTC-PERP"
  side:         "long" | "short";
  collateral:   number;             // USDC
  entryPrice:   number;             // USD
  exitPrice:    number;             // USD
  pnl:          number;             // signed magnitude (positive = profit)
  isProfit:     boolean;
  txSig:        string;             // settle tx signature
}

const HISTORY_EVENT = "shuu:history-changed";
const MAX_ENTRIES   = 100;

const key = (pubkey: string) => `shuu_history_${pubkey}`;

/** Read recent settled trades for the connected wallet. Reactive: re-renders
 *  when addHistoryEntry() is called from anywhere in the app. */
export function useHistory(): HistoryEntry[] {
  const { publicKey } = useWallet();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!publicKey) { setEntries([]); return; }
    const k = key(publicKey.toBase58());

    function load() {
      try {
        const raw = localStorage.getItem(k);
        setEntries(raw ? JSON.parse(raw) : []);
      } catch {
        setEntries([]);
      }
    }
    load();

    function onChange() { load(); }
    window.addEventListener(HISTORY_EVENT, onChange);
    return () => window.removeEventListener(HISTORY_EVENT, onChange);
  }, [publicKey]);

  return entries;
}

/** Append a new entry to history for a given wallet. Trims to last MAX_ENTRIES. */
export function addHistoryEntry(walletPubkey: string, entry: HistoryEntry) {
  try {
    const k = key(walletPubkey);
    const raw = localStorage.getItem(k);
    const list: HistoryEntry[] = raw ? JSON.parse(raw) : [];
    const next = [entry, ...list].slice(0, MAX_ENTRIES);
    localStorage.setItem(k, JSON.stringify(next));
    window.dispatchEvent(new Event(HISTORY_EVENT));
  } catch (e) {
    console.warn("history write failed:", (e as Error).message);
  }
}

/** Clear all history for a wallet. Used by a hypothetical "clear history" button. */
export function clearHistory(walletPubkey: string) {
  try {
    localStorage.removeItem(key(walletPubkey));
    window.dispatchEvent(new Event(HISTORY_EVENT));
  } catch {}
}
