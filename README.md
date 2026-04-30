# shuu

A private perpetuals DEX on Solana, built on Arcium.

Trade with leverage where your entry price, size, direction and collateral never appear on chain in plaintext. The only public output of a position is whether it got liquidated. Everything else is encrypted before it leaves your browser and stays encrypted while the Arcium MPC cluster computes on it.

I built this because every perp DEX I've used is a glass house. Bots front-run any sized fill, copy whale entries within seconds, and grief liquidations a tick away from your stop. None of those attacks need permission — they just need the data, and on every other DEX, the data is on chain in cleartext. shuu fixes that at the computation layer instead of behind delays or relayers.

- **Live program** [`25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA`](https://explorer.solana.com/address/25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA?cluster=devnet) on Solana devnet
- **Frontend** running at the URL in the submission
- **Independent verification:** clone the repo and run `node scripts/verify-onchain.js`. Every privacy claim in this README is checked against live devnet state.

## How it works

The whole thing rests on three Arcis circuits that compute on encrypted state:

```rust
// store_position_v5
// Trader encrypts {collateral, entry_price, size, is_long} to the MXE
// using x25519 + RescueCipher in the browser.
// The circuit re-encrypts under the MXE's own key so the position is sealed
// to the cluster only.
pub fn store_position_v5(p: Enc<Shared, Position>) -> Enc<Mxe, Position> {
    Mxe::get().from_arcis(p.to_arcis())
}

// check_liquidation_v5
// Anyone (a liquidation bot, the protocol) can call this with a fresh oracle price.
// The MXE decrypts the position internally, computes equity vs maintenance margin,
// and returns ONLY a bool.  Equity, leverage, direction stay hidden.
pub fn check_liquidation_v5(
    params: Enc<Shared, LiqParams>,
    pos:    Enc<Mxe, Position>,
) -> bool {
    let p   = params.to_arcis();
    let pos = pos.to_arcis();
    let notional = pos.size * p.mark_price / 1_000_000;
    let delta    = if p.mark_price >= pos.entry_price
                   { p.mark_price - pos.entry_price }
                   else { pos.entry_price - p.mark_price };
    let upnl     = delta * pos.size / 1_000_000;
    let in_profit = (p.mark_price >= pos.entry_price) == (pos.is_long > 0);
    let equity   = if in_profit { pos.collateral + upnl }
                   else if pos.collateral >= upnl { pos.collateral - upnl }
                   else { 0 };
    (equity < p.maint_margin_bps * notional / 10_000).reveal()
}

// compute_pnl_v5
// On close, the MXE computes realised PnL and encrypts the result back to the
// trader's key.  Only the trader can decrypt it.  Settlement on chain happens
// against the decrypted magnitude, but the chain itself never sees it cleartext.
pub fn compute_pnl_v5(
    params: Enc<Shared, CloseParams>,
    pos:    Enc<Mxe, Position>,
) -> Enc<Shared, PnlResult> { /* ... */ }
```

What ends up on chain:

| Stage | Public on chain | Hidden by MPC |
|---|---|---|
| Open | nothing identifying about the trade | collateral, entry, size, direction |
| Liquidation check | a single bool | mark, equity, the position itself |
| Close | encrypted ciphertext + nonce | exit price, PnL magnitude, direction |
| Settle | the USDC balance change | what produced it |

The MXE cluster runs threshold MPC. No single node — and no observer — can reconstruct the position. Threshold > honest majority is the trust assumption.

## Verification

Don't trust this README. The repo includes a script that reads live devnet state and verifies every claim:

```bash
WALLET=<your-phantom-pubkey> node scripts/verify-onchain.js
```

Output looks like:

```
✓ Program is deployed and executable
✓ MXE account owned by Arcium program (Arcj82pX...)
✓ store_position_v5    1,019,280 bytes — on-chain ↔ local match
✓ check_liquidation_v5 2,691,764 bytes — on-chain ↔ local match
✓ compute_pnl_v5       1,560,235 bytes — on-chain ↔ local match
✓ Position fields stored as ciphertext (no plaintext entry/size/direction)
✓ 6 of last 12 txs invoked the Arcium program
✓ PnL fields emitted as 32-byte ciphertext — only the trader can decrypt
```

It also dumps the actual ciphertext bytes from your `TraderAccount` so you can see them with your own eyes.

## Repo layout

```
encrypted-ixs/      Arcis circuits (Rust)
programs/shuu/      Solana program — Anchor instructions, MPC callbacks, state machine
app/                React + Vite frontend (Phantom wallet adapter)
scripts/            Devnet deploy helpers + the e2e test
patches/            Two patches to @arcium-hq/client, applied automatically on yarn install
```

## Run it locally

You'll need Rust, Solana CLI 2.3+, Anchor 0.32.1, yarn and Docker. Then:

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://install.arcium.com/ | bash
arcup install

git clone https://github.com/<this-repo>/shuu
cd shuu
yarn install         # postinstall applies our SDK patches
```

To run the frontend against the live devnet program (no SOL needed):

```bash
cd app
cp .env.example .env       # paste a Helius or QuickNode devnet URL into VITE_RPC_URL
yarn install
yarn dev
```

Open `http://localhost:5173`, connect Phantom on devnet, mint sUSDC, deposit, open a position. While the position is open, look at your `TraderAccount` on Solana Explorer. The position fields are 32-byte ciphertext.

To run the full end-to-end test (encrypts → opens → checks liquidation → encrypts an exit → decrypts PnL → settles, all live on devnet):

```bash
ARCIUM_CLUSTER_OFFSET=456 \
ANCHOR_PROVIDER_URL=<your-helius-devnet-url> \
ANCHOR_WALLET=$HOME/.config/solana/id.json \
npx ts-node -P tsconfig.json scripts/test-e2e.ts
```

To deploy your own copy:

```bash
arcium build
arcium deploy --cluster-offset 456 --recovery-set-size 4 \
  --keypair-path ~/.config/solana/id.json --rpc-url devnet
node scripts/init-comp-defs.mjs
RPC_URL=<your-helius-devnet-url> node scripts/upload-circuits.mjs
node scripts/finalize-circuits.mjs
```

The circuit upload step is the expensive one. Each Arcis binary is 1–3 MB and Solana rent on a 200KB-per-tx resize is real. Budget around 30 SOL for a clean fresh deploy on devnet. Helius free tier handles the upload at `chunkSize=15`.

## SDK patches

While building this I hit two real bugs in `@arcium-hq/client@0.9.6`:

1. `uploadCircuit` would skip uploading raw circuit data if the on-chain account already had the right *size* — but a partially-uploaded account also has the right size. Combined with `finalizeComputationDefinition` not validating data integrity, a single upload failure left a finalized comp def with mostly-zero bytes that the MXE then aborted on every computation.

2. The resize loop wasn't idempotent. Re-running an upload that had completed its resize phase before erroring would re-grow already-correctly-sized accounts past their target.

Both are patched in `patches/@arcium-hq+client+0.9.6.patch` and applied automatically by `patch-package` on `yarn install`. I also lowered the default `chunkSize` from 500 to 15 so free-tier RPCs can keep up with the upload pace. These are filed upstream.

## Stack

- Encryption: x25519 ECDH + RescueCipher (255-bit field, BabyJubJub-style prime)
- MPC: Arcium 0.9.6 — Arcis circuits, threshold MXE
- Solana program: Anchor 0.32.1
- Frontend: React 18, Vite 5, Solana wallet adapter, framer-motion
- USDC: protocol-minted SPL token with rent-exempt vault

## License

MIT.
