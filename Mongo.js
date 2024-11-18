// mongo.js
const mongoose = require("mongoose");
const dotenv = require("dotenv");

// Load environment variables from .env file
dotenv.config();

// Retrieve MongoDB URI from environment variables
const MONGODB_URI = process.env.MONGODB_URI


// Check if MONGODB_URI is provided
if (!MONGODB_URI) {
  console.error(
    "❌ Error: MONGODB_URI is not defined in the environment variables."
  );
  process.exit(1); // Exit the application with an error code
}

// Mongoose connection options
const options = {
  useNewUrlParser: true, // Use the new URL parser instead of the deprecated one
  useUnifiedTopology: true, // Opt into using the MongoDB driver's new connection management engine
  // useFindAndModify: false,   // Deprecated in Mongoose 6.x, no longer needed
  // useCreateIndex: true,      // Deprecated in Mongoose 6.x, no longer needed
};

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI, options)
  .then(() => {
    console.log("🚀 Successfully connected to MongoDB.");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1); // Exit the application if unable to connect
  });

// Event listeners for MongoDB connection events

// When the connection is successfully opened
mongoose.connection.on("connected", () => {
  console.log("✅ Mongoose connection open.");
});

// When there's an error in the connection
mongoose.connection.on("error", (err) => {
  console.error("❌ Mongoose connection error:", err);
});

// When the connection is disconnected
mongoose.connection.on("disconnected", () => {
  console.log("⚠️ Mongoose connection disconnected.");
});

// Handle process termination gracefully
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  console.log("🛑 Mongoose connection closed due to application termination.");
  process.exit(0);
});

// Export the mongoose instance for use in other parts of the application
module.exports = mongoose;
