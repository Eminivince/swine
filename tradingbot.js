// tradingbot.js

const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const { ethers } = require("ethers");
const mongoose = require("./Mongo.js"); // Connects to MongoDB
const User = require("./models/User"); // Mongoose User model
const { encrypt, decrypt } = require("./utils/encryption.js"); // Encryption helpers

require("dotenv").config();

// Load environment variables
const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error("❌ Error: Telegram bot token is not set.");
  process.exit(1);
}

const bot = new TelegramBot(botToken, {
  polling: true,
});

// Replace with your network RPC URL
const provider = new ethers.JsonRpcProvider("https://network.ambrosus.io");

// Fee address and tax rate
const FEE_ADDRESS = "0xdCB4587b0EBd64620Fb043C4286Bd9fa3cAf4B25";
const TAX_RATE = 0.003; // 0.3%

// Swine Token Details
const SWINE_TOKEN_ADDRESS = "0xC410F3EB0c0f0E1EFA188D38C366536d59a265ba";
const SWINE_TOKEN_MINIMUM = 1_000_000; // 1 million tokens

// Helper Functions
function shortenAddress(address) {
  return `${address.slice(0, 6)}......${address.slice(-4)}`;
}

/**
 * Truncate a number to a specified number of decimal places without rounding.
 * @param {number} num - The number to truncate.
 * @param {number} decimals - The maximum number of decimal places.
 * @returns {string} - The truncated number as a string.
 */
function truncateDecimals(num, decimals) {
  const factor = Math.pow(10, decimals);
  return (Math.floor(num * factor) / factor).toFixed(decimals);
}

// Uniswap Router and Factory Addresses
const UNISWAP_ROUTER_ADDRESS = "0xf7237C595425b49Eaeb3Dc930644de6DCa09c3C4";
const UNISWAP_FACTORY_ADDRESS = "0x2b6852CeDEF193ece9814Ee99BE4A4Df7F463557";
// AMB Token Address on AirDAO Network
const AMB_ADDRESS = "0x2b2d892C3fe2b4113dd7aC0D2c1882AF202FB28F";

// Import ABIs
const {
  uniswapRouterAbi,
  factoryAbi,
  pairAbi,
  tokenAbi,
} = require("./Constants.js");

// Creating Uniswap Router and Factory Contract Instances
const uniswapRouter = new ethers.Contract(
  UNISWAP_ROUTER_ADDRESS,
  uniswapRouterAbi,
  provider
);

const uniswapFactory = new ethers.Contract(
  UNISWAP_FACTORY_ADDRESS,
  factoryAbi,
  provider
);

// User states for handling conversation flow
const userStates = {};

// Helper Functions

/**
 * Function to get token data
 * @param {String} tokenAddress - The token's Ethereum address
 * @returns {Object} - Token data including name, symbol, and pair address
 */
async function getTokenData(tokenAddress) {
  const pairAddress = await getPairAddress(tokenAddress);
  if (pairAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
    const tokenName = await tokenContract.name();
    const tokenSymbol = await tokenContract.symbol();
    return {
      address: tokenAddress,
      pairAddress: pairAddress,
      name: tokenName,
      symbol: tokenSymbol,
      addedAt: new Date(),
    };
  } else {
    throw new Error("Pair address not found for token.", tokenContract.name);
  }
}

/**
 * Function to check if the user is exempted from fees
 * @param {String} walletAddress - The user's wallet address
 * @returns {Boolean} - True if exempted, else false
 */
async function isUserExemptFromFee(walletAddress) {
  const swineTokenContract = new ethers.Contract(
    SWINE_TOKEN_ADDRESS,
    tokenAbi,
    provider
  );
  const balance = await swineTokenContract.balanceOf(walletAddress);
  const balanceInTokens = parseFloat(ethers.formatEther(balance));
  return balanceInTokens >= SWINE_TOKEN_MINIMUM;
}

/**
 * Function to get AMB balance and USD value
 * @param {Object} wallet - The user's wallet instance
 * @returns {Object} - Balance in AMB and USD
 */
async function getWalletBalance(wallet) {
  const balance = await provider.getBalance(wallet.address);
  const balanceInAmb = parseFloat(ethers.formatEther(balance));
  const usdPrice = await getAmbPriceInUSD();
  const balanceInUsd = balanceInAmb * usdPrice;
  return { balanceInAmb, balanceInUsd };
}

/**
 * Function to get the AMB price in USD
 * @returns {Number} - AMB price in USD
 */
async function getAmbPriceInUSD() {
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=amber&vs_currencies=usd"
    );
    return response.data.amber.usd;
  } catch (error) {
    console.error("Error fetching AMB price:", error);
    return 0;
  }
}

/**
 * Function to get the pair address between the token and AMB
 * @param {String} tokenAddress - The token's Ethereum address
 * @returns {String|null} - Pair address or null if not found
 */
async function getPairAddress(tokenAddress) {
  try {
    const pairAddress = await uniswapFactory.getPair(AMB_ADDRESS, tokenAddress);
    if (pairAddress) {
      return pairAddress;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error fetching pair address:", error);
    return null;
  }
}

/**
 * Function to get the token price from the pair contract
 * @param {String} pairAddress - The Uniswap pair contract address
 * @returns {Number} - Token price in USD
 */
async function getTokenPriceFromPair(pairAddress) {
  const pairContract = new ethers.Contract(pairAddress, pairAbi, provider);

  // Fetch reserves
  const [reserve0, reserve1] = await pairContract.getReserves();

  // Validate reserves
  if (reserve0 === null || reserve1 === null) {
    throw new Error("Invalid reserves received from the pair contract");
  }

  // Fetch token addresses
  const token0 = await pairContract.token0();
  const token1 = await pairContract.token1();

  let tokenReserve, ambReserve;

  if (token0.toLowerCase() === AMB_ADDRESS.toLowerCase()) {
    ambReserve = parseFloat(ethers.formatEther(reserve0));
    tokenReserve = parseFloat(ethers.formatEther(reserve1));
  } else if (token1.toLowerCase() === AMB_ADDRESS.toLowerCase()) {
    ambReserve = parseFloat(ethers.formatEther(reserve1));
    tokenReserve = parseFloat(ethers.formatEther(reserve0));
  } else {
    throw new Error("AMB not found in pair reserves");
  }

  const tokenPriceInAmb = ambReserve / tokenReserve;

  // Fetch the current AMB price in USD
  const ambPriceInUsd = await getAmbPriceInUSD();
  return tokenPriceInAmb * ambPriceInUsd;
}

/**
 * Function to calculate market cap
 * @param {String} tokenAddress - The token's Ethereum address
 * @param {String} pairAddress - The Uniswap pair contract address
 * @returns {Object} - Token price, market cap, and burned tokens in Ether
 * 
 * 
 */
async function calculateMarketCap(tokenAddress, pairAddress) {
  const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);

  // Fetch total supply
  const totalSupply = await tokenContract.totalSupply();

  // Define the burn address
  const burnAddress = "0x000000000000000000000000000000000000dEaD";

  // Fetch the balance of the burn address
  const burnedTokens = await tokenContract.balanceOf(burnAddress);

  // Calculate circulating supply: totalSupply - burnedTokens

  let circulatingSupply;

  const tokenName = await tokenContract.name();

  if (tokenName == "SwissWine") {
    circulatingSupply = totalSupply;
  } else {
    circulatingSupply = totalSupply - burnedTokens;
  }

  // Convert BigNumber values to float for calculations
  const circulatingSupplyInEther = parseFloat(
    ethers.formatUnits(circulatingSupply, 18) // Adjust decimals if needed
  );

  const tokenPrice = await getTokenPriceFromPair(pairAddress);
  const marketCap = circulatingSupplyInEther * tokenPrice;

  // Get the burned tokens in ether for display
  const burnedTokensInEther = parseFloat(
    ethers.formatUnits(burnedTokens, 18) // Adjust decimals if needed
  );

  return {
    tokenPrice,
    marketCap,
    burnedTokensInEther,
  };
}

