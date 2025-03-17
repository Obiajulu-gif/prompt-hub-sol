#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

declare_id!("GjFKj3BcskW4zcDbjZpnBjxKPyDkeLVaKpBodWWykHKZ");

#[program]
pub mod prompt_marketplace {
    use super::*;

   pub fn create_listing(
    ctx: Context<CreateListing>,
    title: String,
    description: String,
    price: u64,
    category: String,
    file_hash: String,
) -> Result<()> {
    let listing = &mut ctx.accounts.listing;
    listing.owner = ctx.accounts.owner.key();
    listing.title = title;
    listing.description = description;
    listing.price = price;
    listing.category = category;
    listing.file_hash = file_hash;
    listing.sales = 0;
    listing.revenue = 0;
    listing.bump = ctx.bumps.listing; 
    Ok(())
}


    // Update an existing listing (only owner)
    pub fn update_listing(
        ctx: Context<UpdateListing>,
        title: String,
        description: String,
        price: u64,
        category: String,
    ) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        listing.title = title;
        listing.description = description;
        listing.price = price;
        listing.category = category;
        Ok(())
    }

    // Purchase a prompt (buyer sends SOL, owner receives SOL)
    pub fn purchase_prompt(ctx: Context<PurchasePrompt>) -> Result<()> {
        let listing = &mut ctx.accounts.listing;
        let buyer = &ctx.accounts.buyer;
        let owner = &ctx.accounts.owner;
        let system_program = &ctx.accounts.system_program;

        // Transfer SOL from buyer to owner
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &buyer.key(),
            &owner.key(),
            listing.price,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                buyer.to_account_info(),
                owner.to_account_info(),
                system_program.to_account_info(),
            ],
        )?;

        // Update listing stats
        listing.sales += 1;
        listing.revenue += listing.price;
        Ok(())
    }

    // Close a listing (owner only)
    pub fn close_listing(_ctx: Context<CloseListing>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateListing<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 4 + 100 + 4 + 500 + 8 + 4 + 100 + 4 + 100 + 8 + 8 + 1,
        seeds = [b"listing", owner.key().as_ref()],
        bump
    )]
    pub listing: Account<'info, PromptListing>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateListing<'info> {
    #[account(mut, has_one = owner)]
    pub listing: Account<'info, PromptListing>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct PurchasePrompt<'info> {
    #[account(mut)]
    pub listing: Account<'info, PromptListing>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(mut)]
    pub owner: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseListing<'info> {
    #[account(mut, has_one = owner, close = user)]
    pub listing: Account<'info, PromptListing>,

    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut)]
    pub user: SystemAccount<'info>,
}

#[account]
pub struct PromptListing {
    pub owner: Pubkey, // 32 bytes
    pub title: String, // Variable length
    pub description: String, // Variable length
    pub price: u64, // 8 bytes
    pub category: String, // Variable length
    pub file_hash: String, // Variable length (e.g., IPFS or Arweave hash)
    pub sales: u64, // 8 bytes
    pub revenue: u64, // 8 bytes
    pub bump: u8, // 1 byte
}
