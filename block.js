const axios = require("axios");
const { ethers } = require("ethers");

// Infura or Alchemy API Key (replace with your own key)
const provider = new ethers.JsonRpcProvider("https://network.ambrosus.io");

// Telegram bot token and chat ID (replace with your actual values)
const TELEGRAM_BOT_TOKEN = "7567838371:AAHeO1yM9fN6q1GGmIGFLpo3mTYRKIcL2tM";
const TELEGRAM_CHAT_ID = "-1002302639008"; // Use a negative number for group chat IDs, e.g. -123456789

const PAIR_CONTRACT = "0x6b339A7C07e1761Cfa04d63BC98f72bC82Bc7445";

// UniswapV2Pair ABI
const UNISWAP_V2_PAIR_ABI = [
  {
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

console.log(SWAP_EVENT_SIGNATURE);

// Counter for Swap events
let swapEventCount = 0;
const targetEventCount = 10; // Target number of Swap events

// Function to get the current price of AMB in USD from CoinGecko
async function getEthPriceInUSD() {
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=amber&vs_currencies=usd"
    );
    console.log(response.data.amber.usd);

    return response.data.amber.usd;
  } catch (error) {
    console.error("Error fetching AMB price:", error);
    return null;
  }
}

// Helper function to format Ethereum addresses
function shortenAddress(address) {
  return `${address.slice(0, 6)}......${address.slice(-4)}`;
}

function parseSwapData(data) {
  // Function to safely convert hex strings to BigInt, removing leading zeros
  function safeParseBigInt(hexString) {
    // If the hex string is all zeros, return BigInt(0)
    if (hexString === "0x" || /^0x0+$/.test(hexString)) {
      return 0n;
    }
    return BigInt(hexString);
  }

  // Parse the hex values from the data
  const amount0In = safeParseBigInt("0x" + data.slice(2, 66));
  console.log(amount0In);
  const amount1In = safeParseBigInt("0x" + data.slice(66, 130));
  console.log(amount1In);
  const amount0Out = safeParseBigInt("0x" + data.slice(130, 194));
  console.log(amount0Out);
  const amount1Out = safeParseBigInt("0x" + data.slice(194, 258));
  console.log(amount1Out);

  // Assuming AMB is the token being spent, amount0In is AMB and amount1Out is ERC20
  const ethSpent = amount0In > 0n ? amount0In : amount0Out;
  //   console.log("eth is spent:", ethSpent);
  const erc20Received = amount1Out > 0n ? amount1Out : amount1In;
  //   console.log("erc20 gotten", erc20Received);

  // Return the values in human-readable format (dividing by 10^18 for typical token decimals)

  // Convert to human-readable format
  const ethSpentHuman = Number(ethSpent.toString());
  const erc20ReceivedHuman = Number(erc20Received.toString());

  //   console.log("erc20ReceivedHuman", erc20ReceivedHuman);

  console.log(`Spent: ${ethSpentHuman} AMB`);
  console.log(`Received: ${erc20ReceivedHuman} $SWINE`);

  return {
    ethSpent: ethSpentHuman,
    erc20Received: erc20ReceivedHuman,
  };
}

// Add the SWINE token contract address
const PAC_TOKEN_ADDRESS = "0x3669540fA80d0b2EebedfB88b9BAF7855EB1149d";

