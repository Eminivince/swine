const axios = require("axios");
const { ethers } = require("ethers");

// Load environment variables from .env file
// require("dotenv").config();

const provider = new ethers.JsonRpcProvider("https://network.ambrosus.io");

// Replace with your actual AMB token contract address
const AMB_TOKEN_ADDRESS = "0x2b2d892C3fe2b4113dd7aC0D2c1882AF202FB28F"; // <-- Replace this

// Telegram bot token and chat ID
const TELEGRAM_BOT_TOKEN = "7567838371:AAHeO1yM9fN6q1GGmIGFLpo3mTYRKIcL2tM";
const TELEGRAM_CHAT_ID = "-1002302639008"; // Use a negative number for group chat IDs, e.g., -123456789

const PAIR_CONTRACT = "0x2Eeec63169eA3d6EeB4DEAA23e21D1286084dCa2";

// UniswapV2Pair ABI including token0 and token1
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

console.log("Swap Event Signature:", SWAP_EVENT_SIGNATURE);

// Counter for Swap events
let swapEventCount = 0;
const targetEventCount = 10; // Target number of Swap events

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

/**
 * Calculates the number of diamond emojis based on AMB spend in USD.
 *
 * @param {number} valueSpentUSD - The amount spent in USD.
 * @returns {string} - A string of diamond emojis.
 */
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

