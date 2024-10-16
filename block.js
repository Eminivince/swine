const axios = require("axios");
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Load environment variables from .env file if needed
// require("dotenv").config();

// Initialize Ethereum provider for Ambrosus network
const provider = new ethers.JsonRpcProvider("https://network.ambrosus.io");

// Telegram bot token and chat ID
const TELEGRAM_BOT_TOKEN = "7626099417:AAGADC20Ah3wxeNfGIMF4uLS1rTe7WlMwBM"; // Replace with your bot token
const TELEGRAM_CHAT_ID = "-1002471237939"; // Replace with your chat ID

// Token and Contract Addresses
const AMB_TOKEN_ADDRESS = "0x2b2d892C3fe2b4113dd7aC0D2c1882AF202FB28F"; // AMB Token
const PAIR_CONTRACT = "0x1a052b0373115c796c636454fE8A90F53D28cf76"; // AMB-SWINE Pair Contract
const SWINE_TOKEN_ADDRESS = "0xC410F3EB0c0f0E1EFA188D38C366536d59a265ba"; // SWINE Token

// UniswapV2Pair ABI (simplified to include necessary functions)
const UNISWAP_V2_PAIR_ABI = [
  {
    constant: true,
    inputs: [],
    name: "getReserves",
    outputs: [
      { internalType: "uint112", name: "_reserve0", type: "uint112" },
      { internalType: "uint112", name: "_reserve1", type: "uint112" },
      { internalType: "uint32", name: "_blockTimestampLast", type: "uint32" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "token0",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "token1",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
];

// Create an instance of the pair contract
const pairContract = new ethers.Contract(
  PAIR_CONTRACT,
  UNISWAP_V2_PAIR_ABI,
  provider
);

// Event signature for Uniswap V2 Swap event
const SWAP_EVENT_SIGNATURE = ethers.id(
  "Swap(address,uint256,uint256,uint256,uint256,address)"
);

// SWINE Token ABI (simplified to include necessary functions)
const SWINE_TOKEN_ABI = [
  {
    constant: true,
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
  {
    constant: true,
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
];

// Create an instance of the SWINE token contract
const swineTokenContract = new ethers.Contract(
  SWINE_TOKEN_ADDRESS,
  SWINE_TOKEN_ABI,
  provider
);

// Function to get the current price of AMB in USD from CoinGecko
async function getEthPriceInUSD() {
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=amber&vs_currencies=usd"
    );
    console.log("AMB Price in USD:", response.data.amber.usd);
    return response.data.amber.usd;
  } catch (error) {
    console.error("Error fetching AMB price:", error);
    return null;
  }
}

// Function to calculate the price of SWINE and market cap
async function calculateSwinePriceAndMc() {
  try {
    const reserves = await pairContract.getReserves();
    const token0 = await pairContract.token0();
    const token1 = await pairContract.token1();

    const isToken0AMB =
      token0.toLowerCase() === AMB_TOKEN_ADDRESS.toLowerCase();
    const AMBReserve = isToken0AMB ? reserves._reserve0 : reserves._reserve1;
    const SWINEReserve = isToken0AMB ? reserves._reserve1 : reserves._reserve0;

    const formattedAMBBal = ethers.formatUnits(AMBReserve, 18);
    const formattedSWINEBal = ethers.formatUnits(SWINEReserve, 18);

    const totalSupply = await swineTokenContract.totalSupply();
    const formattedTotalSupply = ethers.formatUnits(totalSupply, 18);

    const ethPriceInUSD = await getEthPriceInUSD();
    if (ethPriceInUSD === null) {
      throw new Error("Failed to fetch AMB price in USD.");
    }

    const swinePriceInAmb =
      parseFloat(formattedAMBBal) / parseFloat(formattedSWINEBal);
    const swinePriceInUsd = swinePriceInAmb * ethPriceInUSD;
    const marketCap =
      parseFloat(swinePriceInUsd) * parseFloat(formattedTotalSupply);

    console.log("SWINE Price in AMB:", swinePriceInAmb);
    console.log("SWINE Price in USD:", swinePriceInUsd);
    console.log("SWINE Market Cap:", marketCap);

    return {
      swinePriceInAmb: swinePriceInAmb.toFixed(8),
      swinePriceInUsd: swinePriceInUsd.toFixed(8),
      marketCap: marketCap.toFixed(4),
    };
  } catch (error) {
    console.error("Error calculating SWINE price and MC:", error);
    return {
      swinePriceInAmb: "0",
      swinePriceInUsd: "0",
      marketCap: "0",
    };
  }
}

// Function to send a message to Telegram with "Buy Now" buttons
async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const params = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Buy Now on TG 🚀",
            url: "https://t.me/SWINE_buybot",
          },
        ],
        [
          {
            text: "Buy on AstraDex 🚀",
            url: "https://star-fleet.io/astra/swap?inputCurrency=AMB&outputCurrency=0xC410F3EB0c0f0E1EFA188D38C366536d59a265ba",
          },
        ],
      ],
    },
  };

  try {
    await axios.post(url, params);
    console.log("Message sent to Telegram group:", message);
  } catch (error) {
    console.error("Error sending message to Telegram:", error);
  }
}

