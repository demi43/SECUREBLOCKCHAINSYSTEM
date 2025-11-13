import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-mocha";
import * as dotenv from "dotenv";

dotenv.config();

// Helper to check if private key is valid
const hasValidPrivateKey = () => {
    const key = process.env.PRIVATE_KEY;
    if (!key || key === "YOUR_PRIVATE_KEY_HERE") {
        return false;
    }
    // Accept keys with or without 0x prefix
    // With 0x: 66 chars (0x + 64 hex)
    // Without 0x: 64 chars (64 hex)
    const cleanKey = key.startsWith("0x") ? key.slice(2) : key;
    // Check it's valid hex and reasonable length (64 hex chars = 128 bits minimum)
    return /^[0-9a-fA-F]+$/.test(cleanKey) && cleanKey.length >= 64;
};

// Normalize private key (add 0x if missing)
const normalizePrivateKey = (key) => {
    if (!key) return key;
    return key.startsWith("0x") ? key : `0x${key}`;
};

// Build networks object conditionally
const networks = {};

// Only add mainnet if properly configured
if (hasValidPrivateKey() && (process.env.MAINNET_RPC_URL || process.env.INFURA_API_KEY)) {
    networks.mainnet = {
        type: "http",
        url: process.env.MAINNET_RPC_URL || `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
        accounts: [normalizePrivateKey(process.env.PRIVATE_KEY)],
        chainId: 1,
    };
}

// Only add sepolia if properly configured
if (hasValidPrivateKey() && (process.env.SEPOLIA_RPC_URL || process.env.INFURA_API_KEY)) {
    networks.sepolia = {
        type: "http",
        url: process.env.SEPOLIA_RPC_URL || `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
        accounts: [normalizePrivateKey(process.env.PRIVATE_KEY)],
        chainId: 11155111,
    };
}

/** @type import('hardhat/config').HardhatUserConfig */
export default {
    solidity: "0.8.20",
    paths: {
        tests: "./test"
    },
    mocha: {
        timeout: 40000,
        grep: ".*",
        spec: "test/**/*.test.js"
    },
    networks,
};