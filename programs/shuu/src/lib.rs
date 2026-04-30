use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::CallbackAccount;

const COMP_DEF_OFFSET_STORE_POSITION:    u32 = comp_def_offset("store_position_v5");
const COMP_DEF_OFFSET_CHECK_LIQUIDATION: u32 = comp_def_offset("check_liquidation_v5");
const COMP_DEF_OFFSET_COMPUTE_PNL:       u32 = comp_def_offset("compute_pnl_v5");

const FAUCET_LIMIT:       u64 = 10_000 * 1_000_000;    // 10,000 sUSDC (6 decimals)
const INITIAL_LIQUIDITY:  u64 = 1_000_000 * 1_000_000; // 1M sUSDC seeded into vault

declare_id!("25dRQCUoUhKs4x93zh2p72fdPzvQFDGwcTM4dBrwGhcA");

#[arcium_program]
pub mod shuu {
    use super::*;

    // ─── initialize (once after deploy) ───────────────────────────────────

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.protocol_state.bump = ctx.bumps.protocol_state;

        let bump = ctx.bumps.protocol_state;
        let signer_seeds: &[&[&[u8]]] = &[&[b"protocol", &[bump]]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint:      ctx.accounts.usdc_mint.to_account_info(),
                    to:        ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.protocol_state.to_account_info(),
                },
                signer_seeds,
            ),
            INITIAL_LIQUIDITY,
        )?;

        Ok(())
    }

    // ─── faucet: mint up to 10,000 sUSDC to any wallet ────────────────────

    pub fn faucet_mint(ctx: Context<FaucetMint>, amount: u64) -> Result<()> {
        require!(amount > 0 && amount <= FAUCET_LIMIT, ErrorCode::FaucetLimitExceeded);

        let bump = ctx.accounts.protocol_state.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"protocol", &[bump]]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint:      ctx.accounts.usdc_mint.to_account_info(),
                    to:        ctx.accounts.user_ata.to_account_info(),
                    authority: ctx.accounts.protocol_state.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        Ok(())
    }

    // ─── deposit sUSDC → vault, credit usdc_balance ────────────────────────

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroAmount);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.user_ata.to_account_info(),
                    to:        ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        ctx.accounts.trader_acc.usdc_balance = ctx.accounts.trader_acc.usdc_balance
            .checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;

        Ok(())
    }

    // ─── withdraw free sUSDC from vault ────────────────────────────────────

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, ErrorCode::ZeroAmount);
        require!(amount <= ctx.accounts.trader_acc.usdc_balance, ErrorCode::InsufficientBalance);

        ctx.accounts.trader_acc.usdc_balance -= amount;

        let bump = ctx.accounts.protocol_state.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"protocol", &[bump]]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.vault.to_account_info(),
                    to:        ctx.accounts.user_ata.to_account_info(),
                    authority: ctx.accounts.protocol_state.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        Ok(())
    }

    // ─── settle PnL after off-chain decryption ─────────────────────────────
    // Trader decrypts magnitude + is_profit from PnlComputedEvent off-chain,
    // then calls this to update their on-chain balance before withdrawing.

    pub fn settle_position(
        ctx:       Context<SettlePosition>,
        magnitude: u64,
        is_profit: bool,
    ) -> Result<()> {
        require!(!ctx.accounts.trader_acc.is_open,       ErrorCode::PositionStillOpen);
        require!(!ctx.accounts.trader_acc.is_liquidated, ErrorCode::PositionLiquidated);
        require!(!ctx.accounts.trader_acc.is_settled,    ErrorCode::AlreadySettled);
        require!(
            ctx.accounts.payer.key() == ctx.accounts.trader_acc.trader,
            ErrorCode::WrongTrader
        );

        let locked = ctx.accounts.trader_acc.locked_collateral;
        let payout = if is_profit {
            locked.checked_add(magnitude).ok_or(ErrorCode::Overflow)?
        } else {
            locked.saturating_sub(magnitude)
        };

        ctx.accounts.trader_acc.usdc_balance = ctx.accounts.trader_acc.usdc_balance
            .checked_add(payout)
            .ok_or(ErrorCode::Overflow)?;
        ctx.accounts.trader_acc.locked_collateral = 0;
        ctx.accounts.trader_acc.is_settled = true;

        emit!(PositionSettledEvent {
            trader:    ctx.accounts.trader_acc.trader,
            payout,
            is_profit,
        });

        Ok(())
    }

    // ─── comp def inits (called once after deploy) ─────────────────────────

    pub fn init_store_position_comp_def(ctx: Context<InitStorePositionCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_check_liquidation_comp_def(ctx: Context<InitCheckLiquidationCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    pub fn init_compute_pnl_comp_def(ctx: Context<InitComputePnlCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    // ─── open position ─────────────────────────────────────────────────────

    pub fn open_position(
        ctx:               Context<OpenPosition>,
        computation_offset: u64,
        collateral_ct:     [u8; 32],
        entry_price_ct:    [u8; 32],
        size_ct:           [u8; 32],
        is_long_ct:        [u8; 32],
        pub_key:           [u8; 32],
        nonce:             u128,
        collateral_amount: u64,
    ) -> Result<()> {
        require!(
            collateral_amount > 0 && collateral_amount <= ctx.accounts.trader_acc.usdc_balance,
            ErrorCode::InsufficientBalance
        );

        ctx.accounts.trader_acc.trader            = ctx.accounts.payer.key();
        ctx.accounts.trader_acc.bump              = ctx.bumps.trader_acc;
        ctx.accounts.trader_acc.usdc_balance     -= collateral_amount;
        ctx.accounts.trader_acc.locked_collateral = collateral_amount;
        ctx.accounts.trader_acc.is_settled        = false;
        ctx.accounts.trader_acc.is_liquidated     = false;

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(nonce)
            .encrypted_u64(collateral_ct)
            .encrypted_u64(entry_price_ct)
            .encrypted_u64(size_ct)
            .encrypted_u64(is_long_ct)
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![StorePositionV5Callback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey:      ctx.accounts.trader_acc.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "store_position_v5")]
    pub fn store_position_v5_callback(
        ctx:    Context<StorePositionV5Callback>,
        output: SignedComputationOutputs<StorePositionV5Output>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(StorePositionV5Output { field_0 }) => field_0,
            Err(e) => return Err(e),
        };

        ctx.accounts.trader_acc.position_state = o.ciphertexts;
        ctx.accounts.trader_acc.nonce          = o.nonce;
        ctx.accounts.trader_acc.is_open        = true;

        emit!(PositionOpenedEvent {
            trader: ctx.accounts.trader_acc.trader,
        });

        Ok(())
    }

    // ─── liquidation check ─────────────────────────────────────────────────

    pub fn check_liquidation(
        ctx:               Context<CheckLiquidation>,
        computation_offset: u64,
        mark_price_ct:     [u8; 32],
        margin_bps_ct:     [u8; 32],
        pub_key:           [u8; 32],
        params_nonce:      u128,
    ) -> Result<()> {
        require!(ctx.accounts.trader_acc.is_open,        ErrorCode::NoOpenPosition);
        require!(!ctx.accounts.trader_acc.is_liquidated, ErrorCode::PositionLiquidated);

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(params_nonce)
            .encrypted_u64(mark_price_ct)
            .encrypted_u64(margin_bps_ct)
            .plaintext_u128(ctx.accounts.trader_acc.nonce)
            .account(
                ctx.accounts.trader_acc.key(),
                8 + 1,
                32 * 4,
            )
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![CheckLiquidationV5Callback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey:      ctx.accounts.trader_acc.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "check_liquidation_v5")]
    pub fn check_liquidation_v5_callback(
        ctx:    Context<CheckLiquidationV5Callback>,
        output: SignedComputationOutputs<CheckLiquidationV5Output>,
    ) -> Result<()> {
        let should_liquidate = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(CheckLiquidationV5Output { field_0 }) => field_0,
            Err(e) => return Err(e),
        };

        if should_liquidate {
            ctx.accounts.trader_acc.is_open       = false;
            ctx.accounts.trader_acc.is_liquidated = true;
            // locked_collateral forfeit on liquidation; vault retains it
        }

        emit!(LiquidationCheckedEvent {
            trader:         ctx.accounts.trader_acc.trader,
            was_liquidated: should_liquidate,
        });

        Ok(())
    }

    // ─── compute pnl / close position ──────────────────────────────────────

    pub fn compute_pnl(
        ctx:               Context<ComputePnl>,
        computation_offset: u64,
        exit_price_ct:     [u8; 32],
        pub_key:           [u8; 32],
        params_nonce:      u128,
    ) -> Result<()> {
        require!(ctx.accounts.trader_acc.is_open,        ErrorCode::NoOpenPosition);
        require!(!ctx.accounts.trader_acc.is_liquidated, ErrorCode::PositionLiquidated);
        require!(
            ctx.accounts.payer.key() == ctx.accounts.trader_acc.trader,
            ErrorCode::WrongTrader
        );

        let args = ArgBuilder::new()
            .x25519_pubkey(pub_key)
            .plaintext_u128(params_nonce)
            .encrypted_u64(exit_price_ct)
            .plaintext_u128(ctx.accounts.trader_acc.nonce)
            .account(
                ctx.accounts.trader_acc.key(),
                8 + 1,
                32 * 4,
            )
            .build();

        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            vec![ComputePnlV5Callback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[CallbackAccount {
                    pubkey:      ctx.accounts.trader_acc.key(),
                    is_writable: true,
                }],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    #[arcium_callback(encrypted_ix = "compute_pnl_v5")]
    pub fn compute_pnl_v5_callback(
        ctx:    Context<ComputePnlV5Callback>,
        output: SignedComputationOutputs<ComputePnlV5Output>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(ComputePnlV5Output { field_0 }) => field_0,
            Err(e) => return Err(e),
        };

        ctx.accounts.trader_acc.is_open = false;

        emit!(PnlComputedEvent {
            trader:       ctx.accounts.trader_acc.trader,
            magnitude_ct: o.ciphertexts[0],
            is_profit_ct: o.ciphertexts[1],
            result_nonce: o.nonce,
        });

        Ok(())
    }
}

// ─── account structs ──────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct ProtocolState {
    pub bump: u8,
}