/**
 * Function to fetch user token holdings
 * @param {String} walletAddress - The user's wallet address
 * @param {String} tokenAddress - The token's Ethereum address
 * @returns {Number} - Token balance
 */
async function getUserHoldings(walletAddress, tokenAddress) {
  const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, provider);
  const tokenBalance = await tokenContract.balanceOf(walletAddress);
  return parseFloat(ethers.formatEther(tokenBalance));
}

/**
 * Function to show the main menu to the user.
 * @param {String} chatId - The Telegram chat ID.
 */
async function showMainMenu(chatId) {
  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      bot.sendMessage(
        chatId,
        "❌ User not found. Please use /start to initialize your account.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    if (user.wallets.length === 0) {
      bot.sendMessage(
        chatId,
        "No wallets found. Please create or import a wallet.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Create New Wallet", callback_data: "create_wallet" }],
              [{ text: "Import Wallet", callback_data: "import_wallet" }],
            ],
            remove_keyboard: true,
          },
        }
      );
      return;
    }

    const walletIndex = user.currentWalletIndex || 0;
    const walletData = user.wallets[walletIndex];
    if (!walletData) {
      bot.sendMessage(
        chatId,
        "❌ Active wallet not found. Please create or select a wallet.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Create New Wallet", callback_data: "create_wallet" }],
              [{ text: "Import Wallet", callback_data: "import_wallet" }],
            ],
            remove_keyboard: true,
          },
        }
      );
      return;
    }

    const decryptedPrivateKey = decrypt(walletData.privateKey);
    const wallet = new ethers.Wallet(decryptedPrivateKey, provider);

    const { balanceInAmb, balanceInUsd } = await getWalletBalance(wallet);

    // Delete the previous main menu message if it exists
    if (user.lastMainMenuMessageId) {
      try {
        await bot.deleteMessage(chatId, user.lastMainMenuMessageId);
      } catch (error) {
        console.error("Error deleting old main menu message:", error);
      }
    }

    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Select Token", callback_data: "select_token" }],
          [{ text: "Add New Token", callback_data: "add_new_token" }],
          [
            { text: "Send AMB", callback_data: "send_amb" },
            { text: "Receive", callback_data: "receive" },
          ],
          [{ text: "Wallet", callback_data: "view_wallet" }],
          [{ text: "Manage Wallets", callback_data: "manage_wallets" }],
        ],
        remove_keyboard: true,
      },
      disable_web_page_preview: true,
    };

    // Ensure Swine is set as default token
    if (!user.currentToken) {
      const swineToken = user.tokens.find(
        (token) =>
          token.address.toLowerCase() === SWINE_TOKEN_ADDRESS.toLowerCase()
      );
      if (swineToken) {
        user.currentToken = SWINE_TOKEN_ADDRESS;
        await user.save();
      } else {
        // Optionally, automatically add Swine if not present
        try {
          const swineTokenData = await getTokenData(SWINE_TOKEN_ADDRESS);
          user.tokens.push(swineTokenData);
          user.currentToken = SWINE_TOKEN_ADDRESS;
          await user.save();
        } catch (error) {
          console.error("❌ Error adding Swine as default token:", error);
          bot.sendMessage(
            chatId,
            "❌ Failed to set Swine as the default token.",
            {
              reply_markup: { remove_keyboard: true },
            }
          );
          return;
        }
      }
    }

    if (balanceInAmb > 0) {
      await showBuySellOptions(chatId);
    } else {
      const sentMessage = await bot.sendMessage(
        chatId,
        `🚀 Welcome to the trading bot!\n\nWe have created a wallet for you on the AirDAO network. You currently have no AMB in your wallet.\n\nTo start trading, deposit AMB to your wallet address:\n\`${wallet.address}\`\n\nFor more info on your wallet and to retrieve your private key, tap the wallet button below.\n\n🚨 Protect your private keys. We are not responsible for any loss of funds!`,
        {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Wallet", callback_data: "view_wallet" },
                { text: "Import Wallet", callback_data: "import_wallet" },
              ],
              [
                { text: "Refresh Balance", callback_data: "refresh_balance" },
                { text: "Receive", callback_data: "receive" },
              ],
            ],
            remove_keyboard: true,
          },
        }
      );
      // Store the message ID of the main menu message
      user.lastMainMenuMessageId = sentMessage.message_id;
      await user.save();
    }
  } catch (error) {
    console.error("Error in showMainMenu:", error);
    bot.sendMessage(
      chatId,
      "❌ An error occurred while displaying the main menu.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
  }
}

/**
 * Function to display buy/sell options with token data and profit/loss
 * @param {String} chatId - The Telegram chat ID
 * @param {Number|null} messageId - The message ID to edit (optional)
 */
async function showBuySellOptions(chatId, messageId = null) {
  try {
    const user = await User.findOne({ chatId });
    if (!user || !user.currentToken) {
      bot.sendMessage(
        chatId,
        "No wallet or token selected. Please select a token first.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Select Token", callback_data: "select_token" }],
              [{ text: "Add New Token", callback_data: "add_new_token" }],
              [{ text: "Home", callback_data: "back_to_main" }],
            ],
            remove_keyboard: true,
          },
        }
      );
      return;
    }

    const walletIndex = user.currentWalletIndex || 0;
    const walletData = user.wallets[walletIndex];
    if (!walletData) {
      bot.sendMessage(
        chatId,
        "Active wallet not found. Please create or select a wallet.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    const decryptedPrivateKey = decrypt(walletData.privateKey);
    const wallet = new ethers.Wallet(decryptedPrivateKey, provider);

    const tokenData = user.tokens.find(
      (token) => token.address.toLowerCase() === user.currentToken.toLowerCase()
    );
    if (!tokenData) {
      bot.sendMessage(chatId, "Selected token data not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    // Get token price, market cap, and burned tokens
    const { tokenPrice, marketCap, burnedTokensInEther } =
      await calculateMarketCap(user.currentToken, tokenData.pairAddress);

    // Calculate the value of burned tokens in USD
    const burnedTokensValueInUSD = burnedTokensInEther * tokenPrice;

    // Get user holdings
    const userHoldings = await getUserHoldings(
      wallet.address,
      user.currentToken
    );
    const userHoldingsValueInUSD = userHoldings * tokenPrice;

    // Calculate profit/loss
    let profitLossText = "";
    const userTransactions = user.transactions.filter(
      (tx) => tx.tokenAddress.toLowerCase() === user.currentToken.toLowerCase()
    );
    if (userTransactions.length > 0) {
      const totalSpent = userTransactions
        .filter((tx) => tx.type === "buy")
        .reduce((acc, tx) => acc + tx.usdValue, 0);
      const totalReceived = userTransactions
        .filter((tx) => tx.type === "sell")
        .reduce((acc, tx) => acc + tx.usdValue, 0);
      const netInvestment = totalSpent - totalReceived;
      const currentValue = userHoldingsValueInUSD;

      const profitLoss = currentValue - netInvestment;
      const profitLossPercentage =
        netInvestment !== 0
          ? ((profitLoss / netInvestment) * 100).toFixed(2)
          : "0.00";

      profitLossText = `\n📈 P/L: $${profitLoss.toFixed(
        2
      )} (${profitLossPercentage}%)`;
    }

    const { balanceInAmb, balanceInUsd } = await getWalletBalance(wallet);

    // Prepare the message text
    const messageText = `✅ *Token:* ${tokenData.name}\n📌 *Ticker:* $${
      tokenData.symbol
    }\n\n🏷️ *Price:* $${tokenPrice.toFixed(
      7
    )} USD\n🏪 *Market Cap:* $${marketCap.toFixed(
      2
    )} USD\n🔥 *Burned:* ${burnedTokensInEther.toFixed(2)} $${
      tokenData.symbol
    } \n🏦 *Holdings:* ${userHoldings.toFixed(2)} $${
      tokenData.symbol
    }\n💸*Worth:* $${userHoldingsValueInUSD.toFixed(
      2
    )} USD\n 💰*Wallet:* ${balanceInAmb.toFixed(4)} AMB (${balanceInUsd.toFixed(4)} USD)`;

    // Prepare the inline keyboard
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Buy X Amount", callback_data: "buy_x" },
            { text: "Sell X Amount", callback_data: "sell_x" },
          ],
          [
            { text: "Buy X% of Wallet", callback_data: "buy_x_percent" },
            { text: "Sell X% of Tokens", callback_data: "sell_x_percent" },
          ],
          [
            { text: "Send Token", callback_data: "send_token" },
            { text: "Receive", callback_data: "receive" },
          ],
          [
            { text: "Refresh", callback_data: "refresh_token_details" },
            { text: "Home", callback_data: "back_to_main" },
          ],
          [
            { text: "Select Token", callback_data: "select_token" },
            { text: "Manage Tokens", callback_data: "manage_tokens" },
          ],
          [{ text: "Wallet", callback_data: "view_wallet" }],
        ],
        remove_keyboard: true,
      },
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    };

    if (messageId) {
      options.chat_id = chatId;
      options.message_id = messageId;
      bot
        .editMessageText(messageText, options)
        .catch((error) => console.error("Error editing message:", error));
    } else {
      // Delete the previous main menu message if it exists
      if (user.lastMainMenuMessageId) {
        try {
          await bot.deleteMessage(chatId, user.lastMainMenuMessageId);
        } catch (error) {
          console.error("Error deleting old main menu message:", error);
        }
      }

      const sentMessage = await bot.sendMessage(chatId, messageText, options);
      // Store the message ID of the main menu message
      user.lastMainMenuMessageId = sentMessage.message_id;
      await user.save();
    }
  } catch (error) {
    console.error("Error in showBuySellOptions:", error);
    bot.sendMessage(
      chatId,
      "An error occurred while displaying buy/sell options.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
  }
}

