/**
 * App.tsx - Main Application Component
 *
 * This is the root component of the blockchain voting application.
 * It manages:
 * - Election state and storage (localStorage)
 * - Real-time updates via Ably (cross-device sync)
 * - Backend API integration for blockchain voting
 * - Vote submission and blockchain management
 * - UI routing between HomePage and Election views
 */

// Import React hooks for state management, side effects, and memoization
import { useState, useEffect, useMemo, useRef } from "react";
// Import UI components
import { VotingInterface } from "./components/VotingInterface";
import { BlockchainViewer } from "./components/BlockchainViewer";
import { VoteResults } from "./components/VoteResults";
import { HomePage } from "./components/HomePage";
import type { Election } from "./components/HomePage";
import { ElectionTimer } from "./components/ElectionTimer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Button } from "./ui/button";
// Import icons for UI elements
import { Shield, Vote, BarChart3, Home, Copy, Check } from "lucide-react";
// Import toast notifications for user feedback
import { toast } from "sonner";
// Import API client for backend communication
import { api } from "./api";
// Import Ably functions for real-time updates and cross-device sync
import {
  subscribeToElectionUpdates,
  publishVoteEvent,
  publishStatsEvent,
  publishUserVoteStatus,
  getUserSessionId,
  setUserSessionId,
  enterPresence,
  publishSessionId,
  subscribeToSessionSync,
  type UserVoteStatus,
} from "./ably";
// Import TypeScript types for API responses
import type { Candidate, ElectionStats } from "./api";
// Import alert dialog components for confirmations
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./components/ui/alert-dialog";

/**
 * Vote interface
 * Represents a single vote in the blockchain
 */
export interface Vote {
  // Voter ID (anonymized as "ANONYMOUS" for privacy)
  voterId: string;
  // Name of the candidate voted for
  candidate: string;
  // Timestamp when the vote was cast (milliseconds since epoch)
  timestamp: number;
}

/**
 * Block interface
 * Represents a block in the blockchain
 */
export interface Block {
  // Sequential index of the block (0 for genesis block)
  index: number;
  // Timestamp when the block was created (milliseconds since epoch)
  timestamp: number;
  // Array of votes contained in this block
  votes: Vote[];
  // Hash of the previous block (creates the chain)
  previousHash: string;
  // Cryptographic hash of this block's data
  hash: string;
  // Nonce value used in mining (proof of work)
  nonce: number;
  // Optional: Transaction hash from blockchain (for contract elections)
  transactionHash?: string;
  // Optional: Block type (genesis, vote, deployment)
  blockType?: 'genesis' | 'vote' | 'deployment';
  // Optional: Contract address (for genesis/deployment blocks)
  contractAddress?: string;
}

/**
 * ElectionData interface
 * Represents the complete data for an election including blockchain
 */
interface ElectionData {
  // Election metadata (title, candidates, dates, etc.)
  election: Election;
  // Array of blocks in the blockchain for this election
  blockchain: Block[];
  // Optional Ethereum contract address if election is deployed to blockchain
  contractAddress?: string;
}

/**
 * Calculate the hash of a block
 *
 * This function creates a cryptographic hash of the block's data.
 * The hash is used to:
 * - Link blocks together (previousHash in next block)
 * - Verify block integrity (any change breaks the hash)
 * - Mine blocks (find nonce that produces hash with required difficulty)
 *
 * @param block - The block to calculate the hash for
 * @returns Hexadecimal hash string (16 characters)
 */
function calculateHash(block: Block): string {
  // Combine all block data into a single string
  // This ensures any change to the block data will change the hash
  const data =
    block.index + // Block index
    block.timestamp + // Creation timestamp
    JSON.stringify(block.votes) + // All votes in the block
    block.previousHash + // Hash of previous block
    block.nonce; // Nonce value (for mining)

  // Simple hash function for demonstration
  // In production, you might use a more secure hash like SHA-256
  let hash = 0;
  // Iterate through each character in the data string
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    // Simple hash algorithm: left shift and add character code
    hash = (hash << 5) - hash + char;
    // Bitwise AND to keep hash within 32-bit integer range
    hash = hash & hash;
  }
  // Convert to positive number, then to hexadecimal, pad to 16 characters
  return Math.abs(hash).toString(16).padStart(16, "0");
}

/**
 * Load elections from localStorage on app start
 *
 * This function retrieves all saved elections from browser localStorage.
 * It handles two types of elections:
 * 1. Contract elections: Only metadata is saved (for security)
 * 2. Local elections: Full blockchain data is saved
 *
 * @returns Map of election ID to ElectionData
 */
function loadElectionsFromStorage(): Map<string, ElectionData> {
  try {
    // Retrieve the stored elections JSON string from localStorage
    const stored = localStorage.getItem("blockchain_voting_elections");
    // If nothing is stored, return empty Map
    if (!stored) {
      console.log("No elections found in localStorage");
      return new Map();
    }

    // Parse the JSON string into an object
    const parsed = JSON.parse(stored);
    // Create a Map to store the elections (Map preserves insertion order)
    const electionsMap = new Map<string, ElectionData>();

    // Iterate through each stored election
    for (const [id, data] of Object.entries(parsed)) {
      const electionData = data as any;
      // Extract contract address (may be in election object or top level)
      const contractAddress =
        electionData.contractAddress || electionData.election?.contractAddress;
      // Check if this is metadata-only storage (contract elections)
      const isMetadataOnly = electionData.metadataOnly === true;

      // Log election details for debugging
      console.log(`Loading election ${id}:`, {
        title: electionData.election?.title,
        candidates: electionData.election?.candidates,
        candidatesCount: electionData.election?.candidates?.length,
        contractAddress: contractAddress,
        metadataOnly: isMetadataOnly,
      });

      // Handle contract elections (deployed to blockchain)
      if (isMetadataOnly && contractAddress) {
        // This is a contract election - only metadata was saved
        // Create a minimal ElectionData with genesis block
        // Real blockchain data will be loaded from backend
        const genesisBlock: Block = {
          index: 0, // Genesis block is always index 0
          timestamp: electionData.election.createdAt || Date.now(), // Use creation time
          votes: [], // No votes in genesis block
          previousHash: "0", // Genesis has no previous block
          hash: "", // Will be calculated
          nonce: 0, // No mining needed for genesis
        };
        // Calculate hash for the genesis block
        genesisBlock.hash = calculateHash(genesisBlock);

        // Store election with just metadata and genesis block
        electionsMap.set(id, {
          election: electionData.election,
          blockchain: [genesisBlock], // Start with genesis block, backend will provide real data
          contractAddress: contractAddress,
        });
        console.log(
          `Loaded contract election ${id} metadata (blockchain will load from backend)`
        );
      } else {
        // Local-only election - load everything including full blockchain
        electionsMap.set(id, {
          election: electionData.election,
          blockchain: electionData.blockchain || [], // Load full blockchain
          contractAddress: contractAddress || null, // No contract for local elections
        });
        console.log(`Loaded local-only election ${id} with full data`);
      }
    }

    // Log total number of elections loaded
    console.log(`Loaded ${electionsMap.size} elections from localStorage`);
    return electionsMap;
  } catch (err) {
    // If parsing fails, log error and return empty Map
    console.error("Error loading elections from storage:", err);
    return new Map();
  }
}

