#![allow(clippy::result_large_err)]
#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use anchor_spl::associated_token::AssociatedToken;
use mpl_token_metadata::instructions::CreateMetadataAccountV3CpiBuilder;

declare_id!("CBrB6yQSi9pcxKuRR1uPjj6NLipfpZKYYT71c3gaFf1Y");

#[program]
pub mod prompt_marketplace {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, fee_bps: u64) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.fee_bps = fee_bps;
        config.bump = ctx.bumps.config;
        require!(fee_bps <= 1000, ErrorCode::InvalidFee); // Max 10%
        msg!("Initialized config: admin={}, fee_bps={}, bump={}", config.admin, config.fee_bps, config.bump);
        Ok(())
    }

    pub fn close_config(ctx: Context<CloseConfig>) -> Result<()> {
        let config = &ctx.accounts.config;
        let admin = &ctx.accounts.admin;
        require_keys_eq!(config.admin, admin.key(), ErrorCode::Unauthorized);
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.config.to_account_info(),
                    to: ctx.accounts.admin.to_account_info(),
                },
            ),
            ctx.accounts.config.to_account_info().lamports(),
        )?;
        msg!("Closed config: admin={}", admin.key());
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

        msg!("Creating prompt: mint={}, creator={}, metadata_uri={}, royalty_bps={}",
            prompt.mint, prompt.creator, prompt.metadata_uri, prompt.royalty_bps);

        msg!("Attempting mint_to CPI for mint: {}", ctx.accounts.mint.key());
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
        msg!("mint_to CPI succeeded, attempting metadata creation");

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
        msg!("Metadata creation succeeded");

        emit!(PromptCreated {
            mint: prompt.mint,
            creator: prompt.creator,
            metadata_uri: prompt.metadata_uri.clone(),
        });

        Ok(())
    }

    pub fn list_prompt(ctx: Context<ListPrompt>, price: u64) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        require!(price > 0, ErrorCode::InvalidPrice);

        listing.mint = ctx.accounts.mint.key();
        listing.seller = ctx.accounts.seller.key();
        listing.price = price;
        listing.is_active = true;
        listing.bump = ctx.bumps.listing;

        msg!("Listing prompt: mint={}, seller={}, price={}, bump={}",
            listing.mint, listing.seller, listing.price, listing.bump);

        msg!("Attempting token transfer from {} to {}", ctx.accounts.seller_token.key(), ctx.accounts.escrow_token.key());
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
        msg!("Token transfer succeeded");

        emit!(PromptListed {
            mint: ctx.accounts.mint.key(),
            seller: ctx.accounts.seller.key(),
            price,
        });

        Ok(())
    }

    pub fn buy_prompt(ctx: Context<BuyPrompt>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        let prompt = &ctx.accounts.prompt;
        let config = &ctx.accounts.config;

        // Enhanced debug logging
        msg!("Instruction: BuyPrompt");
        msg!("Buyer pubkey: {}", ctx.accounts.buyer.key());
        msg!("Buyer is_signer: {}", ctx.accounts.buyer.is_signer);
        msg!("Buyer_token pubkey: {}", ctx.accounts.buyer_token.key());
        msg!("Buyer_token owner: {}", ctx.accounts.buyer_token.owner);
        msg!("Buyer_token mint: {}", ctx.accounts.buyer_token.mint);
        msg!("Buyer_token amount: {}", ctx.accounts.buyer_token.amount);
        msg!("Escrow_token pubkey: {}", ctx.accounts.escrow_token.key());
        msg!("Escrow_token owner: {}", ctx.accounts.escrow_token.owner);
        msg!("Escrow_token mint: {}", ctx.accounts.escrow_token.mint);
        msg!("Escrow_token amount: {}", ctx.accounts.escrow_token.amount);
        msg!("Expected mint: {}", ctx.accounts.mint.key());
        msg!("Listing is_active: {}", listing.is_active);
        msg!("Listing price: {}", listing.price);
        msg!("Config fee_bps: {}", config.fee_bps);
        msg!("Prompt royalty_bps: {}", prompt.royalty_bps);

        require!(listing.is_active, ErrorCode::NotForSale);
        require!(
            ctx.accounts.buyer.lamports() >= listing.price,
            ErrorCode::InsufficientFunds
        );

        let platform_fee = (listing.price * config.fee_bps as u64) / 10000;
        let royalty = (listing.price * prompt.royalty_bps) / 10000;
        let seller_amount = listing.price
            .checked_sub(platform_fee)
            .ok_or(ErrorCode::ArithmeticError)?
            .checked_sub(royalty)
            .ok_or(ErrorCode::ArithmeticError)?;

        msg!("Platform fee: {}", platform_fee);
        msg!("Royalty: {}", royalty);
        msg!("Seller amount: {}", seller_amount);

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

        // Transfer SOL to admin (platform fee)
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

        // Transfer SOL to creator (royalty)
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

        // Transfer NFT from escrow to buyer
        msg!("Attempting token transfer from {} to {}", ctx.accounts.escrow_token.key(), ctx.accounts.buyer_token.key());
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
        msg!("Token transfer succeeded");

        listing.is_active = false;
        msg!("Listing set to inactive");

        emit!(PromptSold {
            mint: listing.mint,
            buyer: ctx.accounts.buyer.key(),
            seller: listing.seller,
            price: listing.price,
        });

        msg!("BuyPrompt completed successfully");
        Ok(())
    }

    pub fn delist_prompt(ctx: Context<DelistPrompt>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        require!(listing.is_active, ErrorCode::NotForSale);

        msg!("Delisting prompt: mint={}, seller={}", listing.mint, listing.seller);
        msg!("Attempting token transfer from {} to {}", ctx.accounts.escrow_token.key(), ctx.accounts.seller_token.key());
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
        msg!("Token transfer succeeded");

        listing.is_active = false;
        msg!("Listing set to inactive");

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
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseConfig<'info> {
    #[account(
        mut,
        has_one = admin,
        seeds = [b"config"],
        bump,
        close = admin
    )]
    pub config: Account<'info, Config>,
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
        mut,
        mint::decimals = 0,
        mint::authority = creator,
        mint::freeze_authority = creator,
        mint::token_program = token_program
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
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
    #[account(address = mpl_token_metadata::ID)]
    pub metadata_program: UncheckedAccount<'info>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ListPrompt<'info> {
    #[account(
        init_if_needed,
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
        mut,
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
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut)]
    pub seller: SystemAccount<'info>,
    #[account(mut)]
    pub admin: SystemAccount<'info>,
    #[account(mut)]
    pub creator: SystemAccount<'info>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer
    )]
    pub buyer_token: Account<'info, TokenAccount>,
    #[account(
        mut,
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
    pub associated_token_program: Program<'info, AssociatedToken>,
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

#[account]
pub struct Config {
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

impl Listing {
    pub fn discriminator() -> [u8; 8] {
        let hash = anchor_lang::solana_program::hash::hash(b"account:Listing");
        hash.as_ref()[0..8].try_into().unwrap()
    }
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
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Arithmetic error")]
    ArithmeticError,
}