/**
 * Listen for the "/start" command and handle user initialization.
 */
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    let user = await User.findOne({ chatId });
    if (user) {
      // User exists, show main menu
      await showMainMenu(chatId);
    } else {
      // New user, prompt to create or import wallet
      const newUser = new User({ chatId });
      await newUser.save();

      bot.sendMessage(
        chatId,
        "Welcome! You can manage multiple wallets. Do you want to create a new wallet or import an existing one?",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Create New Wallet", callback_data: "create_wallet" }],
              [{ text: "Import Wallet", callback_data: "import_wallet" }],
            ],
            remove_keyboard: true,
          },
        }
      );
    }
  } catch (error) {
    console.error("Error in /start handler:", error);
    bot.sendMessage(
      chatId,
      "An error occurred while processing your request. Please try again later.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
  }
});

/**
 * Handle incoming messages for various states.
 */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Skip handling callback queries or commands
  if (msg.entities) return;

  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      bot.sendMessage(
        chatId,
        "User not found. Please use /start to initialize your account.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    // Initialize user states if not present
    userStates[chatId] = userStates[chatId] || null;

    // **New Functionality Starts Here**
    if (!userStates[chatId]) {
      // Only proceed if not in a specific state
      if (ethers.isAddress(text)) {
        // User sent a valid Ethereum address outside of specific states
        const tokenAddress = ethers.getAddress(text);
        const existingToken = user.tokens.find(
          (token) => token.address.toLowerCase() === tokenAddress.toLowerCase()
        );

        if (existingToken) {
          bot.sendMessage(
            chatId,
            `✅ Token already exists: ${existingToken.name} ($${existingToken.symbol}). It is now set as the active token.`,
            {
              reply_markup: { remove_keyboard: true },
            }
          );
          user.currentToken = tokenAddress;
          await user.save();
          await showMainMenu(chatId);
          return;
        }

        // Attempt to fetch and add the token
        try {
          const tokenData = await getTokenData(tokenAddress);
          user.tokens.push(tokenData);
          user.currentToken = tokenAddress;
          await user.save();

          bot.sendMessage(
            chatId,
            `✅ Token added successfully: ${tokenData.name} ($${tokenData.symbol}). It is now set as the active token.`,
            {
              reply_markup: { remove_keyboard: true },
            }
          );
          await showMainMenu(chatId);
          return;
        } catch (error) {
          console.error("Error adding token via message:", error);
          bot.sendMessage(
            chatId,
            "❌ Failed to add the token. Please ensure the token address is correct and has a valid AMB pair.",
            {
              reply_markup: { remove_keyboard: true },
            }
          );
          return;
        }
      }
    }
    // **New Functionality Ends Here**

    if (userStates[chatId] === "waiting_for_token_address") {
      // Handling token address input
      if (ethers.isAddress(text)) {
        const tokenAddress = ethers.getAddress(text);
        const pairAddress = await getPairAddress(tokenAddress);
        if (pairAddress) {
          const tokenData = await getTokenData(tokenAddress);
          user.tokens.push(tokenData);
          user.currentToken = tokenAddress;
          await user.save();

          bot.sendMessage(
            chatId,
            `${tokenData.name} ($${tokenData.symbol}) added successfully!`,
            {
              reply_markup: { remove_keyboard: true },
            }
          );
          delete userStates[chatId];
          await showBuySellOptions(chatId);
        } else {
          bot.sendMessage(
            chatId,
            "No pair found between AMB and the token address provided. Please enter another token address:",
            {
              reply_markup: { force_reply: true },
            }
          );
        }
      } else {
        bot.sendMessage(
          chatId,
          "Invalid token address. Please enter a valid Ethereum address:",
          {
            reply_markup: { force_reply: true },
          }
        );
      }
    } else if (userStates[chatId] === "waiting_for_buy_amount") {
      const ambAmount = parseFloat(text);
      if (!isNaN(ambAmount) && ambAmount > 0) {
        // Set a minimum threshold to prevent underflow
        const MIN_AMB_AMOUNT = 0.0001; // Example: 0.0001 AMB
        if (ambAmount < MIN_AMB_AMOUNT) {
          bot.sendMessage(
            chatId,
            `❌ The amount is too small. Please enter an amount greater than ${MIN_AMB_AMOUNT} AMB:`,
            {
              reply_markup: { force_reply: true },
            }
          );
          return;
        }
        await executeBuy(chatId, ambAmount);
        delete userStates[chatId];
      } else {
        bot.sendMessage(
          chatId,
          "❌ Invalid amount. Please enter a valid number:",
          {
            reply_markup: { force_reply: true },
          }
        );
      }
    } else if (userStates[chatId] === "waiting_for_sell_amount") {
      const tokenAmount = parseFloat(text);
      if (!isNaN(tokenAmount) && tokenAmount > 0) {
        await executeSell(chatId, tokenAmount);
        delete userStates[chatId];
      } else {
        bot.sendMessage(
          chatId,
          "❌ Invalid amount. Please enter a valid number:",
          {
            reply_markup: { force_reply: true },
          }
        );
      }
    } else if (userStates[chatId] === "waiting_for_buy_percentage") {
      const percentage = parseFloat(text);
      if (!isNaN(percentage) && percentage > 0 && percentage <= 100) {
        const walletIndex = user.currentWalletIndex || 0;
        const walletData = user.wallets[walletIndex];
        const decryptedPrivateKey = decrypt(walletData.privateKey);
        const wallet = new ethers.Wallet(decryptedPrivateKey, provider);
        const { balanceInAmb } = await getWalletBalance(wallet);
        const ambAmount = (percentage / 100) * balanceInAmb;
        if (ambAmount <= 0) {
          bot.sendMessage(
            chatId,
            "Your AMB balance is insufficient for this transaction.",
            {
              reply_markup: { remove_keyboard: true },
            }
          );
        } else {
          await executeBuy(chatId, ambAmount);
        }
        delete userStates[chatId];
      } else {
        bot.sendMessage(
          chatId,
          "❌ Invalid percentage. Please enter a value between 1 and 100:",
          {
            reply_markup: { force_reply: true },
          }
        );
      }
    } else if (userStates[chatId] === "waiting_for_sell_percentage") {
      const percentage = parseFloat(text);
      if (!isNaN(percentage) && percentage > 0 && percentage <= 100) {
        const walletIndex = user.currentWalletIndex || 0;
        const walletData = user.wallets[walletIndex];
        const decryptedPrivateKey = decrypt(walletData.privateKey);
        const wallet = new ethers.Wallet(decryptedPrivateKey, provider);
        const userToken = user.tokens.find(
          (token) =>
            token.address.toLowerCase() === user.currentToken.toLowerCase()
        );
        if (!userToken) {
          bot.sendMessage(chatId, "Selected token not found.", {
            reply_markup: { remove_keyboard: true },
          });
          return;
        }
        const tokenBalance = await getUserHoldings(
          wallet.address,
          userToken.address
        );
        const tokenAmount = (percentage / 100) * tokenBalance;
        if (tokenAmount <= 0) {
          bot.sendMessage(
            chatId,
            "Your token balance is insufficient for this transaction.",
            {
              reply_markup: { remove_keyboard: true },
            }
          );
        } else {
          await executeSell(chatId, tokenAmount);
        }
        delete userStates[chatId];
      } else {
        bot.sendMessage(
          chatId,
          "❌ Invalid percentage. Please enter a value between 1 and 100:",
          {
            reply_markup: { force_reply: true },
          }
        );
      }
    } else if (userStates[chatId] === "waiting_for_private_key_import") {
      const privateKey = text;
      try {
        // Validate private key format
        if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
          throw new Error("Invalid private key format.");
        }

        const importedWallet = new ethers.Wallet(privateKey, provider);
        user.wallets.push({
          address: importedWallet.address,
          privateKey: encrypt(privateKey),
        });
        user.currentWalletIndex = user.wallets.length - 1;
        await user.save();

        // Pre-add Swine token if not already added
        const swineTokenExists = user.tokens.some(
          (token) =>
            token.address.toLowerCase() === SWINE_TOKEN_ADDRESS.toLowerCase()
        );
        if (!swineTokenExists) {
          const swineTokenData = await getTokenData(SWINE_TOKEN_ADDRESS);
          user.tokens.push(swineTokenData);
          user.currentToken = SWINE_TOKEN_ADDRESS;
          await user.save();
        }

        bot.sendMessage(chatId, "✅ Wallet imported and set as active.", {
          reply_markup: { remove_keyboard: true },
        });

        delete userStates[chatId];
        await showWalletInfo(chatId);
      } catch (error) {
        console.error("Error importing wallet:", error);
        bot.sendMessage(
          chatId,
          "❌ Invalid private key. Please ensure it's a valid Ethereum private key starting with '0x' and try again:",
          {
            reply_markup: { force_reply: true },
          }
        );
      }
    } else if (userStates[chatId] === "waiting_for_send_token_address") {
      if (ethers.isAddress(text)) {
        userStates[chatId] = "waiting_for_send_token_amount";
        user.tempRecipientAddress = ethers.getAddress(text);
        await user.save();
        bot.sendMessage(chatId, "Please enter the amount of tokens to send:", {
          reply_markup: { force_reply: true },
        });
      } else {
        bot.sendMessage(
          chatId,
          "❌ Invalid address. Please enter a valid Ethereum address:",
          {
            reply_markup: { force_reply: true },
          }
        );
      }
    } else if (userStates[chatId] === "waiting_for_send_token_amount") {
      const amount = parseFloat(text);
      if (!isNaN(amount) && amount > 0) {
        const recipient = user.tempRecipientAddress;
        delete user.tempRecipientAddress;
        userStates[chatId] = null;
        await user.save();
        await sendToken(chatId, recipient, amount);
      } else {
        bot.sendMessage(
          chatId,
          "❌ Invalid amount. Please enter a valid number:",
          {
            reply_markup: { force_reply: true },
          }
        );
      }
    } else if (userStates[chatId] === "waiting_for_send_amb_address") {
      if (ethers.isAddress(text)) {
        userStates[chatId] = "waiting_for_send_amb_amount";
        user.tempRecipientAddress = ethers.getAddress(text);
        await user.save();
        bot.sendMessage(chatId, "Please enter the amount of AMB to send:", {
          reply_markup: { force_reply: true },
        });
      } else {
        bot.sendMessage(
          chatId,
          "❌ Invalid address. Please enter a valid Ethereum address:",
          {
            reply_markup: { force_reply: true },
          }
        );
      }
    } else if (userStates[chatId] === "waiting_for_send_amb_amount") {
      const amount = parseFloat(text);
      if (!isNaN(amount) && amount > 0) {
        const recipient = user.tempRecipientAddress;
        delete user.tempRecipientAddress;
        userStates[chatId] = null;
        await user.save();
        await sendAmb(chatId, recipient, amount);
      } else {
        bot.sendMessage(
          chatId,
          "❌ Invalid amount. Please enter a valid number:",
          {
            reply_markup: { force_reply: true },
          }
        );
      }
    } else {
      // Default response when no specific state and input is not a valid address
      bot.sendMessage(chatId, "ℹ️ Please choose an option from the menu.", {
        reply_markup: { remove_keyboard: true },
      });
    }
  } catch (error) {
    console.error("Error handling message:", error);
    bot.sendMessage(
      chatId,
      "❌ An error occurred while processing your message. Please try again later.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
  }
});