/**
 * Save elections to localStorage
 *
 * This function saves elections to browser localStorage for persistence.
 * For security, contract elections only save metadata (not blockchain data).
 * Local elections save everything including the full blockchain.
 *
 * @param elections - Map of election ID to ElectionData to save
 */
function saveElectionsToStorage(elections: Map<string, ElectionData>) {
  try {
    // Object to store all elections (will be converted to JSON)
    const toStore: Record<string, any> = {};
    // Counters for logging
    let savedCount = 0; // Local elections saved
    let metadataOnlyCount = 0; // Contract elections saved (metadata only)

    // Iterate through each election
    for (const [id, data] of elections.entries()) {
      // Extract contract address if it exists
      const contractAddress =
        data.contractAddress || data.election?.contractAddress;

      // Handle contract elections (deployed to blockchain)
      if (contractAddress) {
        // Save ONLY election metadata (title, description, candidates, endTime, contractAddress)
        // Do NOT save blockchain or vote data - that comes from backend/blockchain
        // This prevents localStorage tampering and ensures data integrity
        console.log(
          `Saving election ${id} metadata only (contract at ${contractAddress})`
        );
        toStore[id] = {
          election: {
            id: data.election.id,
            title: data.election.title,
            description: data.election.description,
            candidates: data.election.candidates,
            endTime: data.election.endTime,
            createdAt: data.election.createdAt,
            status: data.election.status,
            contractAddress: contractAddress,
          },
          // Don't save blockchain for contracts - they're on blockchain
          blockchain: null, // Will be loaded from backend
          contractAddress: contractAddress,
          metadataOnly: true, // Flag to indicate this is metadata-only
        };
        metadataOnlyCount++;
      } else {
        // Local-only election - save everything including full blockchain
        console.log(`Saving election ${id} (local-only):`, {
          title: data.election.title,
          candidates: data.election.candidates,
          candidatesCount: data.election.candidates.length,
        });
        toStore[id] = {
          election: data.election,
          blockchain: data.blockchain, // Save full blockchain for local elections
          contractAddress: null,
          metadataOnly: false,
        };
        savedCount++;
      }
    }

    // Save to localStorage as JSON string
    localStorage.setItem(
      "blockchain_voting_elections",
      JSON.stringify(toStore)
    );
    // Log save summary
    console.log(
      `Saved ${savedCount} local-only elections and ${metadataOnlyCount} contract election metadata to localStorage`
    );
  } catch (err) {
    // If save fails, log error (don't crash the app)
    console.error("Error saving elections to storage:", err);
  }
}

/**
 * Custom hook to sync elections across browser tabs
 *
 * Listens for localStorage changes from other tabs and triggers a re-render.
 * This allows elections created/updated in one tab to appear in other tabs.
 *
 * @returns A sync key that changes when storage is updated (triggers re-render)
 */
