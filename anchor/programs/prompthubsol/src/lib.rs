#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

declare_id!("5E4bXyfwYPGEN1HmWKBM2yFQsJqD4rqFb7Dciund8ZVW");

#[program]
pub mod prompthubsol {
    use super::*;

  pub fn close(_ctx: Context<ClosePrompthubsol>) -> Result<()> {
    Ok(())
  }

  pub fn decrement(ctx: Context<Update>) -> Result<()> {
    ctx.accounts.prompthubsol.count = ctx.accounts.prompthubsol.count.checked_sub(1).unwrap();
    Ok(())
  }

  pub fn increment(ctx: Context<Update>) -> Result<()> {
    ctx.accounts.prompthubsol.count = ctx.accounts.prompthubsol.count.checked_add(1).unwrap();
    Ok(())
  }

  pub fn initialize(_ctx: Context<InitializePrompthubsol>) -> Result<()> {
    Ok(())
  }

  pub fn set(ctx: Context<Update>, value: u8) -> Result<()> {
    ctx.accounts.prompthubsol.count = value.clone();
    Ok(())
  }
}

#[derive(Accounts)]
pub struct InitializePrompthubsol<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  #[account(
  init,
  space = 8 + Prompthubsol::INIT_SPACE,
  payer = payer
  )]
  pub prompthubsol: Account<'info, Prompthubsol>,
  pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct ClosePrompthubsol<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,

  #[account(
  mut,
  close = payer, // close account and return lamports to payer
  )]
  pub prompthubsol: Account<'info, Prompthubsol>,
}

#[derive(Accounts)]
pub struct Update<'info> {
  #[account(mut)]
  pub prompthubsol: Account<'info, Prompthubsol>,
}

#[account]
#[derive(InitSpace)]
pub struct Prompthubsol {
  count: u8,
}
