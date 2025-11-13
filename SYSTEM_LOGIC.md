# Blockchain Voting System - In-Depth Logic Documentation

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Election Creation Flow](#election-creation-flow)
3. [Voting Mechanism](#voting-mechanism)
4. [Blockchain Reconstruction](#blockchain-reconstruction)
5. [Storage Strategy](#storage-strategy)
6. [Security & Tampering Prevention](#security--tampering-prevention)
7. [Data Flow Diagrams](#data-flow-diagrams)

---

## System Architecture

### Components

1. **Frontend (React + TypeScript)**

   - User interface for creating/joining elections
   - Voting interface
   - Blockchain viewer
   - Results display

2. **Backend (Python FastAPI)**

   - Smart contract deployment
   - Vote submission to blockchain
   - Data retrieval from smart contracts

3. **Smart Contract (Solidity)**

   - Stores votes on blockchain
   - Prevents duplicate voting
   - Provides vote counts

4. **Blockchain (Hardhat Local Node)**
   - Stores all votes immutably
   - Provides transparency

---

## Election Creation Flow

### Step-by-Step Process

```
User Creates Election
    ↓
1. Generate Election ID (random string)
    ↓
2. Calculate Duration (endTime - now)
    ↓
3. Try to Deploy Smart Contract
    ├─ Success → Get contractAddress
    └─ Failure → Continue with local blockchain
    ↓
4. Create Election Object
    - id, title, description, candidates
    - endTime, createdAt, status
    - contractAddress (if deployed)
    ↓
5. Create ElectionData Object
    - election: Election object
    - blockchain: [genesisBlock]
    - votedIds: Set (empty)
    - contractAddress: string | undefined
    ↓
6. Save to State & localStorage
    - If contract exists → Save metadata only
    - If no contract → Save everything
```

### Code Location

- **File:** `frontend/src/App.tsx`
- **Function:** `handleCreateElection()` (lines 358-457)

### Key Logic Points

1. **Contract Deployment:**

   ```typescript
   // Try to deploy contract if backend is available
   const deployResult = await api.deployContract(
     electionData.candidates,
     100, // maxVoters
     durationHours
   );
   contractAddress = deployResult.contractAddress;
   ```

2. **Genesis Block Creation:**

   ```typescript
   blockchain: [createGenesisBlock()];
   // Genesis block has:
   // - index: 0
   // - votes: []
   // - previousHash: "0"
   // - hash: calculated from data
   ```

3. **Storage Decision:**
   ```typescript
   // If contract exists, only save metadata
   if (contractAddress) {
     // Save: title, candidates, endTime, contractAddress
     // Don't save: blockchain, votedIds
   }
   ```

---

## Voting Mechanism

### Two Voting Paths

#### Path 1: Backend Voting (Contract Elections)

```
User Clicks Vote
    ↓
1. Generate Voter ID (sessionStorage-based)
    ↓
2. Check if Tab Has Voted (sessionStorage)
    ├─ Yes → Block vote
    └─ No → Continue
    ↓
3. Call Backend API: api.vote(candidate, voterId, contractAddress)
    ↓
4. Backend Generates Anonymous Address
    - Random Ethereum address (one-time use)
    - Cannot be traced back to voter ID
    ↓
5. Backend Submits to Smart Contract
    - Contract prevents duplicate addresses
    - Vote is recorded on blockchain
    ↓
6. Frontend Updates Local State
    - Create new Block with vote
    - Add to blockchain array
    - Update sessionStorage (mark tab as voted)
    ↓
7. Refresh Backend Data
    - Fetch updated vote counts
    - Update UI
```

#### Path 2: Local Voting (No Contract)

```
User Clicks Vote
    ↓
1. Generate Voter ID
    ↓
2. Check sessionStorage (per-tab tracking)
    ├─ Tab has voted → Block
    └─ Tab hasn't voted → Continue
    ↓
3. Create Vote Object
    - voterId: "ANONYMOUS"
    - candidate: selected candidate
    - timestamp: now
    ↓
4. Create New Block
    - index: lastBlock.index + 1
    - votes: [newVote]
    - previousHash: lastBlock.hash
    ↓
5. Mine Block (Proof-of-Work)
    - Find nonce that makes hash start with "00"
    - Difficulty: 2 (for speed)
    ↓
6. Add Block to Blockchain
    - Update state
    - Save to localStorage
    - Mark tab as voted in sessionStorage
```

### Code Location

- **File:** `frontend/src/App.tsx`
- **Function:** `addVote()` (lines 507-778)

### Key Logic Points

1. **SessionStorage Per-Tab Tracking:**

   ```typescript
   // Each tab tracks its own vote status
   sessionStorage.setItem(`election_${electionId}_tab_voted`, "true");
   sessionStorage.setItem(`election_${electionId}_tab_voter_id`, voterId);
   ```

2. **Anonymous Voting (Backend):**

   ```typescript
   // Backend generates random one-time address
   function _generate_anonymous_address():
       random_key = secrets.token_bytes(32)
       account = Account.from_key(random_key)
       return account.address
   ```

3. **Block Mining:**
   ```typescript
   function mineBlock(block, difficulty = 2):
       target = "0".repeat(difficulty) // "00"
       while hash doesn't start with target:
           nonce++
           hash = calculateHash(block with nonce)
       return block with nonce and hash
   ```

---

## Blockchain Reconstruction

### Why Reconstruction is Needed

For elections with contracts:

- Blockchain data is NOT saved to localStorage (security)
- Only metadata is saved (title, candidates, contractAddress)
- When user views election, we need to reconstruct blocks from backend data

### Reconstruction Process

```
User Views Election with Contract
    ↓
1. Load Election Metadata from localStorage
    - Has contractAddress
    - blockchain: [genesisBlock] (minimal)
    ↓
2. Connect to Backend
    - Check backend health
    - Fetch candidates with vote counts
    ↓
3. Reconstruct Votes from Backend Data
    For each candidate:
        voteCount = backend.voteCount
        For i = 0 to voteCount:
            create Vote {
                voterId: "ANONYMOUS",
                candidate: candidate.name,
                timestamp: createdAt + (i * 1000)
            }
    ↓
4. Reconstruct Blocks from Votes
    For each vote:
        Create Block {
            index: blocks.length,
            timestamp: vote.timestamp,
            votes: [vote], // One vote per block
            previousHash: previousBlock.hash,
            hash: "",
            nonce: 0
        }
        Mine block (find nonce)
        Add to blocks array
    ↓
5. Display Reconstructed Blockchain
    - Show genesis block + all vote blocks
    - All properly linked with previousHash
```

### Code Location

- **File:** `frontend/src/App.tsx`
- **Function:** `blockchain` useMemo (lines 782-845)

### Key Logic Points

1. **Vote Reconstruction:**

   ```typescript
   // Create votes from backend vote counts
   for (const candidate of smartContractData.candidates) {
     const count = parseInt(candidate.voteCount);
     for (let i = 0; i < count; i++) {
       votes.push({
         voterId: "ANONYMOUS",
         candidate: candidate.name,
         timestamp: createdAt + i * 1000,
       });
     }
   }
   ```

2. **Block Creation:**

   ```typescript
   // One vote per block for transparency
   for (let i = 0; i < votes.length; i++) {
     const vote = votes[i];
     const newBlock = {
       index: blocks.length,
       timestamp: vote.timestamp,
       votes: [vote], // Single vote
       previousHash: previousBlock.hash,
       hash: "",
       nonce: 0,
     };
     const minedBlock = mineBlock(newBlock);
     blocks.push(minedBlock);
   }
   ```

3. **Why One Vote Per Block?**
   - Maximum transparency
   - Each vote is clearly visible
   - Easier to verify individual votes
   - Matches user expectations

---

## Storage Strategy

### localStorage vs sessionStorage

#### localStorage (Persistent, Shared Across Tabs)

**Used For:**

- Election metadata (title, candidates, endTime, contractAddress)
- Local-only election blockchain data
- Election list (for homepage)

**NOT Used For:**

- Contract election blockchain data (security)
- Contract election vote counts (comes from backend)

**Storage Keys:**

- `blockchain_voting_elections`: JSON object with all elections

#### sessionStorage (Per-Tab, Cleared on Tab Close)

**Used For:**

- Per-tab vote tracking
- Voter ID generation per tab
- Tab-specific state

**Storage Keys:**

- `election_${electionId}_tab_voted`: "true" if tab voted
- `election_${electionId}_tab_voter_id`: Voter ID used in this tab
- `voting_tab_id`: Unique tab identifier

### Storage Logic for Contract Elections

```typescript
// When saving election with contract:
if (contractAddress) {
  // Save ONLY metadata
  toStore[id] = {
    election: {
      id,
      title,
      description,
      candidates,
      endTime,
      createdAt,
      status,
      contractAddress,
    },
    blockchain: null, // NOT saved
    votedIds: [], // NOT saved
    contractAddress: contractAddress,
    metadataOnly: true, // Flag
  };
}
```

### Storage Logic for Local Elections

```typescript
// When saving local-only election:
if (!contractAddress) {
  // Save everything
  toStore[id] = {
    election: electionObject,
    blockchain: blockchainArray, // Full blockchain
    votedIds: Array.from(votedIds), // All voted IDs
    contractAddress: null,
    metadataOnly: false,
  };
}
```

### Code Location

- **File:** `frontend/src/App.tsx`
- **Functions:**
  - `saveElectionsToStorage()` (lines 133-180)
  - `loadElectionsFromStorage()` (lines 67-131)

---

## Security & Tampering Prevention

### Solution 5: Read-Only Mode for Contract Elections

#### Problem

- localStorage can be edited by users
- Vote counts could be tampered with
- Results could be manipulated

#### Solution

1. **Don't Save Blockchain Data:**

   - Contract elections: blockchain NOT saved to localStorage
   - Only metadata saved (for rejoining elections)

2. **Always Use Backend Data:**

   - Vote counts come from blockchain/backend
   - localStorage data is ignored for contract elections

3. **Tampering Detection:**
   - Compare local vs backend data
   - Show warning if mismatch detected
   - Automatically use backend data

### Implementation Details

#### 1. Vote Count Calculation

```typescript
// For contract elections:
if (hasContract && backendConnected && smartContractData?.candidates) {
  // ONLY use backend vote counts
  const backendCandidatesMap = new Map(
    smartContractData.candidates.map((c) => [c.name, c.voteCount])
  );

  // Use backend counts, ignore localStorage
  return candidates.map((name) => ({
    name,
    voteCount: backendCandidatesMap.get(name) || "0",
  }));
}
```

#### 2. Results Display

```typescript
// For contract elections:
if (hasContract && backendConnected && smartContractData?.candidates) {
    // Create votes from backend data
    const votes = [];
    for (const candidate of smartContractData.candidates) {
        const count = parseInt(candidate.voteCount);
        for (let i = 0; i < count; i++) {
            votes.push({
                voterId: "ANONYMOUS",
                candidate: candidate.name,
                timestamp: ...
            });
        }
    }
    return votes; // Use backend data, not localStorage
}
```

#### 3. Tampering Detection

```typescript
// Compare local vs backend
for (const backendCandidate of smartContractData.candidates) {
  const localCount = localCounts[backendCandidate.name] || 0;
  const backendCount = parseInt(backendCandidate.voteCount);

  if (localCount !== backendCount) {
    // Tampering detected!
    console.warn(`[TAMPERING DETECTED] ...`);
    toast.error("Local data doesn't match blockchain!");
  }
}
```

### Code Location

- **File:** `frontend/src/App.tsx`
- **Functions:**
  - `candidatesWithVotes` useMemo (lines 893-953)
  - `allVotes` useMemo (lines 864-891)
  - Tampering detection useEffect (lines 1000-1036)

---

## Data Flow Diagrams

### Election Creation Flow

```
┌─────────────┐
│   User      │
│  Creates    │
│  Election   │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Generate ID     │
│ Calculate Time  │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐      Yes      ┌──────────────┐
│ Deploy Contract │───────────────▶│  Success     │
│ to Backend?     │                │  Get Address │
└──────┬──────────┘                └──────┬───────┘
       │ No                                │
       │                                   │
       ▼                                   ▼
┌─────────────────┐                ┌──────────────┐
│ Local Only      │                │ Contract      │
│ Mode            │                │ Election      │
└──────┬──────────┘                └──────┬───────┘
       │                                   │
       └───────────┬──────────────────────┘
                   │
                   ▼
          ┌─────────────────┐
          │ Save to State   │
          │ & localStorage  │
          └─────────────────┘
```

### Voting Flow (Contract Election)

```
┌─────────────┐
│ User Votes  │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Check Tab Vote  │
│ (sessionStorage)│
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Generate        │
│ Anonymous Addr  │
│ (Backend)       │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Submit to       │
│ Smart Contract  │
│ (Blockchain)    │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Update Local    │
│ State (UI)      │
│ Mark Tab Voted  │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Refresh Backend │
│ Data            │
└─────────────────┘
```

### Blockchain Reconstruction Flow

```
┌─────────────────┐
│ Load Election   │
│ from localStorage│
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Has Contract?   │
└──────┬──────────┘
       │ Yes
       ▼
┌─────────────────┐
│ Connect Backend │
│ Fetch Vote Counts│
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Reconstruct     │
│ Votes from      │
│ Backend Data    │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Create Blocks   │
│ (1 vote/block)  │
│ Mine Each Block │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Display         │
│ Blockchain      │
└─────────────────┘
```

---

## Key Design Decisions

### 1. Why One Vote Per Block?

**Decision:** Each vote gets its own block

**Reasoning:**

- Maximum transparency
- Easy to verify individual votes
- Clear audit trail
- Matches user expectations

**Trade-off:**

- More blocks (but blocks are small)
- Slightly more computation (but mining is fast with difficulty 2)

### 2. Why sessionStorage for Vote Tracking?

**Decision:** Use sessionStorage instead of localStorage for per-tab tracking

**Reasoning:**

- Allows multiple tabs to vote independently
- Each tab is isolated
- Prevents cross-tab interference
- Better user experience

**Trade-off:**

- Vote status lost when tab closes (but vote is on blockchain)

### 3. Why Reconstruct Blockchain Instead of Storing It?

**Decision:** Don't save blockchain data for contract elections

**Reasoning:**

- Prevents localStorage tampering
- Always uses authoritative blockchain data
- Ensures data integrity
- Matches blockchain principles

**Trade-off:**

- Requires backend connection to view blockchain
- Slight delay for reconstruction (but fast)

### 4. Why Anonymous Voting?

**Decision:** Use random one-time addresses instead of deterministic addresses

**Reasoning:**

- True anonymity (not pseudonymity)
- Cannot trace votes back to voter IDs
- No address derivation possible
- Better privacy

**Trade-off:**

- Cannot check if specific voter ID voted (but sessionStorage handles this)

---

## State Management

### Election State Structure

```typescript
interface ElectionData {
  election: {
    id: string;
    title: string;
    description: string;
    candidates: string[];
    endTime: number;
    createdAt: number;
    status: "active" | "closed";
    contractAddress?: string;
  };
  blockchain: Block[]; // Array of blocks
  votedIds: Set<string>; // Not used for contracts
  contractAddress?: string;
}
```

### State Updates

1. **Election Creation:**

   - Add to `elections` Map
   - Save to localStorage (metadata only if contract)

2. **Vote Submission:**

   - Add block to `blockchain` array
   - Update `votedIds` (local only)
   - Mark tab in sessionStorage

3. **Backend Data Refresh:**
   - Update `smartContractData` state
   - Trigger blockchain reconstruction
   - Update UI

### Code Location

- **File:** `frontend/src/App.tsx`
- **State Variables:**
  - `elections`: Map<string, ElectionData>
  - `currentElectionId`: string | null
  - `backendConnected`: boolean
  - `smartContractData`: { candidates, stats } | null

---

## Error Handling

### Backend Connection Failures

```typescript
// If backend not available:
- Show "Local Blockchain Mode" warning
- Fall back to local blockchain
- Still allow voting (local mode)
- Don't fail election creation
```

### Contract Deployment Failures

```typescript
// If contract deployment fails:
- Log warning
- Continue with local blockchain
- Show info toast
- Election still created
```

### Vote Submission Failures

```typescript
// If vote fails:
- Show error message
- Don't update state
- Allow user to retry
- Keep UI in previous state
```

---

## Performance Considerations

### Memoization

**Why:** Prevent unnecessary recalculations

**Memoized Values:**

- `blockchain`: Reconstructed from backend data
- `allVotes`: Extracted from blockchain
- `candidatesWithVotes`: Merged local/backend data
- `isChainValid`: Validates entire chain

**Dependencies:**

- Backend connection status
- Smart contract data
- Current election
- Blockchain state

### Block Mining

**Difficulty:** 2 (hash must start with "00")

**Why Low Difficulty:**

- Fast UI updates
- No noticeable delay
- Still demonstrates proof-of-work
- Good for demo/educational purposes

**Mining Process:**

```typescript
function mineBlock(block, difficulty = 2):
    target = "00"
    nonce = 0
    while hash doesn't start with target:
        nonce++
        hash = calculateHash(block with nonce)
    return block with nonce and hash
```

---

## Testing Scenarios

### Scenario 1: Create Election with Backend

1. Backend running
2. Create election
3. Contract deployed
4. Election saved (metadata only)
5. Can vote via backend

### Scenario 2: Create Election without Backend

1. Backend not running
2. Create election
3. Contract deployment fails
4. Falls back to local blockchain
5. Election saved (full data)
6. Can vote locally

### Scenario 3: Vote in Contract Election

1. Election has contract
2. Backend connected
3. Vote submitted
4. Backend generates anonymous address
5. Vote recorded on blockchain
6. Local state updated
7. Backend data refreshed

### Scenario 4: View Election After Refresh

1. Election has contract
2. Page refreshed
3. Election metadata loaded from localStorage
4. Backend connected
5. Vote counts fetched
6. Blockchain reconstructed
7. All blocks displayed

### Scenario 5: Tampering Attempt

1. User edits localStorage
2. Changes vote counts
3. Page refreshed
4. System detects mismatch
5. Shows warning toast
6. Uses backend data (ignores localStorage)

---

## Summary

This blockchain voting system implements:

1. **Transparency:** All votes visible on blockchain
2. **Anonymity:** Random one-time addresses, no voter ID tracing
3. **Tamper-Proof:** Blockchain data not saved, always uses backend
4. **User-Friendly:** Per-tab voting, clear UI, fast updates
5. **Secure:** Solution 5 prevents localStorage tampering
6. **Flexible:** Works with or without backend

The system prioritizes security and transparency while maintaining a good user experience.
