# Backend API Server

This backend server (now written in Python using FastAPI) connects the frontend to the `SchoolVoting` smart contract deployed on a Hardhat node.

## Prerequisites

- Python 3.10 or later
- Hardhat node running (`npx hardhat node`)
- Contract deployed and address copied

## Setup

1. (Optional) Create a virtual environment:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

2. Install dependencies:

   ```powershell
   pip install -r requirements.txt
   ```

3. Configure environment variables (defaults work for local Hardhat):
   Create a `.env` file in this folder with the following content (update the address if you redeploy):
   ```env
   CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
   RPC_URL=http://127.0.0.1:8545
   PORT=3001
   ```

## Running the server

```powershell
uvicorn app:app --reload --port 3001
```

Leave this terminal window open; the server must be running while you use the frontend. The API will be available at `http://localhost:3001`.

## API Endpoints

The Python implementation provides the same endpoints and response shapes as the previous Node.js version:

- `GET /api/health` – Health check & latest block number
- `GET /api/candidates` – List of candidates and vote counts
- `GET /api/stats` – Election statistics
- `GET /api/admin` – Current admin address
- `GET /api/has-voted/{address}` – Whether an address has voted
- `POST /api/vote` – Submit a vote (`{ "candidate": string, "voterAddress": string }`)
- `POST /api/end-election` – End the election (`{ "adminAddress": string }`)
- `GET /api/winner` – Election winner details (after election ends)

## Tips

- If the server exits immediately, check the console output for messages about connecting to the Hardhat node or loading the contract artifact.
- You can keep a dedicated PowerShell window just for this command and start it with:
  ```powershell
  Start-Process powershell -ArgumentList '-NoExit','-Command','cd C:\Users\omode\secureblockchainvotingsystem\backend; uvicorn app:app --reload --port 3001'
  ```
