#![allow(clippy::result_large_err)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use mpl_token_metadata::instructions::CreateMetadataAccountV3CpiBuilder;

declare_id!("Ex1mC3Yr55mczVjk6aWmT75F3ZBUwH2BDeYSKx62fbvW");

#[program]
pub mod prompt_marketplace {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, fee_bps: u64) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.fee_bps = fee_bps;
        config.bump = ctx.bumps.config;
        require!(fee_bps <= 1000, ErrorCode::InvalidFee); // Max 10%
        Ok(())
    }

    pub fn create_prompt(
        ctx: Context<CreatePrompt>,
        metadata_uri: String,
        royalty_bps: u64,
    ) -> Result<()> {
        let prompt = &mut ctx.accounts.prompt;
        prompt.mint = ctx.accounts.mint.key();
        prompt.creator = ctx.accounts.creator.key();
        prompt.metadata_uri = metadata_uri.clone();
        prompt.royalty_bps = royalty_bps;
        prompt.bump = ctx.bumps.prompt;

        require!(royalty_bps <= 1000, ErrorCode::InvalidRoyalty); // Max 10% royalties
        require!(metadata_uri.len() <= 200, ErrorCode::InvalidUri);

        // Mint NFT
        anchor_spl::token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.creator_token.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            1,
        )?;

        // Create Metaplex metadata
        CreateMetadataAccountV3CpiBuilder::new(&ctx.accounts.metadata_program)
            .metadata(&ctx.accounts.metadata.to_account_info())
            .mint(&ctx.accounts.mint.to_account_info())
            .mint_authority(&ctx.accounts.creator.to_account_info())
            .payer(&ctx.accounts.creator.to_account_info())
            .update_authority(&ctx.accounts.creator.to_account_info(), true)
            .system_program(&ctx.accounts.system_program.to_account_info())
            .data(mpl_token_metadata::types::DataV2 {
                name: "Promphub Prompt".to_string(),
                symbol: "PROMPT".to_string(),
                uri: metadata_uri,
                seller_fee_basis_points: royalty_bps as u16,
                creators: Some(vec![mpl_token_metadata::types::Creator {
                    address: ctx.accounts.creator.key(),
                    verified: true,
                    share: 100,
                }]),
                collection: None,
                uses: None,
            })
            .is_mutable(true)
            .invoke()?;

        emit!(PromptCreated {
            mint: prompt.mint,
            creator: prompt.creator,
            metadata_uri: prompt.metadata_uri.clone(),
        });

        Ok(())
    }

    pub fn list_prompt(ctx: Context<ListPrompt>, price: u64) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        listing.mint = ctx.accounts.mint.key();
        listing.seller = ctx.accounts.seller.key();
        listing.price = price;
        listing.is_active = true;
        listing.bump = ctx.bumps.listing;

        require!(price > 0, ErrorCode::InvalidPrice);

        // Transfer NFT to escrow
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.seller_token.to_account_info(),
                    to: ctx.accounts.escrow_token.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            1,
        )?;

        emit!(PromptListed {
            mint: listing.mint,
            seller: listing.seller,
            price,
        });

        Ok(())
    }

    pub fn buy_prompt(ctx: Context<BuyPrompt>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        let prompt = &ctx.accounts.prompt;
        let config = &ctx.accounts.config;

        require!(listing.is_active, ErrorCode::NotForSale);
        require!(
            ctx.accounts.buyer.lamports() >= listing.price,
            ErrorCode::InsufficientFunds
        );

        // Calculate fees
        let platform_fee = (listing.price * config.fee_bps as u64) / 10000;
        let royalty = (listing.price * prompt.royalty_bps) / 10000;
        let seller_amount = listing.price - platform_fee - royalty;

        // Transfer SOL to seller
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.seller.to_account_info(),
                },
            ),
            seller_amount,
        )?;

        // Transfer platform fee to admin
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.admin.to_account_info(),
                },
            ),
            platform_fee,
        )?;

        // Transfer royalty to creator
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.creator.to_account_info(),
                },
            ),
            royalty,
        )?;

        // Transfer NFT to buyer
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.escrow_token.to_account_info(),
                    to: ctx.accounts.buyer_token.to_account_info(),
                    authority: ctx.accounts.escrow_authority.to_account_info(),
                },
                &[&[b"escrow", listing.mint.as_ref(), &[ctx.bumps.escrow_authority]]],
            ),
            1,
        )?;

        listing.is_active = false;

        emit!(PromptSold {
            mint: listing.mint,
            buyer: ctx.accounts.buyer.key(),
            seller: listing.seller,
            price: listing.price,
        });

        Ok(())
    }

    pub fn delist_prompt(ctx: Context<DelistPrompt>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        require!(listing.is_active, ErrorCode::NotForSale);

        // Return NFT to seller
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.escrow_token.to_account_info(),
                    to: ctx.accounts.seller_token.to_account_info(),
                    authority: ctx.accounts.escrow_authority.to_account_info(),
                },
                &[&[b"escrow", listing.mint.as_ref(), &[ctx.bumps.escrow_authority]]],
            ),
            1,
        )?;

        listing.is_active = false;

        emit!(PromptDelisted {
            mint: listing.mint,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 8 + 1,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, MarketplaceConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(metadata_uri: String)]
pub struct CreatePrompt<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + 32 + 4 + 200 + 8 + 1,
        seeds = [b"prompt", mint.key().as_ref()],
        bump
    )]
    pub prompt: Account<'info, Prompt>,
    #[account(
        init,
        payer = creator,
        mint::decimals = 0,
        mint::authority = creator,
        mint::freeze_authority = creator,
        mint::token_program = token_program
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        token::mint = mint,
        token::authority = creator,
        token::token_program = token_program
    )]
    pub creator_token: Account<'info, TokenAccount>,
    #[account(mut)]
    pub creator: Signer<'info>,
    /// CHECK: The metadata account is created and validated by the Metaplex metadata program using its PDA.
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    /// CHECK: This is the Metaplex Token Metadata program, validated by its known program ID.
    pub metadata_program: UncheckedAccount<'info>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ListPrompt<'info> {
    #[account(
        init,
        payer = seller,
        space = 8 + 32 + 32 + 8 + 1 + 1,
        seeds = [b"listing", mint.key().as_ref()],
        bump
    )]
    pub listing: Account<'info, Listing>,
    #[account(has_one = mint)]
    pub prompt: Account<'info, Prompt>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = seller
    )]
    pub seller_token: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = seller,
        token::mint = mint,
        token::authority = escrow_authority,
        token::token_program = token_program
    )]
    pub escrow_token: Account<'info, TokenAccount>,
    /// CHECK: This is a PDA-derived authority account validated by seeds [b"escrow", mint.key().as_ref()] and bump.
    #[account(
        seeds = [b"escrow", mint.key().as_ref()],
        bump
    )]
    pub escrow_authority: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BuyPrompt<'info> {
    #[account(
        mut,
        has_one = mint,
        has_one = seller,
        seeds = [b"listing", mint.key().as_ref()],
        bump
    )]
    pub listing: Account<'info, Listing>,
    #[account(
        has_one = mint,
        has_one = creator
    )]
    pub prompt: Account<'info, Prompt>,
    #[account(has_one = admin)]
    pub config: Account<'info, MarketplaceConfig>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut)]
    pub seller: SystemAccount<'info>,
    #[account(mut)]
    pub admin: SystemAccount<'info>,
    pub creator: SystemAccount<'info>,
    #[account(
        init_if_needed,
        payer = buyer,
        token::mint = mint,
        token::authority = buyer,
        token::token_program = token_program
    )]
    pub buyer_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = escrow_authority
    )]
    pub escrow_token: Account<'info, TokenAccount>,
    /// CHECK: This is a PDA-derived authority account validated by seeds [b"escrow", mint.key().as_ref()] and bump.
    #[account(
        seeds = [b"escrow", mint.key().as_ref()],
        bump
    )]
    pub escrow_authority: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DelistPrompt<'info> {
    #[account(
        mut,
        has_one = mint,
        has_one = seller,
        seeds = [b"listing", mint.key().as_ref()],
        bump
    )]
    pub listing: Account<'info, Listing>,
    #[account(has_one = mint)]
    pub prompt: Account<'info, Prompt>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = seller
    )]
    pub seller_token: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = escrow_authority
    )]
    pub escrow_token: Account<'info, TokenAccount>,
    /// CHECK: This is a PDA-derived authority account validated by seeds [b"escrow", mint.key().as_ref()] and bump.
    #[account(
        seeds = [b"escrow", mint.key().as_ref()],
        bump
    )]
    pub escrow_authority: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct MarketplaceConfig {
    pub admin: Pubkey,
    pub fee_bps: u64,
    pub bump: u8,
}

#[account]
pub struct Prompt {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub metadata_uri: String,
    pub royalty_bps: u64,
    pub bump: u8,
}

#[account]
pub struct Listing {
    pub mint: Pubkey,
    pub seller: Pubkey,
    pub price: u64,
    pub is_active: bool,
    pub bump: u8,
}

#[event]
pub struct PromptCreated {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub metadata_uri: String,
}

#[event]
pub struct PromptListed {
    pub mint: Pubkey,
    pub seller: Pubkey,
    pub price: u64,
}

#[event]
pub struct PromptSold {
    pub mint: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub price: u64,
}

#[event]
pub struct PromptDelisted {
    pub mint: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid platform fee")]
    InvalidFee,
    #[msg("Invalid royalty percentage")]
    InvalidRoyalty,
    #[msg("Invalid metadata URI")]
    InvalidUri,
    #[msg("Invalid price")]
    InvalidPrice,
    #[msg("Prompt not for sale")]
    NotForSale,
    #[msg("Insufficient funds")]
    InsufficientFunds,
}