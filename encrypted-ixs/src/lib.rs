use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    // All price/size values use 6 decimal fixed-point.
    // collateral in lamports, prices in USD * 1e6, sizes in token * 1e6.

    pub struct Position {
        collateral:  u64,
        entry_price: u64,
        size:        u64,
        is_long:     u64,
    }

    pub struct LiqParams {
        mark_price:       u64,
        maint_margin_bps: u64,
    }

    pub struct CloseParams {
        exit_price: u64,
    }

    pub struct PnlResult {
        magnitude: u64,
        is_profit: u64,
    }

    // Takes a client-encrypted position and stores it under MXE-only encryption.
    // After this, no one outside the MXE cluster can read the position details.
    #[instruction]
    pub fn store_position_v5(params_ctxt: Enc<Shared, Position>) -> Enc<Mxe, Position> {
        let pos = params_ctxt.to_arcis();
        Mxe::get().from_arcis(pos)
    }

    // Checks whether the stored position is below its maintenance margin.
    // The caller (anyone — a liquidation bot, the protocol) provides current oracle params.
    // Only the boolean result is revealed; position size, entry price, collateral stay hidden.
    #[instruction]
    pub fn check_liquidation_v5(
        params_ctxt:   Enc<Shared, LiqParams>,
        position_ctxt: Enc<Mxe, Position>,
    ) -> bool {
        let p   = params_ctxt.to_arcis();
        let pos = position_ctxt.to_arcis();

        let notional = pos.size * p.mark_price / 1_000_000;

        let price_delta = if p.mark_price > pos.entry_price {
            p.mark_price - pos.entry_price
        } else {
            pos.entry_price - p.mark_price
        };

        let upnl_mag = price_delta * pos.size / 1_000_000;

        // xnor: long profits when price goes up, short profits when price goes down
        let is_long   = pos.is_long > 0u64;
        let price_up  = p.mark_price >= pos.entry_price;
        let in_profit = price_up == is_long;

        let equity = if in_profit {
            pos.collateral + upnl_mag
        } else if pos.collateral >= upnl_mag {
            pos.collateral - upnl_mag
        } else {
            0u64
        };

        let required = p.maint_margin_bps * notional / 10_000;

        (equity < required).reveal()
    }

    // Computes final PnL when the trader closes their position.
    // The result is encrypted back to the trader's shared key —
    // only the trader can decrypt the exact magnitude and direction.
    #[instruction]
    pub fn compute_pnl_v5(
        params_ctxt:   Enc<Shared, CloseParams>,
        position_ctxt: Enc<Mxe, Position>,
    ) -> Enc<Shared, PnlResult> {
        let p   = params_ctxt.to_arcis();
        let pos = position_ctxt.to_arcis();

        let is_long   = pos.is_long > 0u64;
        let price_up  = p.exit_price >= pos.entry_price;
        let in_profit = price_up == is_long;

        let long_delta  = if p.exit_price  >= pos.entry_price { p.exit_price  - pos.entry_price }
                          else                                  { pos.entry_price - p.exit_price  };
        let short_delta = if pos.entry_price >= p.exit_price  { pos.entry_price - p.exit_price  }
                          else                                  { p.exit_price  - pos.entry_price };

        let delta     = if is_long { long_delta } else { short_delta };
        let magnitude = delta * pos.size / 1_000_000;
        let is_profit: u64 = if in_profit { 1u64 } else { 0u64 };

        params_ctxt.owner.from_arcis(PnlResult { magnitude, is_profit })
    }
}
