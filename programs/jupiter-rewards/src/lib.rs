use anchor_lang::prelude::*;
use anchor_spl::{
    token::{self, Token, Mint, TokenAccount, transfer, mint_to},
};
use solana_program::{
    program::invoke_signed,
    system_instruction,
};

// Token Program ID: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA
declare_id!("BxT5WsUYEDAfiJ9zHZ6U5oDBZZA5AUMXS41mg1KRv78q");

#[program]
pub mod jupiter_rewards {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        tax_rate: u16,
        reward_interval_minutes: u8,
    ) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.authority = ctx.accounts.authority.key();
        state.jupiter_mint = ctx.accounts.jupiter_mint.key();
        state.tax_vault = ctx.accounts.tax_vault.key();
        state.reward_vault = ctx.accounts.reward_vault.key();
        state.tax_rate = tax_rate;
        state.reward_interval_minutes = reward_interval_minutes;
        state.last_distribution = Clock::get()?.unix_timestamp;
        
        msg!("Jupiter Rewards initialized with {}% tax rate", tax_rate as f64 / 100.0);
        msg!("Rewards will be distributed every {} minutes", reward_interval_minutes);
        
        Ok(())
    }

    pub fn collect_tax(_ctx: Context<CollectTax>) -> Result<()> {
        // This function is called by the permanent delegate to collect tax
        // The transfer fee extension automatically collects the tax into the fee account
        msg!("Tax collected into vault using transfer fee");
        Ok(())
    }

    pub fn swap_sol_for_jupiter(
        ctx: Context<SwapSolForJupiter>,
        amount: u64,
        min_output_amount: u64,
    ) -> Result<()> {
        // Transfer SOL from user to the recipient (Jupiter swap program in real implementation)
        invoke_signed(
            &system_instruction::transfer(
                &ctx.accounts.state.key(),
                &ctx.accounts.recipient.key(),
                amount,
            ),
            &[
                ctx.accounts.state.to_account_info(),
                ctx.accounts.recipient.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[],
        )?;

        // Mint new Jupiter tokens to the reward vault (simulating a swap)
        // In a real implementation, this would be a transfer from a Jupiter pool
        let seeds = &[b"mint_authority".as_ref(), &[*ctx.bumps.get("mint_authority").unwrap()]];
        let signer = &[&seeds[..]];

        mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.jupiter_mint.to_account_info(),
                    to: ctx.accounts.reward_vault.to_account_info(),
                    authority: ctx.accounts.mint_authority.to_account_info(),
                },
                signer,
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
        let reward_interval_minutes = ctx.accounts.state.reward_interval_minutes;
        
        // Check if enough time has passed since the last distribution
        let time_since_last = current_time - last_distribution;
        let required_interval = (reward_interval_minutes as i64) * 60;
        
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
        
        // Calculate reward amount (in a real implementation, this would be based on holdings)
        let reward_amount = reward_vault_balance.min(100); // Cap at 100 tokens for this example
        
        // Transfer rewards from the reward vault to the recipient
        let state_bump = *ctx.bumps.get("state").unwrap();
        let seeds = &[b"state".as_ref(), &[state_bump]];
        let signer = &[&seeds[..]];
        
        // Using transfer as recommended
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
        
        msg!("Distributed {} Jupiter tokens as rewards", reward_amount);
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
    
    pub jupiter_mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = authority,
        seeds = [b"tax_vault"],
        bump,
        token::mint = jupiter_mint,
        token::authority = state,
    )]
    pub tax_vault: Account<'info, TokenAccount>,
    
    #[account(
        init,
        payer = authority,
        seeds = [b"reward_vault"],
        bump,
        token::mint = jupiter_mint,
        token::authority = state,
    )]
    pub reward_vault: Account<'info, TokenAccount>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CollectTax<'info> {
    #[account(mut)]
    pub state: Account<'info, StateAccount>,
    
    #[account(
        mut,
        seeds = [b"tax_vault"],
        bump,
    )]
    pub tax_vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SwapSolForJupiter<'info> {
    #[account(mut, seeds = [b"state"], bump)]
    pub state: Account<'info, StateAccount>,
    
    /// CHECK: This is the recipient of the SOL (would be Jupiter program in real implementation)
    #[account(mut)]
    pub recipient: AccountInfo<'info>,
    
    #[account(mut)]
    pub jupiter_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        seeds = [b"reward_vault"],
        bump,
    )]
    pub reward_vault: Account<'info, TokenAccount>,
    
    /// CHECK: This is a PDA that has authority to mint tokens
    #[account(seeds = [b"mint_authority"], bump)]
    pub mint_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token>,
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
    )]
    pub reward_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub recipient: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = jupiter_vault.mint == state.jupiter_mint
    )]
    pub jupiter_vault: Account<'info, TokenAccount>,
    
    pub jupiter_mint: Account<'info, Mint>,
    
    pub token_program: Program<'info, Token>,
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
} 