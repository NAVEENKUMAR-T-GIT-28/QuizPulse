const mongoose = require("mongoose");
const logger = require("./logger");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info("MongoDB connected");
  } catch (err) {
    logger.fatal({ err }, "MongoDB connection error");
    process.exit(1);
  }
};

module.exports = connectDB;