/**
 * Listen for callback queries (button clicks).
 */
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;

  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      bot.sendMessage(
        chatId,
        "User not found. Please use /start to initialize your account.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    switch (data) {
      case "view_wallet":
        await showWalletInfo(chatId);
        break;
      case "import_wallet":
        bot.sendMessage(
          chatId,
          "🔐 Please enter your private key (starting with '0x'):",
          {
            reply_markup: { force_reply: true },
          }
        );
        userStates[chatId] = "waiting_for_private_key_import";
        await user.save();
        break;
      case "refresh_balance":
        await showMainMenu(chatId);
        break;
      case "reveal_key":
        await revealPrivateKey(chatId);
        break;
      case "back_to_main":
        await showMainMenu(chatId);
        break;
      case "buy_x":
        bot.sendMessage(
          chatId,
          "💰 Please enter the amount of AMB you want to use for the purchase:",
          {
            reply_markup: { force_reply: true },
          }
        );
        userStates[chatId] = "waiting_for_buy_amount";
        await user.save();
        break;
      case "sell_x":
        bot.sendMessage(
          chatId,
          "📉 Please enter the amount of tokens you want to sell:",
          {
            reply_markup: { force_reply: true },
          }
        );
        userStates[chatId] = "waiting_for_sell_amount";
        await user.save();
        break;
      case "buy_x_percent":
        bot.sendMessage(
          chatId,
          "💰 Please enter the percentage of your AMB balance you want to use for the purchase (e.g., 50 for 50%):",
          {
            reply_markup: { force_reply: true },
          }
        );
        userStates[chatId] = "waiting_for_buy_percentage";
        await user.save();
        break;
      case "sell_x_percent":
        bot.sendMessage(
          chatId,
          "📉 Please enter the percentage of your token holdings you want to sell (e.g., 50 for 50%):",
          {
            reply_markup: { force_reply: true },
          }
        );
        userStates[chatId] = "waiting_for_sell_percentage";
        await user.save();
        break;
      case "refresh_token_details":
        await showBuySellOptions(chatId, messageId);
        break;
      case "add_new_token":
        bot.sendMessage(
          chatId,
          "🔄 Please enter the token address you want to add:",
          {
            reply_markup: { force_reply: true },
          }
        );
        userStates[chatId] = "waiting_for_token_address";
        await user.save();
        break;
      case "select_token":
        await showTokenSelectionMenu(chatId);
        break;
      case "manage_tokens":
        await showManageTokensMenu(chatId);
        break;
      case "manage_wallets":
        await showManageWalletsMenu(chatId);
        break;
      case "send_token":
        bot.sendMessage(
          chatId,
          "✉️ Please enter the recipient's address to send the token:",
          {
            reply_markup: { force_reply: true },
          }
        );
        userStates[chatId] = "waiting_for_send_token_address";
        await user.save();
        break;
      case "send_amb":
        bot.sendMessage(
          chatId,
          "✉️ Please enter the recipient's address to send AMB:",
          {
            reply_markup: { force_reply: true },
          }
        );
        userStates[chatId] = "waiting_for_send_amb_address";
        await user.save();
        break;
      case "receive":
        await showReceiveInfo(chatId);
        break;
      case "create_wallet":
        await createNewWallet(chatId);
        break;
      default:
        if (data.startsWith("select_token_")) {
          const tokenAddress = data.split("_")[2];
          if (
            user.tokens.some(
              (token) =>
                token.address.toLowerCase() === tokenAddress.toLowerCase()
            )
          ) {
            user.currentToken = ethers.getAddress(tokenAddress);
            await user.save();
            const selectedToken = user.tokens.find(
              (token) =>
                token.address.toLowerCase() === tokenAddress.toLowerCase()
            );
            bot.sendMessage(
              chatId,
              `✅ Switched to ${selectedToken.name} ($${selectedToken.symbol}).`,
              {
                reply_markup: { remove_keyboard: true },
              }
            );
            await showBuySellOptions(chatId);
          } else {
            bot.sendMessage(chatId, "❌ Token not found. Please try again.", {
              reply_markup: { remove_keyboard: true },
            });
          }
        } else if (data.startsWith("remove_token_")) {
          const tokenAddress = data.split("_")[2];
          const tokenIndex = user.tokens.findIndex(
            (token) =>
              token.address.toLowerCase() === tokenAddress.toLowerCase()
          );
          if (tokenIndex !== -1) {
            user.tokens.splice(tokenIndex, 1);
            // If the removed token was the currentToken, set to another token or null
            if (
              user.currentToken &&
              user.currentToken.toLowerCase() === tokenAddress.toLowerCase()
            ) {
              user.currentToken =
                user.tokens.length > 0 ? user.tokens[0].address : null;
            }
            await user.save();
            bot.sendMessage(chatId, "✅ Token removed successfully.", {
              reply_markup: { remove_keyboard: true },
            });
            await showMainMenu(chatId);
          } else {
            bot.sendMessage(chatId, "❌ Token not found. Please try again.", {
              reply_markup: { remove_keyboard: true },
            });
          }
        } else if (data.startsWith("switch_wallet_")) {
          const walletIndex = parseInt(data.split("_")[2]);
          if (walletIndex >= 0 && walletIndex < user.wallets.length) {
            user.currentWalletIndex = walletIndex;
            await user.save();
            bot.sendMessage(chatId, "✅ Switched to the selected wallet.", {
              reply_markup: { remove_keyboard: true },
            });
            await showWalletInfo(chatId);
          } else {
            bot.sendMessage(chatId, "❌ Invalid wallet selection.", {
              reply_markup: { remove_keyboard: true },
            });
          }
        } else if (data.startsWith("remove_wallet_")) {
          const walletIndex = parseInt(data.split("_")[2]);
          if (
            user.wallets.length > 1 &&
            walletIndex >= 0 &&
            walletIndex < user.wallets.length
          ) {
            user.wallets.splice(walletIndex, 1);
            // Adjust currentWalletIndex if necessary
            if (user.currentWalletIndex >= user.wallets.length) {
              user.currentWalletIndex = 0;
            }
            await user.save();
            bot.sendMessage(chatId, "✅ Wallet removed successfully.", {
              reply_markup: { remove_keyboard: true },
            });
            await showWalletInfo(chatId);
          } else {
            bot.sendMessage(chatId, "❌ You must have at least one wallet.", {
              reply_markup: { remove_keyboard: true },
            });
          }
        } else {
          bot.sendMessage(
            chatId,
            "ℹ️ Unknown action. Please choose an option from the menu.",
            {
              reply_markup: { remove_keyboard: true },
            }
          );
        }
    }
  } catch (error) {
    console.error("Error handling callback query:", error);
    bot.sendMessage(
      chatId,
      "❌ An error occurred while processing your request. Please try again later.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
  }
});