// position_state must remain at offset 8+1=9 (discriminator + bump) for
// the ArgBuilder.account() offset used in check_liquidation / compute_pnl.
#[account]
#[derive(InitSpace)]
pub struct TraderAccount {
    pub bump:              u8,
    pub position_state:    [[u8; 32]; 4],
    pub nonce:             u128,
    pub trader:            Pubkey,
    pub is_open:           bool,
    pub is_liquidated:     bool,
    pub usdc_balance:      u64,
    pub locked_collateral: u64,
    pub is_settled:        bool,
}

// ─── Initialize ───────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + ProtocolState::INIT_SPACE,
        seeds = [b"protocol"],
        bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    #[account(
        init,
        payer = payer,
        mint::decimals = 6,
        mint::authority = protocol_state,
        seeds = [b"usdc_mint"],
        bump,
    )]
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = payer,
        token::mint = usdc_mint,
        token::authority = protocol_state,
        seeds = [b"vault"],
        bump,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ─── FaucetMint ───────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct FaucetMint<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol_state.bump)]
    pub protocol_state: Account<'info, ProtocolState>,
    #[account(mut, seeds = [b"usdc_mint"], bump)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = usdc_mint,
        associated_token::authority = user,
    )]
    pub user_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ─── Deposit ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = user,
    )]
    pub user_ata: Account<'info, TokenAccount>,
    #[account(seeds = [b"usdc_mint"], bump)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + TraderAccount::INIT_SPACE,
        seeds = [b"trader", user.key().as_ref()],
        bump,
    )]
    pub trader_acc: Account<'info, TraderAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ─── Withdraw ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [b"protocol"], bump = protocol_state.bump)]
    pub protocol_state: Account<'info, ProtocolState>,
    #[account(seeds = [b"usdc_mint"], bump)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = usdc_mint,
        associated_token::authority = user,
    )]
    pub user_ata: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"trader", user.key().as_ref()],
        bump = trader_acc.bump,
    )]
    pub trader_acc: Account<'info, TraderAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

