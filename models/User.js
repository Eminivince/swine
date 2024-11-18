// models/User.js

const mongoose = require("mongoose");

// Define the Wallet schema
const walletSchema = new mongoose.Schema({
  privateKey: { type: String, required: true },
  address: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Define the Token schema
const tokenSchema = new mongoose.Schema({
  address: { type: String, required: true },
  name: { type: String, required: true },
  symbol: { type: String, required: true },
  pairAddress: { type: String, required: true },
  addedAt: { type: Date, default: Date.now },
});

// Define the Transaction schema
const transactionSchema = new mongoose.Schema({
  tokenAddress: { type: String, required: true },
  type: { type: String, required: true }, // e.g., "buy", "sell", "transfer"
  amount: { type: Number, required: true },
  usdValue: { type: Number, required: true },
  txHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Define the User schema with the updated structure
const userSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },

  // Array of wallets
  wallets: { type: [walletSchema], default: [] },

  // Index to track the current active wallet
  currentWalletIndex: { type: Number, default: 0 },

  // Array of tokens the user holds
  tokens: { type: [tokenSchema], default: [] },

  // Currently selected token for transactions
  currentToken: { type: String, default: null },

  // Array of transactions made by the user
  transactions: { type: [transactionSchema], default: [] },

  // Message IDs for managing message updates/deletions
  lastMainMenuMessageId: { type: Number, default: null },
  lastWalletInfoMessageId: { type: Number, default: null },

  // Temporary fields for handling specific actions
  tempRecipientAddress: { type: String, default: null },

  // Timestamp of user creation
  createdAt: { type: Date, default: Date.now },
});

// Create and export the User model
module.exports = mongoose.model("User", userSchema);
