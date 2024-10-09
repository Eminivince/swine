const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");
const { ethers } = require("ethers");

// Replace with your actual bot token
const bot = new TelegramBot("7959000600:AAFuwJRC3VL18UOUfoyOm63Gu1TOGTIXFrQ", {
  polling: true,
});

// Replace with your network RPC URL
const provider = new ethers.JsonRpcProvider("https://network.ambrosus.io");

function shortenAddress(address) {
  return `${address.slice(0, 6)}......${address.slice(-4)}`;
}

// Uniswap Router Address and Token Address
const UNISWAP_ROUTER_ADDRESS = "0xf7237C595425b49Eaeb3Dc930644de6DCa09c3C4";
const TOKEN_ADDRESS = "0x3669540fA80d0b2EebedfB88b9BAF7855EB1149d";
const PAIR_ADDRESS = "0x6b339A7C07e1761Cfa04d63BC98f72bC82Bc7445"; // Uniswap Pair address

// ABI for Token and Pair Contract
const tokenAbi = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const pairAbi = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
];

// ABI for Uniswap Router (Assuming you have this ABI defined somewhere)
const uniswapRouterAbi = [
  {
    inputs: [
      {
        internalType: "address",
        name: "_factory",
        type: "address",
      },
      {
        internalType: "address",
        name: "_SAMB",
        type: "address",
      },
    ],
    stateMutability: "payable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "SAMB",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "tokenA",
        type: "address",
      },
      {
        internalType: "address",
        name: "tokenB",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amountADesired",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountBDesired",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountAMin",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountBMin",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "addLiquidity",
    outputs: [
      {
        internalType: "uint256",
        name: "amountA",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountB",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "liquidity",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "amountTokenDesired",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountTokenMin",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountAMBMin",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "addLiquidityAMB",
    outputs: [
      {
        internalType: "uint256",
        name: "amountToken",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountAMB",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "liquidity",
        type: "uint256",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "factory",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountOut",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "reserveIn",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "reserveOut",
        type: "uint256",
      },
    ],
    name: "getAmountIn",
    outputs: [
      {
        internalType: "uint256",
        name: "amountIn",
        type: "uint256",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountIn",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "reserveIn",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "reserveOut",
        type: "uint256",
      },
    ],
    name: "getAmountOut",
    outputs: [
      {
        internalType: "uint256",
        name: "amountOut",
        type: "uint256",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountOut",
        type: "uint256",
      },
      {
        internalType: "address[]",
        name: "path",
        type: "address[]",
      },
    ],
    name: "getAmountsIn",
    outputs: [
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountIn",
        type: "uint256",
      },
      {
        internalType: "address[]",
        name: "path",
        type: "address[]",
      },
    ],
    name: "getAmountsOut",
    outputs: [
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountA",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "reserveA",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "reserveB",
        type: "uint256",
      },
    ],
    name: "quote",
    outputs: [
      {
        internalType: "uint256",
        name: "amountB",
        type: "uint256",
      },
    ],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "tokenA",
        type: "address",
      },
      {
        internalType: "address",
        name: "tokenB",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "liquidity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountAMin",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountBMin",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "removeLiquidity",
    outputs: [
      {
        internalType: "uint256",
        name: "amountA",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountB",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "liquidity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountTokenMin",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountAMBMin",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "removeLiquidityAMB",
    outputs: [
      {
        internalType: "uint256",
        name: "amountToken",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountAMB",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "liquidity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountTokenMin",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountAMBMin",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "removeLiquidityAMBSupportingFeeOnTransferTokens",
    outputs: [
      {
        internalType: "uint256",
        name: "amountAMB",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "liquidity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountTokenMin",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountAMBMin",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "approveMax",
        type: "bool",
      },
      {
        internalType: "uint8",
        name: "v",
        type: "uint8",
      },
      {
        internalType: "bytes32",
        name: "r",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "s",
        type: "bytes32",
      },
    ],
    name: "removeLiquidityAMBWithPermit",
    outputs: [
      {
        internalType: "uint256",
        name: "amountToken",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountAMB",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "token",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "liquidity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountTokenMin",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountAMBMin",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "approveMax",
        type: "bool",
      },
      {
        internalType: "uint8",
        name: "v",
        type: "uint8",
      },
      {
        internalType: "bytes32",
        name: "r",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "s",
        type: "bytes32",
      },
    ],
    name: "removeLiquidityAMBWithPermitSupportingFeeOnTransferTokens",
    outputs: [
      {
        internalType: "uint256",
        name: "amountAMB",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "tokenA",
        type: "address",
      },
      {
        internalType: "address",
        name: "tokenB",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "liquidity",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountAMin",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountBMin",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
      {
        internalType: "bool",
        name: "approveMax",
        type: "bool",
      },
      {
        internalType: "uint8",
        name: "v",
        type: "uint8",
      },
      {
        internalType: "bytes32",
        name: "r",
        type: "bytes32",
      },
      {
        internalType: "bytes32",
        name: "s",
        type: "bytes32",
      },
    ],
    name: "removeLiquidityWithPermit",
    outputs: [
      {
        internalType: "uint256",
        name: "amountA",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountB",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountOut",
        type: "uint256",
      },
      {
        internalType: "address[]",
        name: "path",
        type: "address[]",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "swapAMBForExactTokens",
    outputs: [
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountOutMin",
        type: "uint256",
      },
      {
        internalType: "address[]",
        name: "path",
        type: "address[]",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "swapExactAMBForTokens",
    outputs: [
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountOutMin",
        type: "uint256",
      },
      {
        internalType: "address[]",
        name: "path",
        type: "address[]",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "swapExactAMBForTokensSupportingFeeOnTransferTokens",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountIn",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountOutMin",
        type: "uint256",
      },
      {
        internalType: "address[]",
        name: "path",
        type: "address[]",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "swapExactTokensForAMB",
    outputs: [
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountIn",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountOutMin",
        type: "uint256",
      },
      {
        internalType: "address[]",
        name: "path",
        type: "address[]",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "swapExactTokensForAMBSupportingFeeOnTransferTokens",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountIn",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountOutMin",
        type: "uint256",
      },
      {
        internalType: "address[]",
        name: "path",
        type: "address[]",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "swapExactTokensForTokens",
    outputs: [
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountIn",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountOutMin",
        type: "uint256",
      },
      {
        internalType: "address[]",
        name: "path",
        type: "address[]",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountOut",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountInMax",
        type: "uint256",
      },
      {
        internalType: "address[]",
        name: "path",
        type: "address[]",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "swapTokensForExactAMB",
    outputs: [
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "uint256",
        name: "amountOut",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amountInMax",
        type: "uint256",
      },
      {
        internalType: "address[]",
        name: "path",
        type: "address[]",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "swapTokensForExactTokens",
    outputs: [
      {
        internalType: "uint256[]",
        name: "amounts",
        type: "uint256[]",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    stateMutability: "payable",
    type: "receive",
  },
];

// Creating Uniswap Router Contract Instance
const uniswapRouter = new ethers.Contract(
  UNISWAP_ROUTER_ADDRESS,
  uniswapRouterAbi,
  provider
);

// Store users' wallets
let userWallets = {};

// Function to generate or retrieve the user's wallet
function generateOrRetrieveWallet(chatId) {
  let wallet = userWallets[chatId];
  if (!wallet) {
    wallet = ethers.Wallet.createRandom().connect(provider);
    userWallets[chatId] = wallet;
  }
  return wallet;
}

// Function to get AMB balance and USD value
async function getWalletBalance(wallet) {
  const balance = await provider.getBalance(wallet.address);
  const balanceInAmb = parseFloat(ethers.formatEther(balance));
  const usdPrice = await getAmbPriceInUSD();
  const balanceInUsd = balanceInAmb * usdPrice;
  return { balanceInAmb, balanceInUsd };
}

// Function to get the AMB price in USD
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

// Function to get the token price from Uniswap Pair contract
async function getTokenPriceFromPair() {
  const pairContract = new ethers.Contract(PAIR_ADDRESS, pairAbi, provider);
  const { reserve0, reserve1 } = await pairContract.getReserves();

  // Assume reserve0 is AMB and reserve1 is the token
  const ambReserve = parseFloat(ethers.formatEther(reserve0));
  const tokenReserve = parseFloat(ethers.formatEther(reserve1));

  const tokenPriceInAmb = ambReserve / tokenReserve;

  // Fetch the current AMB price in USD
  const ambPriceInUsd = await getAmbPriceInUSD();
  return tokenPriceInAmb * ambPriceInUsd;
}

// Function to calculate market cap
async function calculateMarketCap() {
  const tokenContract = new ethers.Contract(TOKEN_ADDRESS, tokenAbi, provider);
  const totalSupply = await tokenContract.totalSupply();
  const totalSupplyInEther = parseFloat(ethers.formatEther(totalSupply));

  const tokenPrice = await getTokenPriceFromPair();
  const marketCap = totalSupplyInEther * tokenPrice;

  return {
    tokenPrice,
    marketCap,
  };
}

// Function to fetch user token holdings
async function getUserHoldings(walletAddress) {
  const tokenContract = new ethers.Contract(TOKEN_ADDRESS, tokenAbi, provider);
  const tokenBalance = await tokenContract.balanceOf(walletAddress);
  return parseFloat(ethers.formatEther(tokenBalance));
}

// Function to display buy/sell options with token data
// Function to display buy/sell options with token data
async function showBuySellOptions(chatId, messageId = null) {
  const wallet = userWallets[chatId];
  if (!wallet) {
    bot.sendMessage(
      chatId,
      "No wallet found. Please import or generate a wallet first."
    );
    return;
  }

  // Get token price, market cap, and user holdings
  const { tokenPrice, marketCap } = await calculateMarketCap();
  const userHoldings = await getUserHoldings(wallet.address);
  const userHoldingsValueInUSD = userHoldings * tokenPrice;

  // Prepare the message text
  const messageText = `✅ Token: Swiss Wine\n📌 Ticker: $SWINE\n\n🏷️ Price: $${tokenPrice.toFixed(
    7
  )} USD\n🏪 Market Cap: $${marketCap.toFixed(
    4
  )} USD\n🏦 Holdings: ${userHoldings.toFixed(
    2
  )} $SWINE\n💸 Worth: $${userHoldingsValueInUSD.toFixed(3)} USD`;

  // Prepare the inline keyboard with the Refresh button
  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Buy X", callback_data: "buy_x" },
          { text: "Sell X", callback_data: "sell_x" },
        ],
        [
          { text: "Buy X % of wallet", callback_data: "buy_x_percent" },
          { text: "Sell X % of tokens", callback_data: "sell_x_percent" },
        ],
        [{ text: "Refresh", callback_data: "refresh_token_details" }],
        [{ text: "Wallet", callback_data: "view_wallet" }],
      ],
    },
    parse_mode: "Markdown",
  };

  if (messageId) {
    // Edit the existing message
    options.chat_id = chatId;
    options.message_id = messageId;
    bot
      .editMessageText(messageText, options)
      .catch((error) => console.error("Error editing message:", error));
  } else {
    // Send a new message and capture the message_id if needed
    bot.sendMessage(chatId, messageText, options);
  }
}

// Function to show the main menu
async function showMainMenu(chatId) {
  const wallet = generateOrRetrieveWallet(chatId);
  const { balanceInAmb } = await getWalletBalance(wallet);

  if (balanceInAmb > 0) {
    // Show buy/sell options
    await showBuySellOptions(chatId);
  } else {
    // Ask the user to deposit AMB
    bot.sendMessage(
      chatId,
      `🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀\n\nWelcome to $SWINE trading bot built by the *$SWINE* community!\n\nWe have created a wallet for you on AirDAO network, alternatively, you may import your own wallet.\n\nYou currently have no AMB in your wallet.\n\nTo start trading, deposit AMB to your $SWINE_bot wallet address:\`${wallet.address}\`\n\nFor more info on your wallet and to retrieve your private key, tap the wallet button below.\n\n 🚨 Protect your private keys. $SWINE community will not be responsible for any loss of funds! \n\nTelegram: https://t.me/swine_coin`,
      {
        parse_mode: "Markdown",
        // disable_web_page_preview: true, // Disable link previews
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Wallet", callback_data: "view_wallet" },
              { text: "Import Wallet", callback_data: "import_wallet" },
            ],
            [{ text: "Refresh Balance", callback_data: "refresh_balance" }],
          ],
        },
      }
    );
  }
}

// Listen for the "/start" command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await showMainMenu(chatId);
});

// Listen for callback queries (button clicks)
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const wallet = generateOrRetrieveWallet(chatId);

  if (data === "view_wallet") {
    // Show wallet info
    await showWalletInfo(chatId);
  } else if (data === "import_wallet") {
    // Ask user to input private key
    bot.sendMessage(chatId, "Please enter your private key:");
    bot.once("message", async (msg) => {
      const privateKey = msg.text.trim();
      try {
        const importedWallet = new ethers.Wallet(privateKey, provider);
        userWallets[chatId] = importedWallet;
        bot.sendMessage(chatId, "Wallet imported successfully! 🎉");
        await showMainMenu(chatId);
      } catch (error) {
        bot.sendMessage(chatId, "Invalid private key. Please try again.");
      }
    });
  } else if (data === "refresh_balance") {
    // Refresh balance
    await showMainMenu(chatId);
  } else if (data === "reveal_key") {
    // Reveal private key temporarily
    bot
      .sendMessage(
        chatId,
        `🔑 *Your Private Key:* \`${wallet.privateKey}\`\n\nMake sure to store this key securely.`,
        { parse_mode: "Markdown" }
      )
      .then((sentMessage) => {
        setTimeout(() => {
          bot.deleteMessage(chatId, sentMessage.message_id);
        }, 20000); // Delete after 20 seconds
      });
  } else if (data === "back_to_main") {
    // Go back to the main menu
    await showMainMenu(chatId);
  } else if (data === "buy_x" || data === "buy_x_percent") {
    // Handle buy options
    await handleBuyOptions(chatId, data);
  } else if (data === "sell_x" || data === "sell_x_percent") {
    // Handle sell options
    await handleSellOptions(chatId, data);
  } else if (data === "refresh_token_details") {
    // Refresh the token details and edit the existing message
    await showBuySellOptions(chatId, messageId);
  }
});

// Function to display wallet info
async function showWalletInfo(chatId) {
  const wallet = generateOrRetrieveWallet(chatId);
  const { balanceInAmb, balanceInUsd } = await getWalletBalance(wallet);
  const tokenBalance = await getUserHoldings(wallet.address);
  const tokenBalanceInUsd = tokenBalance * (await getTokenPriceFromPair());

  bot.sendMessage(
    chatId,
    `🔑 *Wallet Address:* \`${
      wallet.address
    }\`\n\n🏦 *AMB:* ${balanceInAmb.toFixed(4)} AMB (~$${balanceInUsd.toFixed(
      3
    )})\n💎 *SWINE:* ${tokenBalance.toFixed(4)} (~$${tokenBalanceInUsd.toFixed(
      6
    )})`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Reveal Private Key", callback_data: "reveal_key" },
            { text: "Refresh Balance", callback_data: "refresh_balance" },
          ],
          [{ text: "Back", callback_data: "back_to_main" }],
        ],
      },
    }
  );
}