/**
 * Function to show the wallet information to the user.
 * @param {String} chatId - The Telegram chat ID.
 */
async function showWalletInfo(chatId) {
  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      bot.sendMessage(
        chatId,
        "User not found. Please use /start to initialize your account.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    if (user.wallets.length === 0) {
      bot.sendMessage(
        chatId,
        "No wallets found. Please create or import a wallet.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Create New Wallet", callback_data: "create_wallet" }],
              [{ text: "Import Wallet", callback_data: "import_wallet" }],
            ],
            remove_keyboard: true,
          },
        }
      );
      return;
    }

    const walletIndex = user.currentWalletIndex || 0;
    const walletData = user.wallets[walletIndex];
    if (!walletData) {
      bot.sendMessage(
        chatId,
        "Active wallet not found. Please create or select a wallet.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    const decryptedPrivateKey = decrypt(walletData.privateKey);
    const wallet = new ethers.Wallet(decryptedPrivateKey, provider);

    const { balanceInAmb, balanceInUsd } = await getWalletBalance(wallet);

    let tokenBalancesText = "";

    if (user.tokens && user.tokens.length > 0) {
      for (const token of user.tokens) {
        const tokenBalance = await getUserHoldings(
          wallet.address,
          token.address
        );
        const tokenPrice = await getTokenPriceFromPair(token.pairAddress);
        const tokenBalanceInUsd = tokenBalance * tokenPrice;
        tokenBalancesText += `💎 *${token.symbol}:* ${tokenBalance.toFixed(
          4
        )} (~$${tokenBalanceInUsd.toFixed(6)})\n`;
      }
    }

    let walletListText = "*Your Wallets:*\n";
    user.wallets.forEach((walletData, index) => {
      const isActive = index === user.currentWalletIndex ? " (Active)" : "";
      walletListText += `${index + 1}. ${shortenAddress(
        walletData.address
      )}${isActive}\n`;
    });

    const sentMessage = await bot.sendMessage(
      chatId,
      `${walletListText}\n\n🔑 *Active Wallet Address:* \`${
        wallet.address
      }\`\n\n🏦 *AMB:* ${balanceInAmb.toFixed(4)} AMB (~$${balanceInUsd.toFixed(
        3
      )})\n${tokenBalancesText}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Reveal Private Key", callback_data: "reveal_key" },
              { text: "Refresh Balance", callback_data: "refresh_balance" },
            ],
            [
              { text: "Send AMB", callback_data: "send_amb" },
              { text: "Receive", callback_data: "receive" },
            ],
            [{ text: "Manage Wallets", callback_data: "manage_wallets" }],
            [{ text: "Home", callback_data: "back_to_main" }],
          ],
          remove_keyboard: true,
        },
        disable_web_page_preview: true,
      }
    );

    // Delete the previous wallet info message if it exists
    if (user.lastWalletInfoMessageId) {
      try {
        await bot.deleteMessage(chatId, user.lastWalletInfoMessageId);
      } catch (error) {
        console.error("Error deleting old wallet info message:", error);
      }
    }

    // Store the message ID of the current wallet info message
    user.lastWalletInfoMessageId = sentMessage.message_id;
    await user.save();
  } catch (error) {
    console.error("Error in showWalletInfo:", error);
    bot.sendMessage(
      chatId,
      "❌ An error occurred while displaying your wallet information.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
  }
}

/**
 * Function to reveal the user's private key temporarily.
 * @param {String} chatId - The Telegram chat ID.
 */
async function revealPrivateKey(chatId) {
  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      bot.sendMessage(
        chatId,
        "User not found. Please use /start to initialize your account.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    const walletIndex = user.currentWalletIndex || 0;
    const walletData = user.wallets[walletIndex];
    if (!walletData) {
      bot.sendMessage(chatId, "Active wallet not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const decryptedPrivateKey = decrypt(walletData.privateKey);

    bot
      .sendMessage(
        chatId,
        `🔑 *Your Private Key:* \`${decryptedPrivateKey}\`\n\nMake sure to store this key securely.`,
        {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }
      )
      .then((sentMessage) => {
        setTimeout(() => {
          bot.deleteMessage(chatId, sentMessage.message_id).catch((error) => {
            console.error("Error deleting private key message:", error);
          });
        }, 20000); // Delete after 20 seconds
      });
  } catch (error) {
    console.error("Error in revealPrivateKey:", error);
    bot.sendMessage(
      chatId,
      "❌ An error occurred while revealing your private key.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
  }
}

/**
 * Function to show the receive information to the user.
 * @param {String} chatId - The Telegram chat ID.
 */
async function showReceiveInfo(chatId) {
  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      bot.sendMessage(
        chatId,
        "User not found. Please use /start to initialize your account.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    const walletIndex = user.currentWalletIndex || 0;
    const walletData = user.wallets[walletIndex];
    if (!walletData) {
      bot.sendMessage(
        chatId,
        "Active wallet not found. Please create or select a wallet.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    const walletAddress = walletData.address;

    bot.sendMessage(
      chatId,
      `📥 *Your Wallet Address:*\n\`${walletAddress}\`\n\nYou can receive tokens or AMB at this address.`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "Home", callback_data: "back_to_main" }]],
        },
      }
    );
  } catch (error) {
    console.error("Error in showReceiveInfo:", error);
    bot.sendMessage(
      chatId,
      "❌ An error occurred while displaying your receive information.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
  }
}

