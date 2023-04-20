// Every calendar day resets against this timezone (Nigeria).
export const REWARD_TIMEZONE = 'Africa/Lagos';

// Counted transactions needed in a day to unlock the reward.
export const DAILY_REWARD_THRESHOLD = 50;

// Transactions with the SAME counterparty stop adding to the daily count
// after this many, that same day — stops two accounts farming the reward by
// just paying each other back and forth.
export const PER_COUNTERPARTY_DAILY_CAP = 5;

export const DAILY_REWARD_NAIRA = 15000;

// WhatsApp contact a user reaches out to after unlocking the reward.
// Manual, off-app payout after admin verification.
export const DAILY_REWARD_WHATSAPP = '+2349155549137';
