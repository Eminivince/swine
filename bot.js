const { ethers } = require("ethers");
const axios = require("axios");

function main() {
  // Ethereum node provider (e.g., Alchemy, Infura)
  const provider = new ethers.JsonRpcProvider("https://binance.llamarpc.com");

  // Uniswap V2 or V3 SwapRouter contract address and ABI
  const swapRouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"; // Uniswap V2 Router address
  const swapRouterAbi = [
    "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to, uint256 timestamp)",
  ];

  // Create a contract instance to listen for swap events
  const swapRouterContract = new ethers.Contract(
    swapRouterAddress,
    swapRouterAbi,
    provider
  );

  // SHIB Token Contract address and decimals
  const shibContractAddress = "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE";
  const shibDecimals = 18; // SHIB uses 18 decimal places

  // Fetch SHIB/USD price from CoinGecko
  async function getShibPrice() {
    try {
      const response = await axios.get(
        "https://api.coingecko.com/api/v3/simple/price?ids=shiba-inu&vs_currencies=usd"
      );
      console.log("Logging response");
      console.log("SHIB price fetched:", response.data["shiba-inu"].usd);
      return response.data["shiba-inu"].usd;
    } catch (error) {
      console.error("Error fetching SHIB price:", error);
      return null;
    }
  }

  // Convert the SHIB amount from wei to normal number
  function formatShibValue(value) {
    return ethers.utils.formatUnits(value, shibDecimals);
  }

  // Listen for Swap events on SwapRouter contract
  swapRouterContract.on(
    "Swap",
    async (
      sender,
      amount0In,
      amount1In,
      amount0Out,
      amount1Out,
      to,
      timestamp
    ) => {
      console.log("Swap event detected");
      // Check if SHIB is being bought (i.e., amount0Out or amount1Out corresponds to SHIB)
      const shibAmountBought = amount0Out; // Assuming amount0Out is SHIB
      const shibAmountSold = amount1In; // Assuming amount1In is what was sold to buy SHIB

      // Use the SHIB amount bought for the price conversion
      const shibPrice = await getShibPrice(); // Get current SHIB price in USD

      if (shibPrice) {
        const shibValueInUsd = (
          parseFloat(formatShibValue(shibAmountBought)) * shibPrice
        ).toFixed(2); // Calculate USD value
        console.log(
          `SHIB Purchase detected: ${formatShibValue(
            shibAmountBought
          )} SHIB bought (~${shibValueInUsd} USD)`
        );
        console.log(
          `Sender: ${sender}, To: ${to}, Timestamp: ${new Date(
            timestamp * 1000
          ).toISOString()}`
        );
      } else {
        console.log("Could not fetch SHIB price.");
      }
    }
  );

  console.log("Listening for SHIB purchases through the SwapRouter...");
}

main();
