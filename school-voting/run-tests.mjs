import { config } from "hardhat/config";
import { run } from "hardhat/internal/cli/run";
import { HARDHAT_NAME } from "hardhat/constants";

// Load hardhat config
await import("./hardhat.config.js");

// Run the test task
await run(HARDHAT_NAME, ["test"]);