/**
 * Function to create a new wallet for the user.
 * @param {String} chatId - The Telegram chat ID.
 */
async function createNewWallet(chatId) {
  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      bot.sendMessage(
        chatId,
        "❌ User not found. Please use /start to initialize your account.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    const wallet = ethers.Wallet.createRandom().connect(provider);
    const encryptedPrivateKey = encrypt(wallet.privateKey);

    user.wallets.push({
      address: wallet.address,
      privateKey: encryptedPrivateKey,
    });
    user.currentWalletIndex = user.wallets.length - 1;
    await user.save();

    // Automatically add Swine token and set as currentToken
    const swineTokenExists = user.tokens.some(
      (token) =>
        token.address.toLowerCase() === SWINE_TOKEN_ADDRESS.toLowerCase()
    );
    if (!swineTokenExists) {
      const swineTokenData = await getTokenData(SWINE_TOKEN_ADDRESS);
      user.tokens.push(swineTokenData);
      user.currentToken = SWINE_TOKEN_ADDRESS;
      await user.save();
    } else {
      user.currentToken = SWINE_TOKEN_ADDRESS; // Ensure it's selected
      await user.save();
    }

    bot.sendMessage(
      chatId,
      "✅ New wallet created and set as active with Swine as default token.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );

    await showMainMenu(chatId);
  } catch (error) {
    console.error("Error in createNewWallet:", error);
    bot.sendMessage(
      chatId,
      "❌ An error occurred while creating a new wallet.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
  }
}

/**
 * Function to manage the addition of new tokens.
 * @param {String} chatId - The Telegram chat ID.
 * @param {String} tokenAddress - The token's Ethereum address.
 */
async function addNewToken(chatId, tokenAddress) {
  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      bot.sendMessage(chatId, "❌ User not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const pairAddress = await getPairAddress(tokenAddress);
    if (pairAddress) {
      const tokenData = await getTokenData(tokenAddress);
      user.tokens.push(tokenData);
      user.currentToken = tokenAddress;
      await user.save();

      bot.sendMessage(
        chatId,
        `✅ ${tokenData.name} ($${tokenData.symbol}) added successfully!`,
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      await showBuySellOptions(chatId);
    } else {
      bot.sendMessage(
        chatId,
        "❌ No pair found between AMB and the token address provided. Please enter another token address:",
        {
          reply_markup: { force_reply: true },
        }
      );
      userStates[chatId] = "waiting_for_token_address";
      await user.save();
    }
  } catch (error) {
    console.error("Error in addNewToken:", error);
    bot.sendMessage(chatId, "❌ An error occurred while adding the token.", {
      reply_markup: { remove_keyboard: true },
    });
  }
}

/**
 * Function to show the token selection menu.
 * @param {String} chatId - The Telegram chat ID.
 */
async function showTokenSelectionMenu(chatId) {
  try {
    const user = await User.findOne({ chatId });
    if (!user || user.tokens.length === 0) {
      bot.sendMessage(
        chatId,
        "❌ You have no tokens added. Please add a new token first.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "Add New Token", callback_data: "add_new_token" }],
              [{ text: "Home", callback_data: "back_to_main" }],
            ],
            remove_keyboard: true,
          },
        }
      );
      return;
    }

    const keyboard = user.tokens.map((token) => [
      {
        text: `${token.name} ($${token.symbol})`,
        callback_data: `select_token_${token.address}`,
      },
    ]);

    keyboard.push([{ text: "Home", callback_data: "back_to_main" }]);

    bot.sendMessage(chatId, "🔍 Select a token:", {
      reply_markup: {
        inline_keyboard: keyboard,
        remove_keyboard: true,
      },
    });
  } catch (error) {
    console.error("Error in showTokenSelectionMenu:", error);
    bot.sendMessage(
      chatId,
      "❌ An error occurred while displaying the token selection menu.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
  }
}

/**
 * Function to show the manage tokens menu.
 * @param {String} chatId - The Telegram chat ID.
 */
async function showManageTokensMenu(chatId) {
  try {
    const user = await User.findOne({ chatId });
    if (!user || user.tokens.length === 0) {
      bot.sendMessage(chatId, "❌ You have no tokens to manage.", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Add New Token", callback_data: "add_new_token" }],
            [{ text: "Home", callback_data: "back_to_main" }],
          ],
          remove_keyboard: true,
        },
      });
      return;
    }

    const keyboard = user.tokens.map((token) => [
      {
        text: `Remove ${token.name} ($${token.symbol})`,
        callback_data: `remove_token_${token.address}`,
      },
    ]);

    keyboard.push([{ text: "Home", callback_data: "back_to_main" }]);

    bot.sendMessage(chatId, "🛠️ Manage your tokens:", {
      reply_markup: {
        inline_keyboard: keyboard,
        remove_keyboard: true,
      },
    });
  } catch (error) {
    console.error("Error in showManageTokensMenu:", error);
    bot.sendMessage(
      chatId,
      "❌ An error occurred while displaying the manage tokens menu.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
  }
}

/**
 * Function to show the manage wallets menu.
 * @param {String} chatId - The Telegram chat ID.
 */