// Add the SWINE token ABI (only including necessary functions)
const PAC_TOKEN_ABI = [
  {
    constant: true,
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
];

// Create an instance of the SWINE token contract
const pacTokenContract = new ethers.Contract(
  PAC_TOKEN_ADDRESS,
  PAC_TOKEN_ABI,
  provider
);

// Function to calculate the price of SWINE and market cap
async function calculatePacPriceAndMc() {
  try {
    // Get the reserves
    const reserves = await pairContract.getReserves();

    // Assuming SWINE is reserve0 and WETH is reserve1
    const wethBalance = reserves._reserve0.toString();
    const pacBalance = reserves._reserve1.toString();

    const formattedPacBal = ethers.formatUnits(pacBalance, 18);
    const formattedWETHBal = ethers.formatUnits(wethBalance, 18);

    console.log("formattedWETHBal", formattedWETHBal);
    console.log("formattedPacBal", formattedPacBal);

    // Get the total supply of SWINE
    const totalSupply = await pacTokenContract.totalSupply();
    // console.log("unt totalSupply", totalSupply);

    const formattedTotalSupply = ethers.formatUnits(totalSupply, 18);
    console.log("totalSupply", formattedTotalSupply);

    // Get the current AMB price in USD
    const ethPriceInUSD = await getEthPriceInUSD();

    // Calculate the price of SWINE in AMB
    const pacPriceInEth = formattedWETHBal / formattedPacBal;
    console.log("pacPriceInEth", pacPriceInEth);

    // Calculate the price of SWINE in USD
    const pacPriceInUsd = pacPriceInEth * ethPriceInUSD;

    // Calculate the market cap
    const marketCap = pacPriceInUsd * formattedTotalSupply;
    console.log("pacPriceInUsd", pacPriceInUsd);

    return {
      pacPriceInEth: pacPriceInEth.toString(),
      pacPriceInUsd: pacPriceInUsd.toString(),
      marketCap: marketCap.toString(),
    };
  } catch (error) {
    console.error("Error calculating SWINE price and MC:", error);
    return {
      pacPriceInEth: "0",
      pacPriceInUsd: "0",
      marketCap: "0",
    };
  }
}

function parseLog(log) {
  const topics = log.topics;
  const eventSignature = topics[0];
  const eventABI = PAIR_ABI.filter(
    (abi) => abi.type === "event" && abi.name === eventSignature.slice(2)
  )[0];

  if (!eventABI) {
    throw new Error(`Unknown event signature: ${eventSignature}`);
  }

  const parsedEvent = {
    event: eventABI.name,
    args: {},
  };

  for (let i = 1; i < topics.length; i++) {
    const topic = ethers.utils.hexSlice(topics[i], 128);
    const argName = eventABI.inputs[i].name;
    const argType = eventABI.inputs[i].type
      .replace("uint", "number")
      .replace("address", "string");
    parsedEvent.args[argName] = ethers.utils.parseHexadecimal(topic);
  }

  return parsedEvent;
}

// Function to query logs for Swap events
// Modify the getSwapEventsFromLogs function to include SWINE price and MC
async function getSwapEventsFromLogs(fromBlock, toBlock) {
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

    // Fetch SWINE price and MC
    const { pacPriceInEth, pacPriceInUsd, marketCap } =
      await calculatePacPriceAndMc();

    // Process each log sequentially
    for (const log of logs) {
      try {
        swapEventCount++;
        const txHash = log.transactionHash;

        // Fetch transaction details using txHash
        const transaction = await provider.getTransaction(txHash);

        // Only send messages if the value is greater than 0.001 AMB
        const valueInEth = ethers.formatEther(transaction.value);
        if (parseFloat(valueInEth) > 0.001) {
          const { ethSpent, erc20Received } = parseSwapData(log.data);

          // Calculate the equivalent value in USD
          const valueInUsd = (
            parseFloat(valueInEth) * (await getEthPriceInUSD())
          ).toFixed(5);

          // Format the from and to addresses using shortenAddress helper function
          const fromAddress = shortenAddress(transaction.from);
          const toAddress = "Txn";

          const received = ethers.formatUnits(erc20Received.toString(), 18);

          const txDetails = `
SWINE Buy!\n💎💎💎\n\n🔀 ${valueInEth} AMB (≈ $${valueInUsd} USD)\n🔀 ${Number(
            received
          ).toFixed(4)} $SWINE\n👤 <a href="https://airdao.io/explorer/tx/${
            transaction.from
          }">${fromAddress}</a> | <a href="https://airdao.io/explorer/tx/${txHash}">${toAddress}</a>\n⬆️ <b>New Holder!</b>\n💸 Market Cap: $${Number(
            marketCap
          ).toFixed(4)}\n💰 $SWINE Price: $${Number(pacPriceInUsd).toFixed(
            8
          )}\n`;

          // Send message to Telegram
          await sendTelegramMessage(txDetails);

          console.log(`Processed Swap event #${swapEventCount}:`);
          console.log(txDetails);
          console.log("------------------------");

          if (swapEventCount >= targetEventCount) {
            console.log("Target number of Swap events reached. Stopping...");
            break; // Exit the loop early if target count is reached
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

// Function to continuously listen for Swap events for the next 100 blocks
async function listenForSwapEvents() {
  const startBlock = await provider.getBlockNumber(); // Start from the current block
  const targetBlock = startBlock + 100; // End after 100 blocks

  let currentBlock = startBlock;
  console.log(`Listening for Swap events from block ${startBlock}...`);

  const interval = setInterval(async () => {
    const latestBlock = await provider.getBlockNumber(); // Get the latest block

    if (currentBlock >= targetBlock) {
      console.log(`Reached target block ${targetBlock}. Stopping...`);
      clearInterval(interval); // Stop polling after 100 blocks
      return;
    }

    await getSwapEventsFromLogs(currentBlock, latestBlock);
    currentBlock = latestBlock + 1; // Update current block to the next
  }, 10000); // Poll every 10 seconds (adjust as needed)
}

listenForSwapEvents();