// Function to handle buy options
async function handleBuyOptions(chatId, data) {
  const wallet = userWallets[chatId];
  const balance = await provider.getBalance(wallet.address);
  const balanceInAmb = parseFloat(ethers.formatEther(balance));

  if (balanceInAmb <= 0) {
    bot.sendMessage(
      chatId,
      "You have insufficient AMB balance to make a purchase. Please deposit AMB to your wallet."
    );
    return;
  }

  if (data === "buy_x") {
    bot.sendMessage(
      chatId,
      "Please enter the amount of AMB you want to use for the purchase:"
    );
    bot.once("message", (msg) => {
      const ambAmount = parseFloat(msg.text.trim());
      if (!isNaN(ambAmount) && ambAmount > 0 && ambAmount <= balanceInAmb) {
        executeBuy(chatId, ambAmount);
      } else {
        bot.sendMessage(
          chatId,
          "Invalid amount. Please enter a valid number within your balance."
        );
      }
    });
  } else if (data === "buy_x_percent") {
    bot.sendMessage(
      chatId,
      "Enter the percentage of your AMB balance you want to spend (e.g., 50 for 50%):"
    );
    bot.once("message", (msg) => {
      const percent = parseFloat(msg.text.trim());
      if (!isNaN(percent) && percent > 0 && percent <= 100) {
        const ambAmount = (percent / 100) * balanceInAmb;
        executeBuy(chatId, ambAmount);
      } else {
        bot.sendMessage(
          chatId,
          "Invalid percentage. Please enter a valid number between 1 and 100."
        );
      }
    });
  }
}