async function showManageWalletsMenu(chatId) {
  try {
    const user = await User.findOne({ chatId });
    if (!user || user.wallets.length === 0) {
      bot.sendMessage(chatId, "❌ You have no wallets to manage.", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Create New Wallet", callback_data: "create_wallet" }],
            [{ text: "Import Wallet", callback_data: "import_wallet" }],
            [{ text: "Home", callback_data: "back_to_main" }],
          ],
          remove_keyboard: true,
        },
      });
      return;
    }

    const keyboard = user.wallets.map((walletData, index) => {
      const isActive = index === user.currentWalletIndex ? " (Active)" : "";
      return [
        {
          text: `Wallet ${index + 1}: ${shortenAddress(
            walletData.address
          )}${isActive}`,
          callback_data: `switch_wallet_${index}`,
        },
        {
          text: "Remove",
          callback_data: `remove_wallet_${index}`,
        },
      ];
    });

    keyboard.push([
      { text: "Add New Wallet", callback_data: "create_wallet" },
      { text: "Import Wallet", callback_data: "import_wallet" },
    ]);
    keyboard.push([{ text: "Home", callback_data: "back_to_main" }]);

    bot.sendMessage(chatId, "🛠️ Manage your wallets:", {
      reply_markup: {
        inline_keyboard: keyboard,
        remove_keyboard: true,
      },
    });
  } catch (error) {
    console.error("Error in showManageWalletsMenu:", error);
    bot.sendMessage(
      chatId,
      "❌ An error occurred while displaying the manage wallets menu.",
      {
        reply_markup: { remove_keyboard: true },
      }
    );
  }
}

/**
 * Function to execute a buy transaction.
 * @param {String} chatId - The Telegram chat ID.
 * @param {Number} ambAmount - The amount of AMB to use for the purchase.
 */
