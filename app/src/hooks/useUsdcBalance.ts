import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

// Devnet demo: each wallet gets a persistent virtual USDC balance stored in
// localStorage, seeded at 10,000 USDC on first connect.
// On a production deployment this would be replaced by a real SPL token
// account balance read via connection.getTokenAccountBalance().

const SEED_BALANCE = 10_000;

function storageKey(pk: string) {
  return `shuu_usdc_${pk}`;
}

export function useUsdcBalance(usedCollateral = 0) {
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) { setBalance(null); return; }
    const key = storageKey(publicKey.toBase58());
    const stored = localStorage.getItem(key);
    const total = stored !== null ? parseFloat(stored) : SEED_BALANCE;
    if (stored === null) localStorage.setItem(key, String(SEED_BALANCE));
    setBalance(total);
  }, [publicKey]);

  const available = balance !== null ? Math.max(balance - usedCollateral, 0) : null;

  return { total: balance, available };
}
