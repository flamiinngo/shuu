import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

export function useBalance() {
  const { connection }    = useConnection();
  const { publicKey }     = useWallet();
  const [sol, setSol]     = useState<number | null>(null);
  const [loading, setLd]  = useState(false);

  useEffect(() => {
    if (!publicKey) { setSol(null); return; }
    let cancelled = false;

    async function fetch() {
      setLd(true);
      try {
        const lamports = await connection.getBalance(publicKey!);
        if (!cancelled) setSol(lamports / 1e9);
      } catch {
        if (!cancelled) setSol(null);
      } finally {
        if (!cancelled) setLd(false);
      }
    }

    fetch();
    // Refresh every 15s
    const id = setInterval(fetch, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [publicKey, connection]);

  return { sol, loading };
}