async function executeBuy(chatId, ambAmount) {
  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      bot.sendMessage(chatId, "❌ User not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const walletIndex = user.currentWalletIndex || 0;
    const walletData = user.wallets[walletIndex];
    if (!walletData) {
      bot.sendMessage(chatId, "❌ Active wallet not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const decryptedPrivateKey = decrypt(walletData.privateKey);
    const wallet = new ethers.Wallet(decryptedPrivateKey, provider);

    const tokenAddress = user.currentToken;
    const tokenData = user.tokens.find(
      (token) => token.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (!tokenData) {
      bot.sendMessage(chatId, "❌ Selected token data not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    // Inform the user that the transaction is processing
    bot.sendMessage(chatId, "🔄 Processing your buy transaction...", {
      reply_markup: { remove_keyboard: true },
    });

    // Check if user is exempt from fees
    const isExempt = await isUserExemptFromFee(wallet.address);

    // Calculate tax and amount after tax
    const taxAmount = isExempt ? 0 : ambAmount * TAX_RATE;
    const amountAfterTax = ambAmount - taxAmount;

    // Truncate to 18 decimals to prevent underflow
    const truncatedAmount = truncateDecimals(amountAfterTax, 18);
    if (parseFloat(truncatedAmount) <= 0) {
      bot.sendMessage(
        chatId,
        "❌ The amount after tax is too small to process.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    // Convert amount to Wei
    let amountInWei;
    try {
      amountInWei = ethers.parseEther(truncatedAmount);
    } catch (error) {
      console.error("❌ Error parsing Ether:", error);
      bot.sendMessage(
        chatId,
        "❌ Failed to parse the amount. Please try a larger value.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
      return;
    }

    const path = [AMB_ADDRESS, tokenAddress];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

    try {
      // Send the tax amount to the fee address if not exempt
      if (taxAmount > 0) {
        const taxTx = await wallet.sendTransaction({
          to: FEE_ADDRESS,
          value: ethers.parseEther(truncateDecimals(taxAmount, 18)),
        });
        await taxTx.wait();
      }

      // Execute the swap
      const tx = await uniswapRouter
        .connect(wallet)
        .swapExactAMBForTokensSupportingFeeOnTransferTokens(
          0,
          path,
          wallet.address,
          deadline,
          {
            value: ethers.parseEther(truncatedAmount),
            gasLimit: 300000, // Adjust as needed
          }
        );

      bot.sendMessage(
        chatId,
        `🔄 Swap initiated. Waiting for confirmation...\n🔗 [View Transaction](https://airdao.io/explorer/tx/${tx.hash})`,
        {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        bot.sendMessage(
          chatId,
          `✅ Transaction successful! 🔗 [View on Explorer](https://airdao.io/explorer/tx/${tx.hash})`,
          {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }
        );

        // Record the transaction for profit/loss calculation
        const usdSpent =
          parseFloat(truncatedAmount) * (await getAmbPriceInUSD());
        user.transactions.push({
          tokenAddress,
          type: "buy",
          amount: parseFloat(truncatedAmount),
          usdValue: usdSpent,
          txHash: tx.hash,
          createdAt: new Date(),
        });
        await user.save();
      } else {
        bot.sendMessage(
          chatId,
          "❌ Transaction failed. Please check the details and try again.",
          {
            reply_markup: { remove_keyboard: true },
          }
        );
      }

      // Refresh the buy/sell options
      await showBuySellOptions(chatId);
    } catch (error) {
      console.error("❌ Transaction failed:", error);
      if (error.code === "INSUFFICIENT_FUNDS") {
        bot.sendMessage(
          chatId,
          "❌ Error: Insufficient funds to execute the swap.",
          {
            reply_markup: { remove_keyboard: true },
          }
        );
      } else if (error.code === "CALL_EXCEPTION") {
        bot.sendMessage(
          chatId,
          "❌ Error: The transaction was reverted. Please check the token contract or the path.",
          {
            reply_markup: { remove_keyboard: true },
          }
        );
      } else {
        bot.sendMessage(
          chatId,
          "❌ An error occurred while executing the swap.",
          {
            reply_markup: { remove_keyboard: true },
          }
        );
      }
    }
  } catch (error) {
    console.error("❌ executeBuy Error:", error);
    bot.sendMessage(chatId, "❌ An error occurred while executing the swap.", {
      reply_markup: { remove_keyboard: true },
    });
  }
}

/**
 * Function to execute a sell transaction.
 * @param {String} chatId - The Telegram chat ID.
 * @param {Number} tokenAmount - The amount of tokens to sell.
 */
async function executeSell(chatId, tokenAmount) {
  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      bot.sendMessage(chatId, "❌ User not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const walletIndex = user.currentWalletIndex || 0;
    const walletData = user.wallets[walletIndex];
    if (!walletData) {
      bot.sendMessage(chatId, "❌ Active wallet not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const decryptedPrivateKey = decrypt(walletData.privateKey);
    const wallet = new ethers.Wallet(decryptedPrivateKey, provider);

    const tokenAddress = user.currentToken;
    const tokenData = user.tokens.find(
      (token) => token.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (!tokenData) {
      bot.sendMessage(chatId, "❌ Selected token data not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    // Inform the user that the transaction is processing
    bot.sendMessage(chatId, "🔄 Processing your sell transaction...", {
      reply_markup: { remove_keyboard: true },
    });

    // Check if user is exempt from fees
    const isExempt = await isUserExemptFromFee(wallet.address);

    // Get the token contract connected with the wallet
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, wallet);

    const amountInWei = ethers.parseEther(tokenAmount.toString());
    const path = [tokenAddress, AMB_ADDRESS];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

    try {
      // Check allowance
      const allowance = await tokenContract.allowance(
        wallet.address,
        UNISWAP_ROUTER_ADDRESS
      );
      if (allowance < amountInWei) {
        bot.sendMessage(chatId, "🔄 Approving token allowance...", {
          reply_markup: { remove_keyboard: true },
        });

        const approveTx = await tokenContract.approve(
          UNISWAP_ROUTER_ADDRESS,
          ethers.MaxUint256
        );
        await approveTx.wait();

        bot.sendMessage(chatId, "✅ Token allowance approved successfully!", {
          reply_markup: { remove_keyboard: true },
        });
      }

      // Execute the swap
      const tx = await uniswapRouter
        .connect(wallet)
        .swapExactTokensForAMBSupportingFeeOnTransferTokens(
          amountInWei,
          0,
          path,
          wallet.address,
          deadline,
          {
            gasLimit: 300000, // Adjust as needed
          }
        );

      bot.sendMessage(
        chatId,
        `🔄 Swap initiated. Waiting for confirmation...\n🔗 [View Transaction](https://airdao.io/explorer/tx/${tx.hash})`,
        {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        bot.sendMessage(
          chatId,
          `✅ Transaction successful! 🔗 [View on Explorer](https://airdao.io/explorer/tx/${tx.hash})`,
          {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }
        );

        // Get the amount of AMB received
        const ambReceived = await getAmbReceivedFromSwap(tx.hash);

        // Calculate the tax and the amount after tax
        const taxAmount = isExempt ? 0 : ambReceived * TAX_RATE;
        const amountAfterTax = ambReceived - taxAmount;

        // Send the tax amount to the fee address if not exempt
        if (taxAmount > 0) {
          const taxTx = await wallet.sendTransaction({
            to: FEE_ADDRESS,
            value: ethers.parseEther(truncateDecimals(taxAmount, 18)),
          });
          await taxTx.wait();
        }

        // Record the transaction for profit/loss calculation
        const usdReceived = amountAfterTax * (await getAmbPriceInUSD());
        user.transactions.push({
          tokenAddress,
          type: "sell",
          amount: tokenAmount,
          usdValue: usdReceived,
          txHash: tx.hash,
          createdAt: new Date(),
        });
        await user.save();
      } else {
        bot.sendMessage(
          chatId,
          "❌ Transaction failed. Please check the details and try again.",
          {
            reply_markup: { remove_keyboard: true },
          }
        );
      }

      // Refresh the buy/sell options
      await showBuySellOptions(chatId);
    } catch (error) {
      console.error("❌ Transaction failed:", error);
      if (error.code === "INSUFFICIENT_FUNDS") {
        bot.sendMessage(
          chatId,
          "❌ Error: Insufficient funds to execute the swap.",
          {
            reply_markup: { remove_keyboard: true },
          }
        );
      } else if (error.code === "CALL_EXCEPTION") {
        bot.sendMessage(
          chatId,
          "❌ Error: The transaction was reverted. Please check the token contract or the path.",
          {
            reply_markup: { remove_keyboard: true },
          }
        );
      } else {
        bot.sendMessage(
          chatId,
          "❌ An error occurred while executing the swap.",
          {
            reply_markup: { remove_keyboard: true },
          }
        );
      }
    }
  } catch (error) {
    console.error("❌ executeSell Error:", error);
    bot.sendMessage(chatId, "❌ An error occurred while executing the swap.", {
      reply_markup: { remove_keyboard: true },
    });
  }
}

/**
 * Function to send tokens to a recipient.
 * @param {String} chatId - The Telegram chat ID.
 * @param {String} recipientAddress - The recipient's Ethereum address.
 * @param {Number} amount - The amount of tokens to send.
 */
async function sendToken(chatId, recipientAddress, amount) {
  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      bot.sendMessage(chatId, "❌ User not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const walletIndex = user.currentWalletIndex || 0;
    const walletData = user.wallets[walletIndex];
    if (!walletData) {
      bot.sendMessage(chatId, "❌ Active wallet not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const decryptedPrivateKey = decrypt(walletData.privateKey);
    const wallet = new ethers.Wallet(decryptedPrivateKey, provider);

    const tokenAddress = user.currentToken;
    const tokenData = user.tokens.find(
      (token) => token.address.toLowerCase() === tokenAddress.toLowerCase()
    );
    if (!tokenData) {
      bot.sendMessage(chatId, "❌ Selected token data not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, wallet);
    const amountInWei = ethers.parseEther(amount.toString());

    bot.sendMessage(chatId, "🔄 Processing your token transfer...", {
      reply_markup: { remove_keyboard: true },
    });

    const tx = await tokenContract.transfer(recipientAddress, amountInWei);
    const receipt = await tx.wait();

    if (receipt && receipt.status === 1) {
      bot.sendMessage(
        chatId,
        `✅ Token sent successfully!\n🔗 [View Transaction](https://airdao.io/explorer/tx/${tx.hash})`,
        {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }
      );
    } else {
      bot.sendMessage(chatId, "❌ Token transfer failed. Please try again.", {
        reply_markup: { remove_keyboard: true },
      });
    }

    await showBuySellOptions(chatId);
  } catch (error) {
    console.error("❌ sendToken Error:", error);
    if (error.code === "INSUFFICIENT_FUNDS") {
      bot.sendMessage(
        chatId,
        "❌ Error: Insufficient token balance to execute the transfer.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
    } else {
      bot.sendMessage(
        chatId,
        "❌ An error occurred while transferring the token.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
    }
  }
}

/**
 * Function to send AMB to a recipient.
 * @param {String} chatId - The Telegram chat ID.
 * @param {String} recipientAddress - The recipient's Ethereum address.
 * @param {Number} amount - The amount of AMB to send.
 */
async function sendAmb(chatId, recipientAddress, amount) {
  try {
    const user = await User.findOne({ chatId });
    if (!user) {
      bot.sendMessage(chatId, "❌ User not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const walletIndex = user.currentWalletIndex || 0;
    const walletData = user.wallets[walletIndex];
    if (!walletData) {
      bot.sendMessage(chatId, "❌ Active wallet not found.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const decryptedPrivateKey = decrypt(walletData.privateKey);
    const wallet = new ethers.Wallet(decryptedPrivateKey, provider);

    const amountInWei = ethers.parseEther(amount.toString());

    bot.sendMessage(chatId, "🔄 Processing your AMB transfer...", {
      reply_markup: { remove_keyboard: true },
    });

    const tx = await wallet.sendTransaction({
      to: recipientAddress,
      value: amountInWei,
    });
    const receipt = await tx.wait();

    if (receipt && receipt.status === 1) {
      bot.sendMessage(
        chatId,
        `✅ AMB sent successfully!\n🔗 [View Transaction](https://airdao.io/explorer/tx/${tx.hash})`,
        {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }
      );
    } else {
      bot.sendMessage(chatId, "❌ AMB transfer failed. Please try again.", {
        reply_markup: { remove_keyboard: true },
      });
    }

    await showMainMenu(chatId);
  } catch (error) {
    console.error("❌ sendAmb Error:", error);
    if (error.code === "INSUFFICIENT_FUNDS") {
      bot.sendMessage(
        chatId,
        "❌ Error: Insufficient AMB balance to execute the transfer.",
        {
          reply_markup: { remove_keyboard: true },
        }
      );
    } else {
      bot.sendMessage(chatId, "❌ An error occurred while transferring AMB.", {
        reply_markup: { remove_keyboard: true },
      });
    }
  }
}

/**
 * Function to send AMB received from a swap transaction.
 * @param {String} txHash - The transaction hash.
 * @returns {Number} - The amount of AMB received.
 */
async function getAmbReceivedFromSwap(txHash) {
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    const logs = receipt.logs;
    let ambReceived = 0;

    // Parse logs to find Transfer events to the user's wallet
    for (let log of logs) {
      try {
        const parsedLog = uniswapRouter.interface.parseLog(log);
        if (parsedLog.name === "Transfer") {
          const { to, value } = parsedLog.args;
          // Assuming AMB token transfers, check if 'to' is the user's address
          // Adjust this logic based on actual event signatures and token contracts
          ambReceived += parseFloat(ethers.formatEther(value));
        }
      } catch (e) {
        // Ignore logs that cannot be parsed
      }
    }

    return ambReceived;
  } catch (error) {
    console.error("Error in getAmbReceivedFromSwap:", error);
    return 0;
  }
}

// Start polling
bot.startPolling();