// Function to handle sell options
async function handleSellOptions(chatId, data) {
  const wallet = userWallets[chatId];
  const tokenBalance = await getUserHoldings(wallet.address);

  if (tokenBalance <= 0) {
    bot.sendMessage(
      chatId,
      "You have no tokens to sell. Please buy some tokens first."
    );
    return;
  }

  if (data === "sell_x") {
    bot.sendMessage(
      chatId,
      "Please enter the amount of tokens you want to sell:"
    );
    bot.once("message", (msg) => {
      const tokenAmount = parseFloat(msg.text.trim());
      if (
        !isNaN(tokenAmount) &&
        tokenAmount > 0 &&
        tokenAmount <= tokenBalance
      ) {
        executeSell(chatId, tokenAmount);
      } else {
        bot.sendMessage(
          chatId,
          "Invalid amount. Please enter a valid number within your token balance."
        );
      }
    });
  } else if (data === "sell_x_percent") {
    bot.sendMessage(
      chatId,
      "Enter the percentage of your token balance you want to sell (e.g., 50 for 50%):"
    );
    bot.once("message", (msg) => {
      const percent = parseFloat(msg.text.trim());
      if (!isNaN(percent) && percent > 0 && percent <= 100) {
        const tokenAmount = (percent / 100) * tokenBalance;
        executeSell(chatId, tokenAmount);
      } else {
        bot.sendMessage(
          chatId,
          "Invalid percentage. Please enter a valid number between 1 and 100."
        );
      }
    });
  }
}

