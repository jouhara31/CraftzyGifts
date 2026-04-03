const path = require("path");

const ENV_PATH = path.resolve(__dirname, ".env");
require("dotenv").config({ path: ENV_PATH });
const { startServer } = require("./app");

const REQUIRED_ENV_VARS = ["JWT_SECRET"];
const missingEnv = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(
    `Missing required environment variables in ${ENV_PATH}: ${missingEnv.join(", ")}`
  );
  process.exit(1);
}

const PORT = Number.parseInt(process.env.PORT, 10) || 5000;
startServer(PORT).catch((error) => {
  console.error("Server startup failed", error);
  process.exit(1);
});
