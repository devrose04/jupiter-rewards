use anchor_lang::prelude::*;
use anchor_spl::{
    token::{TokenAccount, Mint},
    token_2022,
};
use solana_program::{
    program::invoke,
    system_instruction,
};

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
        
        msg!("Jupiter rewards system initialized with Token-2022 support");
        Ok(())
    }

    pub fn collect_tax(ctx: Context<CollectTax>) -> Result<()> {
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
        token_2022::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::TransferChecked {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    mint: ctx.accounts.jupiter_mint.to_account_info(),
                    to: ctx.accounts.tax_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            tax_amount,
            ctx.accounts.jupiter_mint_info.decimals,
        )?;
        
        msg!("Tax collected: {} tokens", tax_amount);
        Ok(())
    }

    pub fn swap_sol_for_jupiter(
        ctx: Context<SwapSolForJupiter>,
        amount: u64,
        min_output_amount: u64,
    ) -> Result<()> {
        // Transfer SOL from user to the recipient
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
        
        // Mint new Jupiter tokens to the reward vault
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
        
        msg!("Swapped {} SOL for {} Jupiter tokens", amount, min_output_amount);
        Ok(())
    }

    pub fn distribute_rewards(ctx: Context<DistributeRewards>) -> Result<()> {
        // Get the current time and state data
        let current_time = Clock::get()?.unix_timestamp;
        let last_distribution = ctx.accounts.state.last_distribution;
        let reward_interval = ctx.accounts.state.reward_interval_minutes as i64 * 60;
        
        // Check if enough time has passed since the last distribution
        let time_since_last = current_time - last_distribution;
        
        require!(
            time_since_last >= reward_interval,
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
        let total_supply = ctx.accounts.jupiter_mint_info.supply;
        let holder_percentage = (ctx.accounts.jupiter_vault.amount as f64 / total_supply as f64) * 100.0;
        let reward_amount = ((reward_vault_balance as f64 * holder_percentage / 100.0) as u64)
            .min(reward_vault_balance);
        
        // Transfer rewards from the reward vault to the recipient
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
            reward_amount,
            ctx.accounts.jupiter_mint_info.decimals,
        )?;
        
        // Update the last distribution time
        ctx.accounts.state.last_distribution = current_time;
        
        msg!("Distributed {} Jupiter tokens as rewards", reward_amount);
        Ok(())
    }

    pub fn create_jupiter_token(
        ctx: Context<CreateJupiterToken>,
        decimals: u8,
    ) -> Result<()> {
        msg!("Creating Jupiter Token with Token-2022");
        
        // Initialize the mint with Token-2022
        let mint_authority = ctx.accounts.authority.key();
        
        token_2022::initialize_mint(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::InitializeMint {
                    mint: ctx.accounts.jupiter_mint.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            decimals,
            &mint_authority,
            Some(&ctx.accounts.authority.key()),
        )?;
        
        msg!("Jupiter Token-2022 created");
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
    pub user: Signer<'info>,
    
    #[account(
        mut,
        token::mint = jupiter_mint,
    )]
    pub user_token_account: Account<'info, TokenAccount>,
    
    /// CHECK: Jupiter token mint (Token-2022)
    pub jupiter_mint: AccountInfo<'info>,
    
    /// CHECK: Jupiter mint info
    pub jupiter_mint_info: Account<'info, Mint>,
    
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