// Function to execute a buy transaction
async function executeBuy(chatId, ambAmount) {
  const wallet = userWallets[chatId];

  const amountInWei = ethers.parseEther(ambAmount.toString());

  const path = ["0x2b2d892C3fe2b4113dd7aC0D2c1882AF202FB28F", TOKEN_ADDRESS]; // AMB -> Token

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  try {
    // Estimate gas
    const estimatedGas = await provider.estimateGas({
      to: UNISWAP_ROUTER_ADDRESS,
      value: amountInWei,
      data: uniswapRouter.interface.encodeFunctionData(
        "swapExactAMBForTokens",
        [0, path, wallet.address, deadline]
      ),
    });

    console.log(`Estimated Gas: ${estimatedGas.toString()}`);

    // Send the transaction
    const tx = await wallet.sendTransaction({
      to: UNISWAP_ROUTER_ADDRESS,
      value: amountInWei,
      gasLimit: estimatedGas + BigInt(100000), // Use the estimated gas
      //   gasLimit: estimatedGas.add(ethers.BigNumber.from("100000")), // Adding buffer
      data: uniswapRouter.interface.encodeFunctionData(
        "swapExactAMBForTokens",
        [0, path, wallet.address, deadline]
      ),
    });

    // Helper function to format Ethereum addresses

    const shtAdds = shortenAddress(tx.hash);

    bot
      .sendMessage(
        chatId,
        `Swap initiated: https://airdao.io/tx/${shtAdds} \n...waiting for confirmation...`
      )
      .then((sentMessage) => {
        setTimeout(() => {
          bot.deleteMessage(chatId, sentMessage.message_id);
        }, 20000); // Delete after 20 seconds
      });

    // Wait for the transaction to be mined
    const receipt = await provider.waitForTransaction(tx.hash);

    if (receipt && receipt.status === 1) {
      // Transaction was successful

      bot
        .sendMessage(
          chatId,
          `Transaction successful: https://airdao.io/tx/${shtAdds}`
        )
        .then((sentMessage) => {
          setTimeout(() => {
            bot.deleteMessage(chatId, sentMessage.message_id);
          }, 20000); // Delete after 20 seconds
        });
    } else {
      // Transaction failed
      bot.sendMessage(
        chatId,
        "Transaction failed. Please check the details and try again."
      );
    }

    showBuySellOptions(chatId);
  } catch (error) {
    console.error("Transaction failed", error);

    if (error.code === "INSUFFICIENT_FUNDS") {
      bot.sendMessage(chatId, "Error: Insufficient funds to execute the swap.");
    } else if (error.code === "CALL_EXCEPTION") {
      bot.sendMessage(chatId, "Error: The transaction was reverted.");
    } else {
      bot.sendMessage(chatId, "An error occurred while executing the swap.");
    }
  }
}