function useStorageSync() {
  // State that increments when storage changes (used to trigger re-render)
  const [syncKey, setSyncKey] = useState(0);

  useEffect(() => {
    // Listen for changes from other tabs only
    // Note: storage event only fires for OTHER tabs, not the same tab
    const handleStorageChange = (e: StorageEvent) => {
      // Check if the changed key is our elections storage key
      if (e.key === "blockchain_voting_elections") {
        // Increment sync key to trigger re-render
        setSyncKey((prev) => prev + 1);
      }
    };

    // Add event listener for storage changes
    window.addEventListener("storage", handleStorageChange);

    // Cleanup: remove event listener on unmount
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // Return the sync key (component will re-render when this changes)
  return syncKey;
}

/**
 * Main App Component
 *
 * This is the root component that manages the entire application state and UI.
 * It handles:
 * - Election management (create, join, delete)
 * - Vote submission (local and blockchain)
 * - Real-time updates via Ably
 * - Backend API integration
 * - UI routing (HomePage vs Election view)
 */
function App() {
  // State: Map of all elections (keyed by election ID)
  // Initialize by loading from localStorage on mount
  const [elections, setElections] = useState<Map<string, ElectionData>>(() =>
    loadElectionsFromStorage()
  );
  // State: ID of the currently active/selected election (null if on homepage)
  const [currentElectionId, setCurrentElectionId] = useState<string | null>(
    null
  );
  // State: Whether the election ID was just copied to clipboard
  const [copiedId, setCopiedId] = useState(false);
  // State: Currently active tab in the election view ("vote", "results", "blockchain")
  const [activeTab, setActiveTab] = useState<string>("vote");
  // State: Whether a vote is currently being processed/mined
  const [isMining, setIsMining] = useState(false);
  // State: Whether the backend API is connected and available
  const [backendConnected, setBackendConnected] = useState(false);
  // State: Smart contract data (candidates and stats) fetched from backend
  const [smartContractData, setSmartContractData] = useState<{
    candidates: Candidate[];
    stats: ElectionStats | null;
  } | null>(null);
  // State: Map of user vote status per election (for cross-device sync via Ably)
  // Key: electionId, Value: UserVoteStatus
  const [userVoteStatus, setUserVoteStatus] = useState<
    Map<string, UserVoteStatus>
  >(new Map());

  // Sync with other tabs using the custom hook
  const syncKey = useStorageSync();

  // Use a ref to track if we're making a local update (to prevent circular updates)
  // This prevents infinite loops when we update elections and trigger storage events
  const isLocalUpdateRef = useRef(false);

  // Reload elections when storage changes (from other tabs)
  // This effect runs when syncKey changes (triggered by storage events from other tabs)
  useEffect(() => {
    // Only reload if this is a change from another tab (not a local update)
    // syncKey > 0 means storage was changed, isLocalUpdateRef prevents circular updates
    if (syncKey > 0 && !isLocalUpdateRef.current) {
      // Reload elections from localStorage
      const updated = loadElectionsFromStorage();
      // Update state with reloaded elections
      setElections(updated);
    }
    // Don't reset the flag here - each function that sets it will reset it after completion
  }, [syncKey]);

  // Save elections whenever they change
  // This effect automatically saves elections to localStorage whenever the elections Map changes
  useEffect(() => {
    // Always save, even if empty (to clear localStorage when all elections are deleted)
    saveElectionsToStorage(elections);
    // Only trigger custom event for cross-tab sync (not for local updates)
    // The storage event will handle cross-tab updates automatically
  }, [elections]);

  // Calculate currentElection - get the election data for the currently selected election
  // This is computed from currentElectionId and the elections Map
  const currentElection = currentElectionId
    ? elections.get(currentElectionId)
    : null;

  /**
   * Check backend connection and fetch smart contract data
   *
   * This effect runs when the current election changes.
   * It checks if the election has a contract address and if so:
   * 1. Checks backend health
   * 2. Fetches candidate vote counts from the contract
   * 3. Fetches election statistics from the contract
   *
   * This ensures the UI always shows accurate blockchain data for contract elections.
   */
  useEffect(() => {
    // If no election is selected, reset backend connection state
    if (!currentElectionId || !currentElection) {
      setBackendConnected(false);
      setSmartContractData(null);
      return;
    }

    // Check if this election has a contract address
    const electionContractAddress =
      currentElection.contractAddress ||
      currentElection.election.contractAddress;

    // If no contract, this is a local-only election
    if (!electionContractAddress) {
      // No contract deployed for this election - use local blockchain
      setBackendConnected(false);
      setSmartContractData(null);
      return;
    }

    // Check backend health asynchronously (don't block render)
    // Use cancelled flag to prevent state updates if component unmounts
    let cancelled = false;

    // Use setTimeout to ensure this doesn't block initial render
    const timeoutId = setTimeout(() => {
      // Check if backend is available
      api
        .health()
        .then(() => {
          // If component unmounted, don't update state
          if (cancelled) return;
          // Backend is connected
          setBackendConnected(true);
          // Fetch candidates and stats from smart contract using election-specific address
          // Use Promise.all to fetch both in parallel
          Promise.all([
            api.getCandidates(electionContractAddress).catch(() => []),
            api.getStats(electionContractAddress).catch(() => null),
          ])
            .then(([candidates, stats]) => {
              // If component unmounted, don't update state
              if (!cancelled) {
                // Update state with fetched contract data
                setSmartContractData({ candidates, stats });
              }
            })
            .catch((error) => {
              // If component unmounted, don't update state
              if (!cancelled) {
                console.error("Error fetching smart contract data:", error);
                setSmartContractData(null);
              }
            });
        })
        .catch((error) => {
          // If component unmounted, don't update state
          if (!cancelled) {
            console.warn("Backend not connected:", error);
            setBackendConnected(false);
            setSmartContractData(null);
          }
        });
    }, 100); // Small delay to ensure render happens first

    // Cleanup function: cancel any pending operations if component unmounts
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [currentElectionId, currentElection]);

  /**
   * Subscribe to real-time updates and sync vote status across devices
   *
   * This effect sets up Ably subscriptions for:
   * 1. Vote events - when any user casts a vote
   * 2. Stats updates - when election statistics change
   * 3. User vote status - for cross-device synchronization
   *
   * It also:
   * - Enters presence to show the user is active
   * - Loads saved vote status from localStorage
   * - Syncs vote status across devices using the same userSessionId
   */
  useEffect(() => {
    // If no election is selected, don't set up subscriptions
    if (!currentElectionId || !currentElection) {
      return;
    }

    // Get or create user session ID (persists across devices via localStorage)
    const userSessionId = getUserSessionId();
    console.log(
      "[ABLY] Setting up real-time subscription for election:",
      currentElectionId
    );
    console.log("[ABLY] User session ID:", userSessionId);

    // Enter presence to show user is active on this election channel
    // Returns a cleanup function to leave presence when component unmounts
    const leavePresence = enterPresence(currentElectionId, userSessionId);

    // Check if this user session has voted (from localStorage)
    const voteStatusKey = `election_${currentElectionId}_user_${userSessionId}`;
    const storedVoteStatus = localStorage.getItem(voteStatusKey);
    if (storedVoteStatus) {
      try {
        const status: UserVoteStatus = JSON.parse(storedVoteStatus);
        setUserVoteStatus((prev) =>
          new Map(prev).set(currentElectionId, status)
        );
        console.log("[ABLY] Loaded vote status from localStorage:", status);
      } catch (e) {
        console.error("[ABLY] Failed to parse stored vote status:", e);
      }
    }

    const unsubscribe = subscribeToElectionUpdates(
      currentElectionId,
      // onVote callback - when any user casts a vote
      (voteData) => {
        console.log("[ABLY] Vote received from another client:", voteData);

        // If this is our vote from another device, update local state
        if (voteData.userSessionId === userSessionId) {
          console.log("[ABLY] This is our vote from another device!");
          const status: UserVoteStatus = {
            userSessionId: voteData.userSessionId,
            hasVoted: true,
            votedCandidate: voteData.candidate,
            votedAt: voteData.timestamp,
          };
          setUserVoteStatus((prev) =>
            new Map(prev).set(currentElectionId, status)
          );
          localStorage.setItem(voteStatusKey, JSON.stringify(status));
        }

        toast.success(`New vote cast for ${voteData.candidate}!`);

        // Refresh contract data if available
        const electionContractAddress =
          currentElection.contractAddress ||
          currentElection.election.contractAddress;
        if (electionContractAddress && backendConnected) {
          Promise.all([
            api.getCandidates(electionContractAddress).catch(() => []),
            api.getStats(electionContractAddress).catch(() => null),
          ])
            .then(([candidates, stats]) => {
              setSmartContractData({ candidates, stats });
            })
            .catch((error) => {
              console.error("Error refreshing contract data:", error);
            });
        }
      },
      // onStats callback
      (statsData) => {
        console.log("[ABLY] Stats update received:", statsData);
        setSmartContractData({
          candidates: statsData.candidates || [],
          stats: {
            totalVoters: statsData.totalVoters,
            maxAllowedVoters: statsData.maxAllowedVoters,
            remainingVoters: statsData.remainingVoters,
            isActive: statsData.isActive,
            timeRemaining: statsData.timeRemaining,
          },
        });
      },
      // onUserVoteStatus callback - sync vote status across devices
      (statusData) => {
        console.log("[ABLY] User vote status received:", statusData);

        // Only update if it's for our user session
        if (statusData.userSessionId === userSessionId) {
          setUserVoteStatus((prev) =>
            new Map(prev).set(currentElectionId, statusData)
          );
          localStorage.setItem(voteStatusKey, JSON.stringify(statusData));
        }
      }
    );

    return () => {
      unsubscribe();
      leavePresence();
    };
  }, [currentElectionId, currentElection, backendConnected]);

  function createGenesisBlock(): Block {
    const genesisBlock = {
      index: 0,
      timestamp: Date.now(),
      votes: [],
      previousHash: "0",
      hash: "",
      nonce: 0,
    };
    genesisBlock.hash = calculateHash(genesisBlock);
    return genesisBlock;
  }

  // calculateHash is now defined outside the component (above)

  function mineBlock(block: Block, difficulty: number = 2): Block {
    const target = "0".repeat(difficulty);
    let nonce = 0;
    let hash = "";

    // Break mining into chunks to prevent blocking UI
    const maxIterations = 10000; // Limit iterations per chunk
    let iterations = 0;

    do {
      nonce++;
      iterations++;
      const tempBlock = { ...block, nonce };
      hash = calculateHash(tempBlock);

      // Yield to browser every 1000 iterations to prevent blocking
      if (iterations % 1000 === 0) {
        // This will be handled by setTimeout in addVote
      }
    } while (!hash.startsWith(target) && iterations < maxIterations);

    return { ...block, nonce, hash };
  }

  async function handleCreateElection(
    electionData: Omit<Election, "id" | "createdAt" | "status">
  ) {
    try {
      const id = Math.random().toString(36).substring(2, 10).toUpperCase();
      console.log("Creating election with ID:", id);

      // Calculate duration in hours
      const durationMs = electionData.endTime - Date.now();
      const durationHours = Math.max(
        1,
        Math.ceil(durationMs / (1000 * 60 * 60))
      );

      let contractAddress: string | undefined = undefined;
      let deployResult: { contractAddress: string; transactionHash: string } | undefined = undefined;

      // Try to deploy contract if backend is available
      try {
        console.log("Attempting to deploy contract to blockchain...");
        deployResult = await api.deployContract(
          electionData.candidates,
          100, // maxVoters
          durationHours
        );
        contractAddress = deployResult.contractAddress;
        console.log("Contract deployed successfully:", contractAddress);
        toast.success("Election deployed to blockchain!");
      } catch (error) {
        console.warn(
          "Failed to deploy contract, using local blockchain:",
          error
        );
        // Continue with local blockchain - don't fail the election creation
        toast.info("Using local blockchain (backend not available)");
      }

      const election: Election = {
        ...electionData,
        id,
        createdAt: Date.now(),
        status: "active",
        contractAddress, // Store contract address if deployed
      };

      // Create genesis block - if contract was deployed, include deployment info
      let genesisBlock: Block;
      if (contractAddress && deployResult) {
        // Genesis block with contract deployment info
        genesisBlock = {
          index: 0,
          timestamp: Date.now(),
          votes: [],
          previousHash: "0",
          hash: "",
          nonce: 0,
          transactionHash: deployResult.transactionHash,
          blockType: 'deployment',
          contractAddress: contractAddress,
        };
        genesisBlock.hash = calculateHash(genesisBlock);
      } else {
        // Regular genesis block for local elections
        genesisBlock = createGenesisBlock();
      }

      const newElectionData: ElectionData = {
        election,
        blockchain: [genesisBlock],
        contractAddress, // Store here too
      };

      console.log("Election data created:", {
        id,
        title: election.title,
        candidates: election.candidates,
        candidatesCount: election.candidates.length,
        contractAddress,
      });

      // Mark as local update to prevent circular sync
      isLocalUpdateRef.current = true;

      // Use functional update to ensure we have the latest state
      setElections((prev) => {
        const newMap = new Map(prev);
        newMap.set(id, newElectionData);
        console.log(
          "Election added to Map. Map size:",
          newMap.size,
          "Election ID:",
          id
        );
        return newMap;
      });

      // Publish session ID to Ably channel for this election (for cross-device sync)
      // This allows other devices to automatically sync their session when joining this election
      const userSessionId = getUserSessionId();
      publishSessionId(id, userSessionId)
        .then(() => {
          console.log(`[ABLY] Session ID published for election: ${id}`);
          // Keep publishing every 5 seconds while election is active
          // This ensures devices joining later can still sync
          const interval = setInterval(() => {
            publishSessionId(id, userSessionId).catch((err) => {
              console.warn(`[ABLY] Failed to republish session ID for ${id}:`, err);
            });
          }, 5000);
          
          // Store interval ID to clear when election ends or component unmounts
          (window as any)[`__electionSync_${id}`] = interval;
        })
        .catch((err) => {
          console.warn('[ABLY] Failed to publish session ID for election:', err);
          // Don't fail election creation if Ably fails - election can still work locally
        });

      // Set current election ID after state update is committed
      // Use a longer delay to ensure the Map update has propagated
      setTimeout(() => {
        console.log("Setting currentElectionId to:", id);
        // Double-check the election exists in the Map before setting ID
        setElections((prev) => {
          const electionExists = prev.has(id);
          console.log(
            "Election exists in Map before setting ID?",
            electionExists
          );
          if (electionExists) {
            setCurrentElectionId(id);
            toast.success("Election created successfully!");
          } else {
            console.error("Election not found in Map! This should not happen.");
            toast.error(
              "Failed to navigate to election. Please try joining it manually."
            );
          }
          return prev; // Return unchanged Map
        });
      }, 100);

      // Reset the flag after the save effect has completed
      // Use a delay to ensure all effects have processed
      setTimeout(() => {
        isLocalUpdateRef.current = false;
      }, 200);
    } catch (error) {
      console.error("Error creating election:", error);
      toast.error("Failed to create election. Please try again.");
    }
  }

  function handleJoinElection(electionId: string) {
    const normalizedId = electionId.trim().toUpperCase();
    const election = elections.get(normalizedId);
    console.log("Attempting to join election:", normalizedId);
    console.log("Available elections:", Array.from(elections.keys()));
    console.log("Election found?", !!election);

    if (election) {
      // Election found in localStorage - join directly
      setCurrentElectionId(normalizedId);
      toast.success("Joined election successfully!");
    } else {
      // Election not found locally - try to sync session via Ably first
      // The election ID serves as the sync code
      console.log("Election not found locally, attempting session sync via Ably...");
      toast.info("Syncing session... This will allow you to vote from this device.");
      
      // Subscribe to session sync channel for this election ID
      let timeoutId: ReturnType<typeof setTimeout>;
      const unsubscribe = subscribeToSessionSync(
        normalizedId,
        (receivedSessionId) => {
          // Received session ID - apply it
          clearTimeout(timeoutId);
          console.log("[ABLY] Received session ID, applying...");
          setUserSessionId(receivedSessionId);
          unsubscribe();
          
          // Try to join again after syncing (election might still not be in localStorage)
          const syncedElection = elections.get(normalizedId);
          if (syncedElection) {
            setCurrentElectionId(normalizedId);
            toast.success("Session synced and joined election!");
          } else {
            // Session synced but election still not in localStorage
            // This is OK - the user can still vote if they have the election ID
            // The vote status will sync via Ably's election channel
            toast.success("Session synced! You can now vote in this election.");
            // Optionally, we could try to fetch election data from backend here
            // For now, just sync the session and let the user know
          }
        },
        (error) => {
          clearTimeout(timeoutId);
          console.error('Session sync error:', error);
          toast.error(
            `Election "${normalizedId}" not found!\n\n` +
            `The election may not exist or the creator hasn't shared it yet.\n` +
            `Make sure you have the correct Election ID.`
          );
        }
      );
      
      // Auto-unsubscribe after 10 seconds if no response
      timeoutId = setTimeout(() => {
        unsubscribe();
        toast.warning(
          `Election "${normalizedId}" not found.\n\n` +
          `Make sure:\n` +
          `1. The Election ID is correct\n` +
          `2. The election creator has shared the Election ID\n` +
          `3. Both devices are online`
        );
      }, 10000);
    }
  }

  function handleBackToHome() {
    setCurrentElectionId(null);
  }

  function handleDeleteElection(electionId: string) {
    // Normalize the election ID to uppercase to ensure it matches
    const normalizedId = electionId.trim().toUpperCase();

    // If we're currently viewing the deleted election, go back to home first
    if (currentElectionId === normalizedId) {
      setCurrentElectionId(null);
    }

    // Mark as local update to prevent circular sync
    isLocalUpdateRef.current = true;

    // Delete the election from the Map
    setElections((prev) => {
      // Create a completely new Map to ensure React detects the change
      const newMap = new Map<string, ElectionData>();

      // Copy all elections except the one to delete
      for (const [id, data] of prev.entries()) {
        if (id !== normalizedId) {
          newMap.set(id, data);
        }
      }

      return newMap;
    });

    // Reset the flag after the save effect has completed
    setTimeout(() => {
      isLocalUpdateRef.current = false;
    }, 200);

    toast.success("Election deleted successfully!");
  }

  function handleEndElection() {
    if (!currentElection || !currentElectionId) return;

    // Mark as local update to prevent circular sync
    isLocalUpdateRef.current = true;

    const updatedElection: ElectionData = {
      ...currentElection,
      election: {
        ...currentElection.election,
        status: "closed",
      },
    };
    setElections(new Map(elections).set(currentElectionId, updatedElection));

    // Reset the flag after the save effect has completed
    setTimeout(() => {
      isLocalUpdateRef.current = false;
    }, 200);

    toast.success("Election ended successfully!");
  }

  async function addVote(
    voterId: string,
    candidate: string
  ): Promise<{ success: boolean; message: string }> {
    if (!currentElection)
      return { success: false, message: "No active election" };

    // Check if election has been manually closed or time has expired
    if (
      currentElection.election.status === "closed" ||
      Date.now() > currentElection.election.endTime
    ) {
      return {
        success: false,
        message: "This election has ended. No more votes can be cast.",
      };
    }

    // Validate candidate exists
    if (!currentElection.election.candidates.includes(candidate)) {
      return {
        success: false,
        message: `Invalid candidate selected! "${candidate}" is not in the candidate list.`,
      };
    }

    // Get contract address for this election
    const electionContractAddress =
      currentElection.contractAddress ||
      currentElection.election.contractAddress;

    // Try to use backend if connected and contract is deployed, otherwise fall back to local
    if (backendConnected && electionContractAddress) {
      setIsMining(true);
      try {
        // Note: With anonymous voting, we can't check if a voter ID has voted
        // because addresses are random. We rely on Ably cross-device sync
        // and the contract's address-based duplicate prevention

        // Call backend API to vote on real blockchain
        const result = await api.vote(
          candidate,
          voterId,
          electionContractAddress
        );

        setIsMining(false);

        // Add a block to the blockchain display for this vote transaction
        if (currentElectionId && currentElection) {
          const lastBlock = currentElection.blockchain[currentElection.blockchain.length - 1];
          const newBlockIndex = lastBlock ? lastBlock.index + 1 : 1;
          
          const voteBlock: Block = {
            index: newBlockIndex,
            timestamp: Date.now(),
            votes: [{
              voterId: "ANONYMOUS",
              candidate: candidate,
              timestamp: Date.now(),
            }],
            previousHash: lastBlock ? lastBlock.hash : "0",
            hash: "",
            nonce: 0,
            transactionHash: result.transactionHash,
            blockType: 'vote',
          };
          voteBlock.hash = calculateHash(voteBlock);

          // Update the blockchain with the new vote block
          const updatedBlockchain = [...currentElection.blockchain, voteBlock];
          const updatedElection: ElectionData = {
            ...currentElection,
            blockchain: updatedBlockchain,
          };

          // Mark as local update to prevent circular sync
          isLocalUpdateRef.current = true;
          setElections((prev) => {
            const newMap = new Map(prev);
            newMap.set(currentElectionId, updatedElection);
            return newMap;
          });
          setTimeout(() => {
            isLocalUpdateRef.current = false;
          }, 200);
        }

        // Publish vote event to Ably for real-time updates (immediate)
        if (currentElectionId) {
          const userSessionId = getUserSessionId();
          publishVoteEvent(currentElectionId, {
            candidate,
            voterId: "ANONYMOUS",
            userSessionId: userSessionId,
            timestamp: Date.now(),
            transactionHash: result.transactionHash,
          });

          // Publish user vote status for cross-device sync (immediate)
          const voteStatus: UserVoteStatus = {
            userSessionId: userSessionId,
            hasVoted: true,
            votedCandidate: candidate,
            votedAt: Date.now(),
          };
          publishUserVoteStatus(currentElectionId, voteStatus);
          setUserVoteStatus((prev) =>
            new Map(prev).set(currentElectionId, voteStatus)
          );
          localStorage.setItem(
            `election_${currentElectionId}_user_${userSessionId}`,
            JSON.stringify(voteStatus)
          );
        }

        // Wait for transaction to be mined and blockchain state to update before refreshing
        // Backend waits for receipt, but contract state may take a moment to update on Sepolia
        console.log("[VOTE] Waiting for blockchain state to update before refreshing...");
        setTimeout(async () => {
          console.log("[VOTE] Attempting to refresh contract data (first attempt)...");
          try {
            const [candidates, stats] = await Promise.all([
              api.getCandidates(electionContractAddress),
              api.getStats(electionContractAddress),
            ]);
            console.log("[VOTE] Contract data refreshed:", { candidates, stats });
            setSmartContractData({ candidates, stats });
            
            // Publish updated stats to Ably with fresh data
            if (currentElectionId && candidates) {
              console.log("[VOTE] Publishing stats update to Ably");
              publishStatsEvent(currentElectionId, {
                candidates: candidates,
                totalVoters: stats?.totalVoters || "0",
                maxAllowedVoters: stats?.maxAllowedVoters || "0",
                remainingVoters: stats?.remainingVoters || "0",
                isActive: stats?.isActive || true,
                timeRemaining: stats?.timeRemaining || "0",
              });
            }
          } catch (error) {
            console.error("[VOTE] Error refreshing contract data (first attempt):", error);
            // Retry once after another delay - Sepolia can be slow
            setTimeout(async () => {
              console.log("[VOTE] Retrying contract data refresh...");
              try {
                const [candidates, stats] = await Promise.all([
                  api.getCandidates(electionContractAddress),
                  api.getStats(electionContractAddress),
                ]);
                console.log("[VOTE] Contract data refreshed (retry):", { candidates, stats });
                setSmartContractData({ candidates, stats });
                
                // Publish stats with retried data
                if (currentElectionId && candidates) {
                  console.log("[VOTE] Publishing stats update to Ably (retry)");
                  publishStatsEvent(currentElectionId, {
                    candidates: candidates,
                    totalVoters: stats?.totalVoters || "0",
                    maxAllowedVoters: stats?.maxAllowedVoters || "0",
                    remainingVoters: stats?.remainingVoters || "0",
                    isActive: stats?.isActive || true,
                    timeRemaining: stats?.timeRemaining || "0",
                  });
                }
              } catch (retryError) {
                console.error("[VOTE] Error refreshing contract data (retry failed):", retryError);
                // Final retry after longer delay
                setTimeout(async () => {
                  console.log("[VOTE] Final retry for contract data refresh...");
                  try {
                    const [candidates, stats] = await Promise.all([
                      api.getCandidates(electionContractAddress),
                      api.getStats(electionContractAddress),
                    ]);
                    console.log("[VOTE] Contract data refreshed (final retry):", { candidates, stats });
                    setSmartContractData({ candidates, stats });
                  } catch (finalError) {
                    console.error("[VOTE] All refresh attempts failed:", finalError);
                  }
                }, 3000);
              }
            }, 3000); // Increased retry delay for Sepolia
          }
        }, 3000); // Increased initial delay for Sepolia testnet (was 2000ms)

        return {
          success: true,
          message: `Vote for ${candidate} recorded successfully on the blockchain! Transaction: ${result.transactionHash.slice(
            0,
            10
          )}...`,
        };
      } catch (error) {
        setIsMining(false);
        return {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Failed to submit vote to blockchain",
        };
      }
    } else {
      // Fallback to local blockchain simulation
      console.log("Backend not connected, using local blockchain simulation");

      // Check if user has voted using Ably sync (cross-device)
      if (currentElectionId) {
        const userSessionId = getUserSessionId();
        const userStatus = userVoteStatus.get(currentElectionId);
        if (
          userStatus &&
          userStatus.userSessionId === userSessionId &&
          userStatus.hasVoted
        ) {
          return { success: false, message: "You have already voted!" };
        }
      }

      setIsMining(true);

      // Use requestAnimationFrame to break up work and prevent UI blocking
      return new Promise((resolve) => {
        // First frame: prepare the vote
        requestAnimationFrame(() => {
          const newVote: Vote = {
            voterId: "ANONYMOUS", // Don't store actual voter ID for anonymity
            candidate,
            timestamp: Date.now(),
          };

          const lastBlock =
            currentElection.blockchain[currentElection.blockchain.length - 1];
          const newBlockIndex = lastBlock.index + 1;
          console.log(
            `Creating new block #${newBlockIndex}. Current blockchain length: ${currentElection.blockchain.length}`
          );
          const newBlock: Block = {
            index: newBlockIndex,
            timestamp: Date.now(),
            votes: [newVote],
            previousHash: lastBlock.hash,
            hash: "",
            nonce: 0,
          };

          // Second frame: mine the block (this is fast with difficulty 2)
          requestAnimationFrame(() => {
            const minedBlock = mineBlock(newBlock);

            // Third frame: update state (batch all updates)
            requestAnimationFrame(() => {
              const updatedBlockchain = [
                ...currentElection.blockchain,
                minedBlock,
              ];
              console.log(
                `Blockchain updated. New length: ${updatedBlockchain.length}, New block index: ${minedBlock.index}`
              );

              const updatedElection: ElectionData = {
                ...currentElection,
                blockchain: updatedBlockchain,
              };

              // Mark as local update to prevent circular sync
              isLocalUpdateRef.current = true;

              // Batch state updates
              setElections((prev) => {
                const newMap = new Map(prev);
                newMap.set(currentElectionId!, updatedElection);
                return newMap;
              });

              // Reset the flag after the save effect has completed
              setTimeout(() => {
                isLocalUpdateRef.current = false;
              }, 200);

              // Publish vote event to Ably for real-time updates
              if (currentElectionId) {
                const userSessionId = getUserSessionId();
                publishVoteEvent(currentElectionId, {
                  candidate,
                  voterId: "ANONYMOUS",
                  userSessionId: userSessionId,
                  timestamp: Date.now(),
                });

                // Publish user vote status for cross-device sync
                const voteStatus: UserVoteStatus = {
                  userSessionId: userSessionId,
                  hasVoted: true,
                  votedCandidate: candidate,
                  votedAt: Date.now(),
                };
                publishUserVoteStatus(currentElectionId, voteStatus);
                setUserVoteStatus((prev) =>
                  new Map(prev).set(currentElectionId, voteStatus)
                );
                localStorage.setItem(
                  `election_${currentElectionId}_user_${userSessionId}`,
                  JSON.stringify(voteStatus)
                );

                // Calculate and publish stats
                const updatedVotes = updatedBlockchain.flatMap(
                  (block) => block.votes
                );
                const voteCounts = updatedVotes.reduce((acc, vote) => {
                  acc[vote.candidate] = (acc[vote.candidate] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);

                const candidates = currentElection.election.candidates.map(
                  (name) => ({
                    name,
                    voteCount: String(voteCounts[name] || 0),
                  })
                );

                publishStatsEvent(currentElectionId, {
                  candidates,
                  totalVoters: String(updatedVotes.length),
                  maxAllowedVoters: "100",
                  remainingVoters: String(
                    Math.max(0, 100 - updatedVotes.length)
                  ),
                  isActive: currentElection.election.status === "active",
                  timeRemaining: String(
                    Math.max(0, currentElection.election.endTime - Date.now())
                  ),
                });
              }

              // Set mining to false after a small delay to show completion
              setTimeout(() => {
                setIsMining(false);
                resolve({
                  success: true,
                  message: `Vote for ${candidate} recorded successfully on the blockchain!`,
                });
              }, 100);
            });
          });
        });
      });
    }
  }

  // For contract elections, use stored blockchain (or genesis if empty)
  // For local elections, use the stored blockchain
  const blockchain = useMemo(() => {
    if (!currentElection) return [];

    // For all elections, use stored blockchain (contract elections don't store blockchain locally)
    // The blockchain viewer will show the stored blocks or just genesis for contract elections
    return currentElection.blockchain.length > 0
      ? currentElection.blockchain
      : [createGenesisBlock()];
  }, [currentElection]);

  // Memoize expensive calculations to prevent re-computation on every render
  const isChainValid = useMemo(() => {
    if (!blockchain || blockchain.length <= 1) return true;

    for (let i = 1; i < blockchain.length; i++) {
      const currentBlock = blockchain[i];
      const previousBlock = blockchain[i - 1];
      if (currentBlock.hash !== calculateHash(currentBlock)) {
        return false;
      }
      if (currentBlock.previousHash !== previousBlock.hash) {
        return false;
      }
    }
    return true;
  }, [blockchain]);

  // For contract elections, use backend vote counts directly (no reconstruction needed)
  // For local elections, use blockchain data
  const allVotes = useMemo(() => {
    if (!currentElection) return [];

    // For contract elections, we don't reconstruct votes - just use blockchain data from backend
    // The VoteResults component will use candidatesWithVotes which has the real counts
    // For local elections, use the stored blockchain
    return currentElection.blockchain.flatMap((block) => block.votes);
  }, [currentElection?.blockchain]);

  // Memoize candidate vote counts
  // SOLUTION 5: Always use backend data when contract exists (ignore localStorage tampering)
  const candidatesWithVotes = useMemo(() => {
    if (!currentElection) {
      console.log("No currentElection, returning empty candidates");
      return [];
    }

    const localCandidates = currentElection.election.candidates;
    const hasContract =
      currentElection.contractAddress ||
      currentElection.election.contractAddress;

    console.log("=== Candidates Calculation ===");
    console.log("Local election candidates:", localCandidates);
    console.log("Has contract:", hasContract);
    console.log("Backend connected:", backendConnected);
    console.log("Backend candidates:", smartContractData?.candidates);

    // SOLUTION 5: If contract exists, ONLY use backend data (ignore localStorage)
    if (hasContract && backendConnected && smartContractData?.candidates) {
      console.log(
        "Using backend data only (contract exists - localStorage ignored for security)"
      );

      // Create a map of backend candidates
      const backendCandidatesMap = new Map(
        smartContractData.candidates.map((c) => [c.name, c.voteCount])
      );

      // Use backend vote counts for all candidates
      const result = localCandidates.map((name) => {
        const backendVoteCount = backendCandidatesMap.get(name);
        // If candidate exists in backend, use backend count, otherwise 0
        return {
          name,
          voteCount: backendVoteCount !== undefined ? backendVoteCount : "0",
        };
      });

      console.log("Backend-only candidates result:", result);
      console.log("=============================");
      return result;
    }

    // Contract exists but backend not connected - show warning
    if (hasContract && !backendConnected) {
      console.warn(
        "Contract exists but backend not connected - cannot verify vote counts"
      );
      return localCandidates.map((name) => ({
        name,
        voteCount: "N/A", // Can't verify without backend
      }));
    }

    // No contract - use local calculation (local-only election)
    console.log("No contract - using local vote counts (local-only election)");
    const result = localCandidates.map((name) => ({
      name,
      voteCount: String(allVotes.filter((v) => v.candidate === name).length),
    }));

    console.log("Local candidates result:", result);
    console.log("=============================");
    return result;
  }, [
    backendConnected,
    smartContractData,
    currentElection?.election.candidates,
    currentElection?.contractAddress,
    allVotes,
  ]);

  function copyElectionId() {
    if (currentElectionId) {
      navigator.clipboard.writeText(currentElectionId);
      setCopiedId(true);
      toast.success("Election ID copied to clipboard!");
      setTimeout(() => setCopiedId(false), 2000);
    }
  }

  // Use useEffect to ensure election is available before showing the voting interface
  useEffect(() => {
    if (currentElectionId && !currentElection) {
      // Election ID is set but election not found yet - check if it exists in the Map
      const election = elections.get(currentElectionId);
      if (election) {
        // Election found! The component will re-render with currentElection set
        return;
      }

      // Wait a bit longer for state to update (especially after creation)
      // This gives time for the election to be added to the Map
      const timer = setTimeout(() => {
        const electionAfterDelay = elections.get(currentElectionId);
        if (!electionAfterDelay) {
          // If still not found after delay, reset to homepage
          console.warn(
            `Election ${currentElectionId} not found after delay, returning to homepage`
          );
          console.log("Available election IDs:", Array.from(elections.keys()));
          setCurrentElectionId(null);
        }
      }, 300); // Increased delay to 300ms to allow state updates to propagate
      return () => clearTimeout(timer);
    }
  }, [currentElectionId, currentElection, elections]);

  // Automatically switch to results tab for closed elections
  useEffect(() => {
    if (
      currentElection &&
      (currentElection.election.status === "closed" ||
        Date.now() > currentElection.election.endTime)
    ) {
      if (activeTab === "vote") {
        setActiveTab("results");
      }
    }
  }, [currentElection, activeTab]);

  // SOLUTION 5: Validate localStorage data against backend (detect tampering)
  useEffect(() => {
    if (!currentElection || !backendConnected) return;

    const contractAddress =
      currentElection.contractAddress ||
      currentElection.election.contractAddress;
    if (!contractAddress || !smartContractData?.candidates) return;

    // Calculate local vote counts from localStorage
    const localVotes = allVotes;
    const localCounts = localVotes.reduce((acc, vote) => {
      acc[vote.candidate] = (acc[vote.candidate] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Compare with backend (blockchain) data
    let mismatchDetected = false;
    for (const backendCandidate of smartContractData.candidates) {
      const localCount = localCounts[backendCandidate.name] || 0;
      const backendCount = parseInt(backendCandidate.voteCount);

      if (localCount !== backendCount) {
        mismatchDetected = true;
        console.warn(
          `[TAMPERING DETECTED] Vote count mismatch for "${backendCandidate.name}": ` +
            `Local=${localCount}, Blockchain=${backendCount}. ` +
            `Using blockchain data (localStorage ignored).`
        );
      }
    }

    if (mismatchDetected) {
      toast.error(
        "Local data doesn't match blockchain! Using blockchain data for security.",
        { duration: 5000 }
      );
    }
  }, [currentElection, backendConnected, smartContractData, allVotes]);

  // Show homepage if no election is selected or election not found
  if (!currentElectionId || !currentElection) {
    try {
      return (
        <HomePage
          onCreateElection={handleCreateElection}
          onJoinElection={handleJoinElection}
          onDeleteElection={handleDeleteElection}
          elections={Array.from(elections.values()).map((e) => e.election)}
        />
      );
    } catch (error) {
      console.error("Error rendering HomePage:", error);
      return (
        <div
          style={{
            padding: "2rem",
            color: "white",
            background: "#1a1a1a",
            minHeight: "100vh",
          }}
        >
          <h1>Error Loading Homepage</h1>
          <p>{error instanceof Error ? error.message : String(error)}</p>
          <p>Check browser console (F12) for details.</p>
        </div>
      );
    }
  }

  // Safety check - if currentElection is somehow null here, show homepage
  if (!currentElection) {
    console.error(
      "currentElection is null even though currentElectionId is set:",
      currentElectionId
    );
    return (
      <>
        <HomePage
          onCreateElection={handleCreateElection}
          onJoinElection={handleJoinElection}
          onDeleteElection={handleDeleteElection}
          elections={Array.from(elections.values()).map((e) => e.election)}
        />
      </>
    );
  }

  console.log(
    "Rendering election view. Election ID:",
    currentElectionId,
    "Election:",
    currentElection.election.title
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-xl border border-purple-500/30">
                <Shield className="w-10 h-10 text-purple-400" />
              </div>
              <div>
                <h1 className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent text-3xl font-bold">
                  {currentElection.election.title}
                </h1>
                <p className="text-gray-400">
                  {currentElection.election.description ||
                    "Blockchain-powered election"}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={handleBackToHome}
              className="border-slate-700 text-gray-300 hover:bg-slate-800"
            >
              <Home className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </div>
          <div className="mb-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-400 mb-1">
                  Share this Election ID:
                </div>
                <code className="text-purple-400 font-mono">
                  {currentElectionId}
                </code>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={copyElectionId}
                className="border-purple-500/50 text-purple-300 hover:bg-purple-500/10"
              >
                {copiedId ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy ID
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="mb-4">
            <div
              className={`p-3 border rounded-lg flex items-center gap-2 ${
                backendConnected
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-yellow-500/10 border-yellow-500/30"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  backendConnected ? "bg-green-500" : "bg-yellow-500"
                }`}
              ></div>
              <span
                className={`text-sm ${
                  backendConnected ? "text-green-300" : "text-yellow-300"
                }`}
              >
                {backendConnected
                  ? "✓ Connected to Real Blockchain"
                  : "⚠️ Local Blockchain Mode - Backend not connected"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700">
              <div
                className={`w-3 h-3 rounded-full ${
                  isChainValid ? "bg-green-500" : "bg-red-500"
                } shadow-lg ${
                  isChainValid ? "shadow-green-500/50" : "shadow-red-500/50"
                }`}
              />
              <span className="text-gray-200">
                Chain Status: {isChainValid ? "Valid" : "Invalid"}
              </span>
            </div>
            <div className="px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700 text-gray-200">
              Blocks:{" "}
              <span className="text-purple-400">{blockchain.length}</span>
            </div>
            <div className="px-4 py-2 bg-slate-800/50 rounded-lg border border-slate-700 text-gray-200">
              Total Votes:{" "}
              <span className="text-purple-400">{allVotes.length}</span>
            </div>
          </div>
          <div className="mt-4">
            <ElectionTimer
              endTime={currentElection.election.endTime}
              status={currentElection.election.status}
            />
          </div>
          {currentElection.election.status === "active" &&
            Date.now() <= currentElection.election.endTime && (
              <div className="mt-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="danger"
                      className="bg-red-600 hover:bg-red-500"
                    >
                      End Election Now
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-slate-900 border-slate-700">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-gray-100">
                        End Election?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-gray-400">
                        This will immediately close the election and prevent any
                        further votes from being cast. This action cannot be
                        undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-slate-800 border-slate-700 text-gray-300 hover:bg-slate-700">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleEndElection}
                        className="bg-red-600 hover:bg-red-500"
                      >
                        End Election
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
        </div>

        <Tabs
          defaultValue={
            currentElection.election.status === "closed" ||
            Date.now() > currentElection.election.endTime
              ? "results"
              : "vote"
          }
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList
            className={`grid w-full ${
              currentElection.election.status === "closed" ||
              Date.now() > currentElection.election.endTime
                ? "grid-cols-2"
                : "grid-cols-3"
            } max-w-2xl bg-slate-800/50 border border-slate-700`}
          >
            {currentElection.election.status === "active" &&
              Date.now() <= currentElection.election.endTime && (
                <TabsTrigger
                  value="vote"
                  className="flex items-center gap-2 data-[state=active]:bg-purple-600"
                >
                  <Vote className="w-4 h-4" />
                  Cast Vote
                </TabsTrigger>
              )}
            <TabsTrigger
              value="results"
              className="flex items-center gap-2 data-[state=active]:bg-purple-600"
            >
              <BarChart3 className="w-4 h-4" />
              Results
            </TabsTrigger>
            <TabsTrigger
              value="blockchain"
              className="flex items-center gap-2 data-[state=active]:bg-purple-600"
            >
              <Shield className="w-4 h-4" />
              Blockchain
            </TabsTrigger>
          </TabsList>

          {currentElection.election.status === "active" &&
            Date.now() <= currentElection.election.endTime && (
              <TabsContent value="vote">
                <VotingInterface
                  onVote={async (candidate: string, voterAddress: string) => {
                    const result = await addVote(voterAddress, candidate);
                    if (result.success) {
                      // Switch to results tab after successful vote
                      setTimeout(() => {
                        setActiveTab("results");
                        toast.success("View your vote in the Results tab!");
                      }, 1500);
                    }
                    return result;
                  }}
                  hasVoted={(() => {
                    if (!currentElectionId) return false;

                    // Check user vote status (cross-device sync via Ably)
                    const userSessionId = getUserSessionId();
                    const userStatus = userVoteStatus.get(currentElectionId);
                    return !!(
                      userStatus &&
                      userStatus.userSessionId === userSessionId &&
                      userStatus.hasVoted
                    );
                  })()}
                  candidates={candidatesWithVotes}
                  voterAddress={undefined}
                  isMining={isMining}
                />
              </TabsContent>
            )}

          <TabsContent value="results">
            <VoteResults 
              votes={allVotes} 
              candidatesWithVotes={candidatesWithVotes}
              hasContract={!!(currentElection?.contractAddress || currentElection?.election.contractAddress)}
            />
          </TabsContent>

          <TabsContent value="blockchain">
            <BlockchainViewer blocks={blockchain} isValid={isChainValid} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;
