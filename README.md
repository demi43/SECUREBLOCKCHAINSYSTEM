# Secure Blockchain Voting System

A complete blockchain voting system built with Hardhat, React, and a FastAPI (Python) backend. This system ensures transparency, anonymity, and tamper-proof recording of votes using blockchain technology.

## Features

- **Blockchain-Based Voting**: Votes stored immutably on blockchain
- **True Anonymity**: Random one-time addresses prevent voter tracing
- **Tamper-Proof**: Solution 5 prevents localStorage manipulation
- **Auto-Deployment**: Smart contracts deployed automatically per election
- **Dual Mode**: Works with backend (real blockchain) or local simulation
- **Real-Time Results**: Live vote counts and blockchain viewer
- **Modern UI**: Dark theme with glassmorphism design

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or later) - [Download](https://nodejs.org/)
- **Python** (3.10 or later) - [Download](https://www.python.org/downloads/)
- **npm** (comes with Node.js)
- **Git** (optional, for cloning)

### Verify Installation

```powershell
node --version    # Should show v18 or higher
python --version  # Should show 3.10 or higher
npm --version     # Should show 9 or higher
```

## Quick Start Guide

Follow these steps in order. You'll need **3 terminal windows** open.

### Step 1: Install Dependencies

#### Install Smart Contract Dependencies

```powershell
cd school-voting
npm install
```

#### Install Frontend Dependencies

```powershell
cd frontend
npm install
```

#### Install Backend Dependencies

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

> **Note for Linux/Mac users:** Use `source .venv/bin/activate` instead of `.\.venv\Scripts\Activate.ps1`

### Step 2: Compile Smart Contract

```powershell
cd school-voting
npx hardhat compile
```

This creates the contract artifacts needed by the backend.

### Step 3: Start Hardhat Blockchain Node

**Open Terminal 1** and run:

```powershell
cd school-voting
npx hardhat node
```

**Keep this terminal open!** You should see:

```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
```

This is your local blockchain network.

### Step 4: Configure Backend

**Open Terminal 2** and navigate to the backend:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1  # Activate virtual environment
```

Create a `.env` file in the `backend` folder:

```powershell
# Create .env file
@"
RPC_URL=http://127.0.0.1:8545
PORT=3001
SERVER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
"@ | Out-File -FilePath ".env" -Encoding utf8
```

> **Important:** The `SERVER_PRIVATE_KEY` above is a default Hardhat account private key (for local development only). **Never use this on a public network!**

> **For Linux/Mac:** Create `.env` manually with:
>
> ```
> RPC_URL=http://127.0.0.1:8545
> PORT=3001
> SERVER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
> ```

### Step 5: Start Backend Server

**In Terminal 2** (still in `backend` folder with venv activated):

```powershell
python -m uvicorn app:app --reload --port 3001
```

**Keep this terminal open!** You should see:

```
INFO:     Uvicorn running on http://0.0.0.0:3001
```

The backend API is now running at `http://localhost:3001`

### Step 6: Start Frontend

**Open Terminal 3** and run:

```powershell
cd frontend
npm run dev
```

**Keep this terminal open!** You should see:

```
  VITE v7.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

### Step 7: Open the Application

Open your browser and navigate to:

```
http://localhost:5173
```

**You're all set!** The application should now be running.

## How to Use

### Creating an Election

1. On the homepage, click **"Create New Election"**
2. Fill in:
   - **Title**: Name of your election
   - **Description**: Optional description
   - **Candidates**: Add at least 2 candidates (one per line)
   - **End Time**: When the election should close
3. Click **"Create Election"**
4. The system will automatically deploy a smart contract to the blockchain
5. You'll be redirected to the election page

### Voting

1. Join an election from the homepage or navigate directly
2. Select a candidate
3. Click **"Cast Vote"**
4. Confirm your vote in the dialog
5. Wait for the transaction to be mined (usually instant on local network)
6. Your vote is now recorded on the blockchain!

### Viewing Results

- Click the **"Results"** tab to see vote counts
- Click the **"Blockchain"** tab to see all blocks and votes
- Results update automatically after each vote

### Viewing Closed Elections

- Closed elections show a **"View Results"** button on the homepage
- You can view results and blockchain history even after the election ends

## Project Structure

```
secureblockchainvotingsystem/
├── school-voting/          # Smart contract and Hardhat setup
│   ├── contracts/         # Solidity smart contracts
│   ├── test/              # Contract tests
│   └── hardhat.config.js  # Hardhat configuration
├── backend/               # FastAPI backend server
│   ├── app.py            # Main API server
│   ├── requirements.txt  # Python dependencies
│   └── .env              # Environment variables (create this)
└── frontend/             # React frontend
    ├── src/
    │   ├── App.tsx       # Main application component
    │   ├── components/   # React components
    │   └── api.ts        # API client
    └── package.json      # Node dependencies
```

## Configuration

### Backend Environment Variables

The `backend/.env` file supports these variables:

| Variable             | Default                 | Description                          |
| -------------------- | ----------------------- | ------------------------------------ |
| `RPC_URL`            | `http://127.0.0.1:8545` | Hardhat node URL                     |
| `PORT`               | `3001`                  | Backend server port                  |
| `SERVER_PRIVATE_KEY` | (required)              | Private key for signing transactions |

### Frontend Configuration

The frontend automatically connects to `http://localhost:3001` for the backend API. This is configured in `frontend/src/api.ts`.

## Testing

### Test Smart Contracts

```powershell
cd school-voting
npm test
```

This runs the Mocha test suite for the smart contract.

### Test Backend API

The backend provides interactive API documentation:

1. Start the backend server
2. Open: `http://localhost:3001/docs`
3. Test endpoints directly from the browser

## Troubleshooting

### "Contract artifact not found"

**Solution:** Compile the contract first:

```powershell
cd school-voting
npx hardhat compile
```

### "Could not connect to blockchain network"

**Solution:** Make sure Hardhat node is running:

```powershell
cd school-voting
npx hardhat node
```

### "SERVER_PRIVATE_KEY not set"

**Solution:** Create `backend/.env` file with:

```
SERVER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Backend won't start

**Solution:**

1. Make sure virtual environment is activated: `.\.venv\Scripts\Activate.ps1`
2. Check Python version: `python --version` (needs 3.10+)
3. Reinstall dependencies: `pip install -r requirements.txt`

### Frontend shows "Local Blockchain Mode"

**Solution:**

1. Check backend is running: `http://localhost:3001/api/health`
2. Check browser console for errors
3. Verify CORS is enabled (should be by default)

### "No contract code found" warning

**Solution:** This is normal for auto-deployment. The system deploys contracts automatically when creating elections. The warning appears because the default contract address may not have a contract yet.

### Port already in use

**Solution:**

- Backend (3001): Change `PORT` in `backend/.env`
- Frontend (5173): Vite will automatically use the next available port
- Hardhat (8545): Stop other Hardhat nodes or change port in `hardhat.config.js`

## Additional Documentation

- **[SYSTEM_LOGIC.md](./SYSTEM_LOGIC.md)**: In-depth explanation of system architecture and logic
- **[PRESENTATION_QUESTIONS.md](./PRESENTATION_QUESTIONS.md)**: Common questions and answers for presentations

## Security Notes

### For Local Development

- The default `SERVER_PRIVATE_KEY` is a Hardhat test account
- **Never use this key on a public network!**
- It has no real value and is publicly known

### For Production

- Generate a secure private key: `openssl rand -hex 32`
- Store private keys securely (use environment variables or key management)
- Use a public testnet (Sepolia) or mainnet with proper security measures
- Implement user authentication
- Add rate limiting
- Conduct security audits

## Deployment

### Deploying to Public Network

1. **Update Backend `.env`:**

   ```
   RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
   SERVER_PRIVATE_KEY=your_secure_private_key_here
   ```

2. **Fund the Server Account:**

   - Send ETH to the server account address for gas fees
   - Use a faucet for testnets: https://sepoliafaucet.com/

3. **Deploy Contract:**

   - Contracts are auto-deployed when creating elections
   - Or manually: `cd school-voting && npm run deploy`

4. **Update Frontend:**
   - Update API URL in `frontend/src/api.ts` if needed
   - Build: `npm run build`
   - Deploy to hosting (Vercel, Netlify, etc.)

## Scripts Reference

### Smart Contract (`school-voting/`)

- `npm test` - Run contract tests
- `npm run deploy` - Deploy contract (manual, auto-deployment is preferred)
- `npx hardhat compile` - Compile contracts
- `npx hardhat node` - Start local blockchain

### Backend (`backend/`)

- `python -m uvicorn app:app --reload --port 3001` - Start API server
- `pip install -r requirements.txt` - Install dependencies

### Frontend (`frontend/`)

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Contributing

This is a demonstration project. Feel free to:

- Report issues
- Suggest improvements
- Fork and modify for your needs

## License

This project is for educational purposes. Use at your own risk.

## Acknowledgments

- Built with [Hardhat](https://hardhat.org/)
- Frontend uses [React](https://react.dev/) + [Vite](https://vitejs.dev/)
- Backend uses [FastAPI](https://fastapi.tiangolo.com/)
- Blockchain interaction via [web3.py](https://web3py.readthedocs.io/)

---

**Need Help?** Check the troubleshooting section or review `SYSTEM_LOGIC.md` for detailed explanations.