// ─── SettlePosition ───────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SettlePosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"trader", payer.key().as_ref()],
        bump = trader_acc.bump,
    )]
    pub trader_acc: Account<'info, TraderAccount>,
}

// ─── OpenPosition ─────────────────────────────────────────────────────────────

#[queue_computation_accounts("store_position_v5", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: checked by arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: checked by arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: checked by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_STORE_POSITION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + TraderAccount::INIT_SPACE,
        seeds = [b"trader", payer.key().as_ref()],
        bump,
    )]
    pub trader_acc: Account<'info, TraderAccount>,
}

#[callback_accounts("store_position_v5")]
#[derive(Accounts)]
pub struct StorePositionV5Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_STORE_POSITION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: checked by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub trader_acc: Account<'info, TraderAccount>,
}

#[init_computation_definition_accounts("store_position_v5", payer)]
#[derive(Accounts)]
pub struct InitStorePositionCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: not initialized yet
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address lookup table
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ─── CheckLiquidation accounts ────────────────────────────────────────────────

#[queue_computation_accounts("check_liquidation_v5", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CheckLiquidation<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: checked by arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: checked by arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: checked by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CHECK_LIQUIDATION))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    /// CHECK: the trader whose position we're checking
    pub trader: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"trader", trader.key().as_ref()],
        bump = trader_acc.bump,
    )]
    pub trader_acc: Box<Account<'info, TraderAccount>>,
}

