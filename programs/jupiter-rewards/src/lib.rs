use anchor_lang::prelude::*;
use anchor_spl::{
    token::{TokenAccount, Mint},
    token_2022,
};
use solana_program::{
    program::invoke,
    system_instruction,
};
use spl_token_2022::extension::transfer_fee::instruction as transfer_fee_ix;

declare_id!("BxT5WsUYEDAfiJ9zHZ6U5oDBZZA5AUMXS41mg1KRv78q");

#[program]
pub mod jupiter_rewards {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        tax_rate: u16,
        reward_interval: i64,
    ) -> Result<()> {
        require!(tax_rate <= 1000, JupiterRewardsError::InvalidTaxRate);
        require!(reward_interval >= 60, JupiterRewardsError::InvalidRewardInterval);
        
        let state = &mut ctx.accounts.state;
        state.authority = ctx.accounts.authority.key();
        state.tax_rate = tax_rate;
        state.last_distribution = Clock::get()?.unix_timestamp;
        state.reward_interval_minutes = (reward_interval / 60) as u8;
        
        state.jupiter_mint = ctx.accounts.jupiter_mint.key();
        state.tax_vault = ctx.accounts.tax_vault.key();
        state.reward_vault = ctx.accounts.reward_vault.key();
        
        Ok(())
    }

    pub fn create_jupiter_token(
        ctx: Context<CreateJupiterToken>,
        decimals: u8,
    ) -> Result<()> {
        token_2022::initialize_mint(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::InitializeMint {
                    mint: ctx.accounts.jupiter_mint.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            decimals,
            &ctx.accounts.authority.key(),
            Some(&ctx.accounts.authority.key()),
        )?;
        
        // Initialize transfer fee config (5% fee)
        let transfer_fee_basis_points = 500;
        let maximum_fee = 50_000_000;
        
        invoke(
            &transfer_fee_ix::initialize_transfer_fee_config(
                &token_2022::ID,
                &ctx.accounts.jupiter_mint.key(),
                Some(&ctx.accounts.authority.key()),
                Some(&ctx.accounts.authority.key()),
                transfer_fee_basis_points,
                maximum_fee,
            )?,
            &[
                ctx.accounts.jupiter_mint.to_account_info(),
                ctx.accounts.authority.to_account_info(),
            ],
        )?;
        
        Ok(())
    }

    pub fn collect_tax(ctx: Context<CollectTax>) -> Result<()> {
        invoke(
            &transfer_fee_ix::withdraw_withheld_tokens_from_mint(
                &token_2022::ID,
                &ctx.accounts.jupiter_mint.key(),
                &ctx.accounts.tax_vault.key(),
                &ctx.accounts.authority.key(),
                &[&ctx.accounts.authority.key()],
            )?,
            &[
                ctx.accounts.jupiter_mint.to_account_info(),
                ctx.accounts.tax_vault.to_account_info(),
                ctx.accounts.authority.to_account_info(),
            ],
        )?;
        
        Ok(())
    }

    pub fn swap_sol_for_jupiter(
        ctx: Context<SwapSolForJupiter>,
        amount: u64,
        min_output_amount: u64,
    ) -> Result<()> {
        invoke(
            &system_instruction::transfer(
                &ctx.accounts.user.key(),
                &ctx.accounts.recipient.key(),
                amount,
            ),
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.recipient.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        let mint_authority_seeds = &[b"mint_authority".as_ref(), &[*ctx.bumps.get("mint_authority").unwrap()]];
        let mint_authority_signer = &[&mint_authority_seeds[..]];
        
        token_2022::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::MintTo {
                    mint: ctx.accounts.jupiter_mint.to_account_info(),
                    to: ctx.accounts.reward_vault.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                mint_authority_signer,
            ),
            min_output_amount,
        )?;
        
        Ok(())
    }

    pub fn distribute_rewards(ctx: Context<DistributeRewards>) -> Result<()> {
        let current_time = Clock::get()?.unix_timestamp;
        let last_distribution = ctx.accounts.state.last_distribution;
        let reward_interval = ctx.accounts.state.reward_interval_minutes as i64 * 60;
        let time_since_last = current_time - last_distribution;
        
        require!(
            time_since_last >= reward_interval,
            JupiterRewardsError::TooEarlyForDistribution
        );
        
        let reward_amount = ctx.accounts.reward_vault.amount;
        require!(reward_amount > 0, JupiterRewardsError::NoRewardsToDistribute);
        require!(ctx.accounts.jupiter_vault.amount > 0, JupiterRewardsError::NoEligibleHolders);
        
        let total_supply = ctx.accounts.jupiter_mint_info.supply;
        let recipient_balance = ctx.accounts.recipient.amount;
        
        // Calculate reward share using integer math to avoid floating point
        let reward_share = (recipient_balance as u128)
            .checked_mul(reward_amount as u128)
            .unwrap_or(0)
            .checked_div(total_supply as u128)
            .unwrap_or(0) as u64;
        
        if reward_share > 0 {
            let state_bump = *ctx.bumps.get("state").unwrap();
            let seeds = &[b"state".as_ref(), &[state_bump]];
            let signer = &[&seeds[..]];
            
            token_2022::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    token_2022::TransferChecked {
                        from: ctx.accounts.reward_vault.to_account_info(),
                        mint: ctx.accounts.jupiter_mint.to_account_info(),
                        to: ctx.accounts.recipient.to_account_info(),
                        authority: ctx.accounts.state.to_account_info(),
                    },
                    signer,
                ),
                reward_share,
                ctx.accounts.jupiter_mint_info.decimals,
            )?;
        }
        
        // Update the last distribution time after the transfer
        ctx.accounts.state.last_distribution = current_time;
        Ok(())
    }

    pub fn force_update_last_distribution(
        ctx: Context<ForceUpdateLastDistribution>,
        new_timestamp: i64,
    ) -> Result<()> {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.state.authority,
            JupiterRewardsError::Unauthorized
        );
        
        ctx.accounts.state.last_distribution = new_timestamp;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + StateAccount::LEN,
        seeds = [b"state"],
        bump
    )]
    pub state: Account<'info, StateAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: This is the Jupiter token mint (Token-2022)
    pub jupiter_mint: AccountInfo<'info>,
    
    #[account(
        mut,
        token::mint = jupiter_mint,
        token::authority = state,
    )]
    pub tax_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = jupiter_mint,
        token::authority = state,
    )]
    pub reward_vault: Account<'info, TokenAccount>,
    
    /// CHECK: Token program (Token-2022)
    #[account(address = token_2022::ID)]
    pub token_program: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreateJupiterToken<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, StateAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: This is the Jupiter token mint
    #[account(mut)]
    pub jupiter_mint: AccountInfo<'info>,
    
    /// CHECK: Token program (Token-2022)
    #[account(address = token_2022::ID)]
    pub token_program: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CollectTax<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, StateAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    /// CHECK: Jupiter token mint (Token-2022)
    #[account(mut)]
    pub jupiter_mint: AccountInfo<'info>,
    
    #[account(
        mut,
        token::mint = jupiter_mint,
        token::authority = state,
    )]
    pub tax_vault: Account<'info, TokenAccount>,
    
    /// CHECK: Token program (Token-2022)
    #[account(address = token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SwapSolForJupiter<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, StateAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: This is the recipient of the SOL
    #[account(mut)]
    pub recipient: AccountInfo<'info>,
    
    /// CHECK: This is the mint of the Jupiter token (Token-2022)
    #[account(mut)]
    pub jupiter_mint: AccountInfo<'info>,
    
    #[account(
        mut,
        token::mint = jupiter_mint,
        token::authority = state,
    )]
    pub reward_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is a PDA that has authority to mint tokens
    #[account(seeds = [b"mint_authority"], bump)]
    pub mint_authority: AccountInfo<'info>,
    
    /// CHECK: Token program (Token-2022)
    #[account(address = token_2022::ID)]
    pub token_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, StateAccount>,
    
    #[account(
        mut,
        token::mint = jupiter_mint,
        token::authority = state,
    )]
    pub reward_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = jupiter_mint,
    )]
    pub recipient: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = jupiter_mint,
    )]
    pub jupiter_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is the mint of the Jupiter token (Token-2022)
    pub jupiter_mint: AccountInfo<'info>,
    
    /// CHECK: This provides information about the mint
    pub jupiter_mint_info: Account<'info, Mint>,
    
    /// CHECK: Token program (Token-2022)
    #[account(address = token_2022::ID)]
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ForceUpdateLastDistribution<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, StateAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[error_code]
pub enum JupiterRewardsError {
    #[msg("Invalid tax rate. Must be <= 1000 (10%)")]
    InvalidTaxRate,
    
    #[msg("Invalid reward interval. Must be >= 60 seconds")]
    InvalidRewardInterval,
    
    #[msg("Too early for distribution. Wait until the reward interval has passed")]
    TooEarlyForDistribution,
    
    #[msg("No rewards to distribute")]
    NoRewardsToDistribute,
    
    #[msg("No eligible holders")]
    NoEligibleHolders,
    
    #[msg("Unauthorized")]
    Unauthorized,
}

#[account]
pub struct StateAccount {
    pub authority: Pubkey,
    pub tax_rate: u16,
    pub last_distribution: i64,
    pub reward_interval_minutes: u8,
    pub jupiter_mint: Pubkey,
    pub tax_vault: Pubkey,
    pub reward_vault: Pubkey,
}

impl StateAccount {
    pub const LEN: usize = 32 + 2 + 8 + 1 + 32 + 32 + 32;
} 