// Function to parse Swap event data
function parseSwapData(log, token0Address, token1Address) {
  // Decode the log data
  const iface = new ethers.Interface([
    "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
  ]);

  const parsedLog = iface.parseLog(log);
  const { sender, amount0In, amount1In, amount0Out, amount1Out, to } =
    parsedLog.args;

  // Determine which token is AMB and which is SWINE
  const isToken0AMB =
    token0Address.toLowerCase() === AMB_TOKEN_ADDRESS.toLowerCase();
  const AMB = isToken0AMB ? amount0In : amount1In;
  const SWINE = isToken0AMB ? amount1Out : amount0Out;

  // Convert BigInt values to human-readable strings
  const ethSpentHuman = ethers.formatUnits(AMB, 18); // Assuming AMB has 18 decimals
  const swineReceivedHuman = ethers.formatUnits(SWINE, 18); // Assuming SWINE has 18 decimals

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

// Add the SWINE token contract address
const SWINE_TOKEN_ADDRESS = "0x9B1AdA6E67f52b7892B8B605260C68FeE99E71F5"; // Replace with actual SWINE token address

// Add the SWINE token ABI (only including necessary functions)
// Add the SWINE token ABI (including balanceOf function)
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

// Function to calculate the price of SWINE and market cap
async function calculateSwinePriceAndMc() {
  try {
    // Get the reserves
    const reserves = await pairContract.getReserves();

    // Get token0 and token1 addresses
    const token0 = await pairContract.token0();
    const token1 = await pairContract.token1();

    console.log(`Token0: ${token0}`);
    console.log(`Token1: ${token1}`);

    // Determine which reserve is AMB and which is SWINE
    const isToken0AMB =
      token0.toLowerCase() === AMB_TOKEN_ADDRESS.toLowerCase();

    const AMBReserve = isToken0AMB ? reserves._reserve0 : reserves._reserve1;
    const SWINEReserve = isToken0AMB ? reserves._reserve1 : reserves._reserve0;

    const formattedAMBBal = ethers.formatUnits(AMBReserve, 18);
    const formattedSWINEBal = ethers.formatUnits(SWINEReserve, 18);

    console.log("Formatted AMB Reserve:", formattedAMBBal);
    console.log("Formatted SWINE Reserve:", formattedSWINEBal);

    // Get the total supply of SWINE
    const totalSupply = await swineTokenContract.totalSupply();
    const formattedTotalSupply = ethers.formatUnits(totalSupply, 18);
    console.log("Total Supply of SWINE:", formattedTotalSupply);

    // Get the current AMB price in USD
    const ethPriceInUSD = await getEthPriceInUSD();

    if (ethPriceInUSD === null) {
      throw new Error("Failed to fetch AMB price in USD.");
    }

    // Calculate the price of SWINE in AMB
    const swinePriceInAmb =
      parseFloat(formattedAMBBal) / parseFloat(formattedSWINEBal);
    console.log("SWINE Price in AMB:", swinePriceInAmb);

    // Calculate the price of SWINE in USD
    const swinePriceInUsd = swinePriceInAmb * ethPriceInUSD;
    console.log("SWINE Price in USD:", swinePriceInUsd);

    // Calculate the market cap
    const marketCap =
      parseFloat(swinePriceInUsd) * parseFloat(formattedTotalSupply);
    console.log("Market Cap of SWINE:", marketCap);

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

// Function to send a message to Telegram with "Buy Now" button
async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const params = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: "HTML", // Changed from "Markdown" to "HTML"
    disable_web_page_preview: true, // Disable link previews
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Buy Now",
            url: "https://t.me/SWINE_buybot",
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
      return;
    }

    // Fetch SWINE price and MC once per batch
    const { swinePriceInAmb, swinePriceInUsd, marketCap } =
      await calculateSwinePriceAndMc();

    // Process each log sequentially
    for (const log of logs) {
      try {
        swapEventCount++;
        const txHash = log.transactionHash;

        // Fetch transaction details using txHash
        const transaction = await provider.getTransaction(txHash);

        // Only send messages if the value is greater than 0.001 AMB
        const valueInEth = ethers.formatUnits(transaction.value, 18);
        if (parseFloat(valueInEth) > 0.001) {
          const { ethSpent, swineReceived, sender, to, transactionHash } =
            parseSwapData(log, token0Address, token1Address);

          // Validate that both AMB spent and SWINE received are greater than zero
          const ethSpentFloat = parseFloat(ethSpent);
          const swineReceivedFloat = parseFloat(swineReceived);

          // Inside Swap event processing loop
          if (ethSpentFloat > 0 && swineReceivedFloat > 0) {
            // Calculate the equivalent value in USD
            const ethPriceInUSD = await getEthPriceInUSD();
            if (ethPriceInUSD === null) {
              throw new Error("Failed to fetch AMB price in USD.");
            }

            const valueInUsd = (ethSpentFloat * ethPriceInUSD).toFixed(5);

            // Calculate diamonds based on AMB spend
            const diamonds = calculateDiamonds(parseFloat(valueInUsd));

            // Fetch 'to' address SWINE balance
            const swineBalance = await swineTokenContract.balanceOf(to);
            const swineBalanceHuman = ethers.formatUnits(swineBalance, 18);
            const swineBalanceFloat = parseFloat(swineBalanceHuman);

            // Determine if it's a new holder
            const isNewHolder = swineBalanceFloat === swineReceivedFloat;

            // Set the holder message based on buyer status
            const holderMessage = isNewHolder
              ? "⬆️ <b>New Holder!</b>"
              : "🔥 Recurring Buy 🔥";

            // Format the sender address using shortenAddress helper function
            const senderAddress = shortenAddress(sender);

            const swineReceivedFormatted = swineReceivedFloat.toFixed(4);

            const txDetails = `
<b>$SWINE</b> Buy!\n${diamonds}\n\n🔀 ${ethSpent} AMB (≈ $${valueInUsd} USD)\n🔀 ${swineReceivedFormatted} $SWINE\n👤 <a href="https://airdao.io/explorer/tx/${sender}">${senderAddress}</a> | <a href="https://airdao.io/explorer/tx/${transactionHash}">Txn</a>\n${holderMessage}\n💸 Market Cap: $${marketCap}\n💰 $SWINE Price: $${swinePriceInUsd}\n`;

            // Send message to Telegram

            if (valueInUsd < 10) {
              console.log("Too cheap to bother");
              return;
            }
            await sendTelegramMessage(txDetails);

            console.log(`Processed Swap event #${swapEventCount}:`);
            console.log(txDetails);
            console.log("------------------------");

            if (swapEventCount >= targetEventCount) {
              console.log("Target number of Swap events reached. Stopping...");
              process.exit(0); // Exit the process if target count is reached
            }
          } else {
            console.log(
              `Ignored Swap event with zero AMB or SWINE: txHash=${transactionHash}`
            );
          }
        }
      } catch (error) {
        console.error(`Error processing log ${log.transactionHash}:`, error);
      }
    }
  } catch (error) {
    console.error("Error fetching or processing logs:", error);
  }
}

// Function to continuously listen for Swap events for the next 100 blocks
async function listenForSwapEvents() {
  const startBlock = await provider.getBlockNumber(); // Start from the current block
  const targetBlock = startBlock + 100; // End after 100 blocks

  let currentBlock = startBlock;
  console.log(
    `Listening for Swap events from block ${startBlock} to ${targetBlock}...`
  );

  const interval = setInterval(async () => {
    try {
      const latestBlock = await provider.getBlockNumber(); // Get the latest block

      if (currentBlock > targetBlock) {
        console.log(`Reached target block ${targetBlock}. Stopping...`);
        clearInterval(interval); // Stop polling after 100 blocks
        process.exit(0); // Exit the process
        return;
      }

      // Fetch token0 and token1 addresses
      const token0Address = await pairContract.token0();
      const token1Address = await pairContract.token1();

      console.log(`Token0 Address: ${token0Address}`);
      console.log(`Token1 Address: ${token1Address}`);

      await getSwapEventsFromLogs(
        currentBlock,
        latestBlock,
        token0Address,
        token1Address
      );
      currentBlock = latestBlock + 1; // Update current block to the next
    } catch (error) {
      console.error("Error in polling loop:", error);
    }
  }, 10000); // Poll every 10 seconds (adjust as needed)
}

listenForSwapEvents();
