const axios = require("axios");
const { ethers } = require("ethers");

// Load environment variables from .env file
// require("dotenv").config();

const provider = new ethers.JsonRpcProvider("https://network.ambrosus.io");

// Telegram bot token and chat ID
const TELEGRAM_BOT_TOKEN = "7626099417:AAGADC20Ah3wxeNfGIMF4uLS1rTe7WlMwBM"; //Done
const TELEGRAM_CHAT_ID = "-1002471237939"; //

// Replace with your actual AMB token contract address
const AMB_TOKEN_ADDRESS = "0x2b2d892C3fe2b4113dd7aC0D2c1882AF202FB28F"; // SAMB here: Done

const PAIR_CONTRACT = "0x1a052b0373115c796c636454fE8A90F53D28cf76"; //Done
// Add the SWINE token contract address
const SWINE_TOKEN_ADDRESS = "0xC410F3EB0c0f0E1EFA188D38C366536d59a265ba"; // Done

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

// Function to get the current price of AMB in USD from CoinGecko
async function getEthPriceInUSD() {
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=amber&vs_currencies=usd"
    );
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
      // sendTelegramMessage("No Swap events found in this batch.");
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

          const txDetails = `
<b>$SWINE</b> Buy!\n🔀 ${ethSpent} AMB (≈ $${valueInUsd} USD)\n🔀 ${swineReceived} $SWINE\n💸 Market Cap: $${marketCap}\n💰 $SWINE Price: $${swinePriceInUsd}\n`;

          await sendTelegramMessage(txDetails);
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

  const interval = setInterval(async () => {
    try {
      const latestBlock = await provider.getBlockNumber();

      if (currentBlock > targetBlock) {
        console.log(`Reached target block ${targetBlock}. Stopping...`);
        clearInterval(interval);
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
      console.error("Error in polling loop:", error);
    }
  }, 10000); // Poll for Swap events every 10 seconds

  // Poll for Telegram messages
  setInterval(async () => {
    try {
      const response = await axios.get(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`,
        { params: { offset } }
      );

      const messages = response.data.result;

      for (const message of messages) {
        offset = message.update_id + 1;
        const text = message.message.text;

        if (text === "/price") {
          await handlePriceCommand();
        }
      }
    } catch (error) {
      console.error("Error polling Telegram:", error);
    }
  }, 5000); // Poll for Telegram messages every 5 seconds
}

listenForEventsAndCommands();
