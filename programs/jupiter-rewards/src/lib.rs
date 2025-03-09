use anchor_lang::prelude::*;
use anchor_spl::token::{self, TokenAccount, transfer, mint_to, Mint};
use solana_program::{
    program::invoke,
    system_instruction,
};

// Token Program ID for Token-2022: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
declare_id!("BxT5WsUYEDAfiJ9zHZ6U5oDBZZA5AUMXS41mg1KRv78q");

#[program]
pub mod jupiter_rewards {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        tax_rate: u16,
        reward_interval: i64,
    ) -> Result<()> {
        // Validate inputs
        require!(
            tax_rate <= 1000, // Max 10%
            JupiterRewardsError::InvalidTaxRate
        );
        
        require!(
            reward_interval >= 60, // Min 1 minute
            JupiterRewardsError::InvalidRewardInterval
        );
        
        let state = &mut ctx.accounts.state;
        state.authority = ctx.accounts.authority.key();
        state.tax_rate = tax_rate;
        state.last_distribution = Clock::get()?.unix_timestamp;
        state.reward_interval_minutes = (reward_interval / 60) as u8; // Convert seconds to minutes
        
        // Set the Jupiter mint, tax vault, and reward vault
        state.jupiter_mint = ctx.accounts.jupiter_mint.key();
        state.tax_vault = ctx.accounts.tax_vault.key();
        state.reward_vault = ctx.accounts.reward_vault.key();
        
        msg!("Jupiter rewards system initialized");
        Ok(())
    }

    pub fn collect_tax(ctx: Context<CollectTax>) -> Result<()> {
        // This function is called to collect tax from transactions
        // Since we're not using Token-2022 transfer fees, we'll implement manual tax collection
        
        // Calculate tax amount (5% of the transaction amount)
        let transaction_amount = ctx.accounts.user_token_account.amount;
        let tax_rate = ctx.accounts.state.tax_rate;
        let tax_amount = (transaction_amount * tax_rate as u64) / 10000;
        
        // Check if there are tokens to tax
        if tax_amount == 0 {
            msg!("No tokens to tax");
            return Ok(());
        }
        
        // Transfer the tax from the user's account to the tax vault
        transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.tax_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            tax_amount,
        )?;
        
        msg!("Tax collected: {} tokens", tax_amount);
        Ok(())
    }

    pub fn swap_sol_for_jupiter(
        ctx: Context<SwapSolForJupiter>,
        amount: u64,
        min_output_amount: u64,
    ) -> Result<()> {
        // Transfer SOL from user to the recipient (Jupiter swap program in real implementation)
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

        // Mint new Jupiter tokens to the reward vault (simulating a swap)
        // In a real implementation, this would be a transfer from a Jupiter pool
        let mint_authority_seeds = &[b"mint_authority".as_ref(), &[*ctx.bumps.get("mint_authority").unwrap()]];
        let mint_authority_signer = &[&mint_authority_seeds[..]];

        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.jupiter_mint.to_account_info(),
                    to: ctx.accounts.reward_vault.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                mint_authority_signer,
            ),
            min_output_amount,
        )?;

        msg!("Swapped {} SOL for {} Jupiter tokens", amount, min_output_amount);
        Ok(())
    }

    pub fn distribute_rewards(ctx: Context<DistributeRewards>) -> Result<()> {
        // Get the current time and state data before borrowing state mutably
        let current_time = Clock::get()?.unix_timestamp;
        let last_distribution = ctx.accounts.state.last_distribution;
        let reward_interval = ctx.accounts.state.reward_interval_minutes as i64 * 60;
        
        // Check if enough time has passed since the last distribution (5 minutes)
        let time_since_last = current_time - last_distribution;
        let required_interval = reward_interval;
        
        require!(
            time_since_last >= required_interval,
            JupiterRewardsError::TooEarlyForDistribution
        );
        
        // Get the amount of tokens in the reward vault
        let reward_vault_balance = ctx.accounts.reward_vault.amount;
        
        // Ensure there are tokens to distribute
        require!(
            reward_vault_balance > 0,
            JupiterRewardsError::NoRewardsToDistribute
        );
        
        // Check if there are eligible holders
        require!(
            ctx.accounts.jupiter_vault.amount > 0,
            JupiterRewardsError::NoEligibleHolders
        );
        
        // Calculate reward amount based on holdings
        // In a real implementation, this would be proportional to the user's holdings
        let total_supply = ctx.accounts.jupiter_mint_info.supply;
        let holder_percentage = (ctx.accounts.jupiter_vault.amount as f64 / total_supply as f64) * 100.0;
        let reward_amount = ((reward_vault_balance as f64 * holder_percentage / 100.0) as u64)
            .min(reward_vault_balance); // Ensure we don't exceed the vault balance
        
        // Transfer rewards from the reward vault to the recipient
        let state_bump = *ctx.bumps.get("state").unwrap();
        let seeds = &[b"state".as_ref(), &[state_bump]];
        let signer = &[&seeds[..]];
        
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Transfer {
                    from: ctx.accounts.reward_vault.to_account_info(),
                    to: ctx.accounts.recipient.to_account_info(),
                    authority: ctx.accounts.state.to_account_info(),
                },
                signer,
            ),
            reward_amount,
        )?;
        
        // Update the last distribution time
        ctx.accounts.state.last_distribution = current_time;
        
        msg!("Distributed {} Jupiter tokens as rewards ({}% of holdings)", reward_amount, holder_percentage);
        Ok(())
    }

    pub fn force_update_last_distribution(
        ctx: Context<ForceUpdateLastDistribution>,
        new_timestamp: i64,
    ) -> Result<()> {
        // Only the authority can force update the last distribution timestamp
        require!(
            ctx.accounts.authority.key() == ctx.accounts.state.authority,
            JupiterRewardsError::Unauthorized
        );
        
        ctx.accounts.state.last_distribution = new_timestamp;
        msg!("Forced update of last distribution timestamp to {}", new_timestamp);
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
    
    /// CHECK: This is the Jupiter token mint
    #[account(mut)]
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
    
    /// CHECK: Token program
    #[account(address = token::ID)]
    pub token_program: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CollectTax<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, StateAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    #[account(
        mut,
        token::mint = jupiter_mint,
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: This is the Jupiter token mint
    pub jupiter_mint: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [b"tax_vault"],
        bump,
        token::mint = jupiter_mint,
        token::authority = state,
    )]
    pub tax_vault: Account<'info, TokenAccount>,
    
    /// CHECK: Token program
    #[account(address = token::ID)]
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SwapSolForJupiter<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, StateAccount>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    /// CHECK: This is the recipient of the SOL (would be Jupiter program in real implementation)
    #[account(mut)]
    pub recipient: AccountInfo<'info>,
    
    /// CHECK: This is the mint of the Jupiter token
    #[account(mut, constraint = jupiter_mint.key() == state.jupiter_mint)]
    pub jupiter_mint: AccountInfo<'info>,
    
    #[account(
        mut,
        seeds = [b"reward_vault"],
        bump,
        token::mint = jupiter_mint,
        token::authority = state,
    )]
    pub reward_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is a PDA that has authority to mint tokens
    #[account(seeds = [b"mint_authority"], bump)]
    pub mint_authority: AccountInfo<'info>,
    
    /// CHECK: Token program
    #[account(address = token::ID)]
    pub token_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributeRewards<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, StateAccount>,
    
    #[account(
        mut,
        seeds = [b"reward_vault"],
        bump,
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
        constraint = jupiter_vault.mint == state.jupiter_mint
    )]
    pub jupiter_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is the mint of the Jupiter token
    #[account(constraint = jupiter_mint.key() == state.jupiter_mint)]
    pub jupiter_mint: AccountInfo<'info>,
    
    /// CHECK: This provides information about the mint
    #[account(constraint = jupiter_mint_info.key() == state.jupiter_mint)]
    pub jupiter_mint_info: Account<'info, Mint>,
    
    /// CHECK: Token program
    #[account(address = token::ID)]
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ForceUpdateLastDistribution<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, StateAccount>,
    pub authority: Signer<'info>,
}

#[account]
pub struct StateAccount {
    pub authority: Pubkey,
    pub jupiter_mint: Pubkey,
    pub tax_vault: Pubkey,
    pub reward_vault: Pubkey,
    pub tax_rate: u16,
    pub reward_interval_minutes: u8,
    pub last_distribution: i64,
}

impl StateAccount {
    pub const LEN: usize = 32 + 32 + 32 + 32 + 2 + 1 + 8;
}

#[error_code]
pub enum JupiterRewardsError {
    #[msg("Too early for reward distribution")]
    TooEarlyForDistribution,
    #[msg("No eligible holders for rewards")]
    NoEligibleHolders,
    #[msg("No rewards available to distribute")]
    NoRewardsToDistribute,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Invalid tax rate")]
    InvalidTaxRate,
    #[msg("Invalid reward interval")]
    InvalidRewardInterval,
} 