// Function to handle /price command
async function handlePriceCommand() {
  const { swinePriceInAmb, swinePriceInUsd, marketCap } =
    await calculateSwinePriceAndMc();

  const priceMessage = `
<b>SWINE Token Latest Data</b>

💰 Price in AMB: ${swinePriceInAmb} AMB
💵 Price in USD: $${swinePriceInUsd}
💸 Market Cap: $${marketCap}
🏫 Total Supply: 1,000,000,000
`;

  await sendTelegramMessage(priceMessage);
}

// Function to parse Swap event data
function parseSwapData(log, token0Address, token1Address) {
  const iface = new ethers.Interface([
    "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
  ]);

  const parsedLog = iface.parseLog(log);
  const { sender, amount0In, amount1In, amount0Out, amount1Out, to } =
    parsedLog.args;

  const isToken0AMB =
    token0Address.toLowerCase() === AMB_TOKEN_ADDRESS.toLowerCase();
  const ethSpent = isToken0AMB ? amount0In : amount1In;
  const swineReceived = isToken0AMB ? amount1Out : amount0Out;

  const ethSpentHuman = ethers.formatUnits(ethSpent, 18); // Assuming AMB has 18 decimals
  const swineReceivedHuman = ethers.formatUnits(swineReceived, 18); // Assuming SWINE has 18 decimals

  console.log(`Spent: ${ethSpentHuman} AMB`);
  console.log(`Received: ${swineReceivedHuman} $SWINE`);

  return {
    ethSpent: ethSpentHuman,
    swineReceived: swineReceivedHuman,
    sender,
    to,
    transactionHash: log.transactionHash,
  };
}

// Function to calculate the number of diamond emojis based on AMB spend in USD
function calculateDiamonds(valueSpentUSD) {
  if (valueSpentUSD < 1) {
    return "💎"; // Minimum 1 diamond for any spend
  }

  // Base diamonds for $1 to $100
  let diamonds = 3;

  if (valueSpentUSD > 100) {
    // Calculate additional diamonds for every $50 over $100
    const additionalSpends = Math.floor((valueSpentUSD - 1) / 50); // Subtracting 1 to include $100 in the base
    diamonds += additionalSpends;
  }

  // Ensure a minimum of 1 diamond
  diamonds = Math.max(diamonds, 1);

  // Generate the diamond string
  return "💎".repeat(diamonds);
}

// Helper function to format Ethereum addresses
function shortenAddress(address) {
  return `${address.slice(0, 6)}......${address.slice(-4)}`;
}

