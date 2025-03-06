use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{self, Token2022},
    token_interface::{Mint, TokenAccount, TokenInterface, transfer},
};
use solana_program::{
    program::invoke_signed,
    system_instruction,
};

declare_id!("JupRwdXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

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

    pub fn collect_tax(ctx: Context<CollectTax>) -> Result<()> {
        // This function is called by the permanent delegate to collect tax
        // The transfer fee extension automatically collects the tax into the fee account
        msg!("Tax collected into vault");
        Ok(())
    }

    pub fn swap_sol_for_jupiter(
        ctx: Context<SwapSolForJupiter>,
        amount: u64,
        min_output_amount: u64,
    ) -> Result<()> {
        // In a real implementation, you would integrate with Jupiter API
        // For this example, we'll simulate the swap by transferring SOL
        // and minting Jupiter tokens to the reward vault
        
        // Transfer SOL from the program to the recipient (simulating Jupiter swap)
        let transfer_ix = system_instruction::transfer(
            &ctx.accounts.state.key(),
            &ctx.accounts.recipient.key(),
            amount,
        );
        
        invoke_signed(
            &transfer_ix,
            &[
                ctx.accounts.state.to_account_info(),
                ctx.accounts.recipient.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[&[
                b"state",
                &[*ctx.bumps.get("state").unwrap()],
            ]],
        )?;
        
        // In a real implementation, you would call Jupiter's swap instruction here
        // For this example, we'll just mint Jupiter tokens to the reward vault
        // (assuming the program has mint authority)
        let mint_to_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_2022::MintTo {
                mint: ctx.accounts.jupiter_mint.to_account_info(),
                to: ctx.accounts.reward_vault.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
        );
        
        token_2022::mint_to(
            mint_to_ctx.with_signer(&[&[
                b"mint_authority",
                &[*ctx.bumps.get("mint_authority").unwrap()],
            ]]),
            min_output_amount,
        )?;
        
        msg!("Swapped {} SOL for {} Jupiter tokens", amount, min_output_amount);
        Ok(())
    }

    pub fn distribute_rewards(ctx: Context<DistributeRewards>) -> Result<()> {
        let state = &ctx.accounts.state;
        let current_time = Clock::get()?.unix_timestamp;
        let interval_seconds = (state.reward_interval_minutes as i64) * 60;
        
        // Check if it's time to distribute rewards
        require!(
            current_time - state.last_distribution >= interval_seconds,
            JupiterRewardsError::TooEarlyForDistribution
        );
        
        // Get total supply and eligible holders from the token metadata
        // This is simplified - in a real implementation you would need to query all holders
        let total_eligible_balance = ctx.accounts.jupiter_vault.amount;
        require!(
            total_eligible_balance > 0,
            JupiterRewardsError::NoEligibleHolders
        );
        
        // Calculate reward amount (all available Jupiter tokens in the reward vault)
        let reward_amount = ctx.accounts.reward_vault.amount;
        require!(
            reward_amount > 0,
            JupiterRewardsError::NoRewardsToDistribute
        );
        
        // In a real implementation, you would iterate through eligible holders
        // and distribute rewards proportionally
        // For simplicity, we're just transferring to a single recipient here
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_interface::Transfer {
                from: ctx.accounts.reward_vault.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
                authority: ctx.accounts.state.to_account_info(),
            },
        );
        
        transfer(
            transfer_ctx.with_signer(&[&[
                b"state",
                &[*ctx.bumps.get("state").unwrap()],
            ]]),
            reward_amount,
        )?;
        
        // Update last distribution time
        let state = &mut ctx.accounts.state;
        state.last_distribution = current_time;
        
        msg!("Distributed {} Jupiter tokens to eligible holders", reward_amount);
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
        
        let state = &mut ctx.accounts.state;
        state.last_distribution = new_timestamp;
        
        msg!("Forced last_distribution update to {}", new_timestamp);
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
        token::token_program = token_program,
    )]
    pub tax_vault: Account<'info, TokenAccount>,
    
    #[account(
        init,
        payer = authority,
        seeds = [b"reward_vault"],
        bump,
        token::mint = jupiter_mint,
        token::authority = state,
        token::token_program = token_program,
    )]
    pub reward_vault: Account<'info, TokenAccount>,
    
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token2022>,
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
    
    pub token_program: Program<'info, Token2022>,
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
    
    #[account(seeds = [b"mint_authority"], bump)]
    /// CHECK: This is a PDA that has authority to mint tokens
    pub mint_authority: AccountInfo<'info>,
    
    pub token_program: Program<'info, Token2022>,
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
    
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct ForceUpdateLastDistribution<'info> {
    #[account(mut)]
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