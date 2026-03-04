const mongoose = require("mongoose");
require("dotenv").config();
const { seedSampleData } = require("../seed");

const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/craftzygifts";

const runSeed = async () => {
  try {
    await mongoose.connect(MONGO_URL);
    console.log("MongoDB connected for seeding");
    await seedSampleData();
    console.log("Seeding finished");
  } catch (error) {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

runSeed();