#[callback_accounts("check_liquidation_v5")]
#[derive(Accounts)]
pub struct CheckLiquidationV5Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_CHECK_LIQUIDATION))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: checked by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub trader_acc: Account<'info, TraderAccount>,
}

#[init_computation_definition_accounts("check_liquidation_v5", payer)]
#[derive(Accounts)]
pub struct InitCheckLiquidationCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: not initialized yet
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address lookup table
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ─── ComputePnl accounts ──────────────────────────────────────────────────────

#[queue_computation_accounts("compute_pnl_v5", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct ComputePnl<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: checked by arcium program
    pub mempool_account: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: checked by arcium program
    pub executing_pool: UncheckedAccount<'info>,
    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: checked by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_PNL))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(
        mut,
        seeds = [b"trader", payer.key().as_ref()],
        bump = trader_acc.bump,
    )]
    pub trader_acc: Box<Account<'info, TraderAccount>>,
}

#[callback_accounts("compute_pnl_v5")]
#[derive(Accounts)]
pub struct ComputePnlV5Callback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_COMPUTE_PNL))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: checked by arcium program
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions sysvar
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub trader_acc: Account<'info, TraderAccount>,
}

#[init_computation_definition_accounts("compute_pnl_v5", payer)]
#[derive(Accounts)]
pub struct InitComputePnlCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: not initialized yet
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address lookup table
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut program
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

// ─── errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum ErrorCode {
    #[msg("no open position for this trader")]
    NoOpenPosition,
    #[msg("position has been liquidated")]
    PositionLiquidated,
    #[msg("only the position owner can close it")]
    WrongTrader,
    #[msg("mpc computation was aborted")]
    AbortedComputation,
    #[msg("cluster not set on mxe account")]
    ClusterNotSet,
    #[msg("position is still open")]
    PositionStillOpen,
    #[msg("position already settled")]
    AlreadySettled,
    #[msg("insufficient sUSDC balance")]
    InsufficientBalance,
    #[msg("faucet limit is 10,000 sUSDC per call")]
    FaucetLimitExceeded,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("amount must be greater than zero")]
    ZeroAmount,
}

// ─── events ───────────────────────────────────────────────────────────────────

#[event]
pub struct PositionOpenedEvent {
    pub trader: Pubkey,
}

#[event]
pub struct LiquidationCheckedEvent {
    pub trader:         Pubkey,
    pub was_liquidated: bool,
}

#[event]
pub struct PnlComputedEvent {
    pub trader:       Pubkey,
    pub magnitude_ct: [u8; 32],
    pub is_profit_ct: [u8; 32],
    pub result_nonce: u128,
}

#[event]
pub struct PositionSettledEvent {
    pub trader:    Pubkey,
    pub payout:    u64,
    pub is_profit: bool,
}