// Function to query logs for Swap events
async function getSwapEventsFromLogs(
  fromBlock,
  toBlock,
  token0Address,
  token1Address
) {
  try {
    console.log(`Fetching logs from block ${fromBlock} to ${toBlock}`);

    const filterParams = {
      jsonrpc: "2.0",
      method: "eth_getLogs",
      params: [
        {
          fromBlock: ethers.toBeHex(fromBlock),
          toBlock: ethers.toBeHex(toBlock),
          address: PAIR_CONTRACT,
          topics: [SWAP_EVENT_SIGNATURE],
        },
      ],
      id: 1,
    };

    const response = await axios.post(
      "https://network.ambrosus.io",
      filterParams
    );

    const logs = response.data.result;

    if (!logs || logs.length === 0) {
      console.log("No Swap events found in this batch.");
      // Optionally, notify Telegram
      // await sendTelegramMessage("No Swap events found in this batch.");
      return;
    }

    const { swinePriceInAmb, swinePriceInUsd, marketCap } =
      await calculateSwinePriceAndMc();

    for (const log of logs) {
      try {
        const txHash = log.transactionHash;

        const transaction = await provider.getTransaction(txHash);

        const valueInEth = ethers.formatUnits(transaction.value, 18);
        if (parseFloat(valueInEth) > 0.001) {
          const { ethSpent, swineReceived, sender, to, transactionHash } =
            parseSwapData(log, token0Address, token1Address);

          const ethPriceInUSD = await getEthPriceInUSD();
          if (ethPriceInUSD === null) {
            throw new Error("Failed to fetch AMB price in USD.");
          }

          const valueInUsd = (parseFloat(ethSpent) * ethPriceInUSD).toFixed(5);

          // Calculate diamonds based on AMB spend
          const diamonds = calculateDiamonds(parseFloat(valueInUsd));

          // Fetch 'to' address SWINE balance
          const swineBalance = await swineTokenContract.balanceOf(to);
          const swineBalanceHuman = ethers.formatUnits(swineBalance, 18);
          const swineBalanceFloat = parseFloat(swineBalanceHuman);

          // Determine if it's a new holder
          const isNewHolder = swineBalanceFloat === parseFloat(swineReceived);

          // Set the holder message based on buyer status
          const holderMessage = isNewHolder
            ? "⬆️ <b>New Holder!</b>"
            : "🔥 Recurring Buy 🔥";

          // Format the sender address using shortenAddress helper function
          const senderAddress = shortenAddress(sender);

          const swineReceivedFormatted = parseFloat(swineReceived).toFixed(4);

          const txDetails = `
<b>$SWINE</b> Buy!\n${diamonds}\n\n🔀 ${ethSpent} AMB (≈ $${valueInUsd} USD)\n🔀 ${swineReceivedFormatted} $SWINE\n👤 <a href="https://airdao.io/explorer/tx/${sender}">${senderAddress}</a> | <a href="https://airdao.io/explorer/tx/${transactionHash}">Txn</a>\n${holderMessage}\n💸 Market Cap: $${marketCap}\n💰 $SWINE Price: $${swinePriceInUsd}\n`;

          // Send message to Telegram
          if (valueInUsd < 10) {
            console.log("Too cheap to bother");
            continue; // Skip sending the message
          }

          await sendTelegramMessage(txDetails);

          console.log(`Processed Swap event: ${txHash}`);
        }
      } catch (error) {
        console.error(`Error processing log ${log.transactionHash}:`, error);
      }
    }
  } catch (error) {
    console.error("Error fetching or processing logs:", error);
  }
}

// Function to continuously listen for Swap events and also for the /price command
async function listenForEventsAndCommands() {
  const startBlock = await provider.getBlockNumber();
  const targetBlock = startBlock + 100;

  let currentBlock = startBlock;
  let offset = 0;

  console.log(
    `Listening for Swap events from block ${startBlock} to ${targetBlock}...`
  );

  // Poll for Swap events every 10 seconds
  const swapInterval = setInterval(async () => {
    try {
      const latestBlock = await provider.getBlockNumber();

      if (currentBlock > targetBlock) {
        console.log(`Reached target block ${targetBlock}. Stopping...`);
        clearInterval(swapInterval);
        process.exit(0);
        return;
      }

      const token0Address = await pairContract.token0();
      const token1Address = await pairContract.token1();

      await getSwapEventsFromLogs(
        currentBlock,
        latestBlock,
        token0Address,
        token1Address
      );
      currentBlock = latestBlock + 1;
    } catch (error) {
      console.error("Error in Swap events polling loop:", error);
    }
  }, 10000); // 10 seconds

  // Poll for Telegram messages every 5 seconds
  const telegramInterval = setInterval(async () => {
    try {
      const response = await axios.get(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`,
        { params: { offset, timeout: 0 } }
      );

      const messages = response.data.result;

      for (const message of messages) {
        offset = message.update_id + 1;

        // Ensure the message has text
        if (message.message && message.message.text) {
          const text = message.message.text.trim().toLowerCase();

          if (text === "/price") {
            console.log("Received /price command.");
            await handlePriceCommand();
          }
        }
      }
    } catch (error) {
      console.error("Error polling Telegram:", error);
    }
  }, 5000); // 5 seconds
}

// Start listening for events and commands
listenForEventsAndCommands();