// Function to execute a sell transaction
async function executeSell(chatId, tokenAmount) {
  const wallet = userWallets[chatId];
  const tokenContract = new ethers.Contract(TOKEN_ADDRESS, tokenAbi, wallet);

  const amountInWei = ethers.parseEther(tokenAmount.toString());
  const path = [TOKEN_ADDRESS, "0x2b2d892C3fe2b4113dd7aC0D2c1882AF202FB28F"]; // Token -> AMB

  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

  try {
    // Check current allowance
    const allowance = await tokenContract.allowance(
      wallet.address,
      UNISWAP_ROUTER_ADDRESS
    );

    if (allowance < amountInWei) {
      // Need to approve the router to spend tokens
      bot
        .sendMessage(chatId, "Approving token allowance...")
        .then((sentMessage) => {
          setTimeout(() => {
            bot.deleteMessage(chatId, sentMessage.message_id);
          }, 20000); // Delete after 20 seconds
        });

      const approveTx = await tokenContract.approve(
        UNISWAP_ROUTER_ADDRESS,
        ethers.MaxUint256 // Approve maximum amount
      );
      await approveTx.wait();

      bot
        .sendMessage(chatId, "Token allowance approved successfully!")
        .then((sentMessage) => {
          setTimeout(() => {
            bot.deleteMessage(chatId, sentMessage.message_id);
          }, 20000); // Delete after 20 seconds
        });
    }

    // Estimate gas
    const estimatedGas = await provider.estimateGas({
      from: wallet.address,
      to: UNISWAP_ROUTER_ADDRESS,
      data: uniswapRouter.interface.encodeFunctionData(
        "swapExactTokensForAMBSupportingFeeOnTransferTokens", // Update function name if needed
        [amountInWei, 0, path, wallet.address, deadline]
      ),
    });

    console.log(`Estimated Gas: ${estimatedGas.toString()}`);

    // Send the transaction
    const tx = await uniswapRouter
      .connect(wallet)
      .swapExactTokensForAMBSupportingFeeOnTransferTokens(
        amountInWei,
        0,
        path,
        wallet.address,
        deadline,
        {
          gasLimit: estimatedGas + BigInt(100000), // Use the estimated gas
        }
      );

    const shtAdds = shortenAddress(tx.hash);

    bot
      .sendMessage(chatId, `Swap initiated: https://airdao.io/tx/${shtAdds}`)
      .then((sentMessage) => {
        setTimeout(() => {
          bot.deleteMessage(chatId, sentMessage.message_id);
        }, 20000); // Delete after 20 seconds
      });

    // Wait for the transaction to be mined
    const receipt = await tx.wait();

    if (receipt && receipt.status === 1) {
      // Transaction was successful
      bot
        .sendMessage(
          chatId,
          `Transaction successful: https://airdao.io/tx/${shtAdds}`
        )
        .then((sentMessage) => {
          setTimeout(() => {
            bot.deleteMessage(chatId, sentMessage.message_id);
          }, 20000); // Delete after 20 seconds
        });
    } else {
      // Transaction failed
      bot
        .sendMessage(
          chatId,
          "Transaction failed. Please check the details and try again."
        )
        .then((sentMessage) => {
          setTimeout(() => {
            bot.deleteMessage(chatId, sentMessage.message_id);
          }, 20000); // Delete after 20 seconds
        });
    }

    showBuySellOptions(chatId);
  } catch (error) {
    console.error("Transaction failed", error);

    if (error.code === "INSUFFICIENT_FUNDS") {
      bot.sendMessage(chatId, "Error: Insufficient funds to execute the swap.");
    } else if (error.code === "CALL_EXCEPTION") {
      bot.sendMessage(chatId, "Error: The transaction was reverted.");
    } else {
      console.error("Transaction failed", error);
      bot.sendMessage(chatId, "An error occurred while executing the swap.");
    }
  }
}

// Start polling
bot.startPolling();
