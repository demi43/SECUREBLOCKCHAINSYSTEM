import { useState, useEffect, useMemo, useRef } from "react";
import { VotingInterface } from "./components/VotingInterface";
import { BlockchainViewer } from "./components/BlockchainViewer";
import { VoteResults } from "./components/VoteResults";
import { HomePage } from "./components/HomePage";
import type { Election } from "./components/HomePage";
import { ElectionTimer } from "./components/ElectionTimer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Button } from "./ui/button";
import { Shield, Vote, BarChart3, Home, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "./api";
import type { Candidate, ElectionStats } from "./api";
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

export interface Vote {
  voterId: string;
  candidate: string;
  timestamp: number;
}

export interface Block {
  index: number;
  timestamp: number;
  votes: Vote[];
  previousHash: string;
  hash: string;
  nonce: number;
}

interface ElectionData {
  election: Election;
  blockchain: Block[];
  votedIds: Set<string>;
  contractAddress?: string;
}

// Helper function to calculate block hash (needed for loading elections)
function calculateHash(block: Block): string {
  const data =
    block.index +
    block.timestamp +
    JSON.stringify(block.votes) +
    block.previousHash +
    block.nonce;

  // Simple hash function for demonstration
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, "0");
}

// Load elections from localStorage on app start
function loadElectionsFromStorage(): Map<string, ElectionData> {
  try {
    const stored = localStorage.getItem("blockchain_voting_elections");
    if (!stored) {
      console.log("No elections found in localStorage");
      return new Map();
    }

    const parsed = JSON.parse(stored);
    const electionsMap = new Map<string, ElectionData>();

    for (const [id, data] of Object.entries(parsed)) {
      const electionData = data as any;
      const contractAddress = electionData.contractAddress || electionData.election?.contractAddress;
      const isMetadataOnly = electionData.metadataOnly === true;
      
      console.log(`Loading election ${id}:`, {
        title: electionData.election?.title,
        candidates: electionData.election?.candidates,
        candidatesCount: electionData.election?.candidates?.length,
        contractAddress: contractAddress,
        metadataOnly: isMetadataOnly,
      });
      
      if (isMetadataOnly && contractAddress) {
        // This is a contract election - only metadata was saved
        // Create a minimal ElectionData with genesis block
        // Real blockchain data will be loaded from backend
        const genesisBlock: Block = {
          index: 0,
          timestamp: electionData.election.createdAt || Date.now(),
          votes: [],
          previousHash: "0",
          hash: "",
          nonce: 0,
        };
        genesisBlock.hash = calculateHash(genesisBlock);
        
        electionsMap.set(id, {
          election: electionData.election,
          blockchain: [genesisBlock], // Start with genesis block, backend will provide real data
          votedIds: new Set(), // Not used for contracts
          contractAddress: contractAddress,
        });
        console.log(`Loaded contract election ${id} metadata (blockchain will load from backend)`);
      } else {
        // Local-only election - load everything
        electionsMap.set(id, {
          election: electionData.election,
          blockchain: electionData.blockchain || [],
          votedIds: new Set(electionData.votedIds || []),
          contractAddress: contractAddress || null,
        });
        console.log(`Loaded local-only election ${id} with full data`);
      }
    }

    console.log(`Loaded ${electionsMap.size} elections from localStorage`);
    return electionsMap;
  } catch (err) {
    console.error("Error loading elections from storage:", err);
    return new Map();
  }
}

// Save elections to localStorage
// SOLUTION 5: Save election metadata for contracts (so users can rejoin), but NOT blockchain/vote data
function saveElectionsToStorage(elections: Map<string, ElectionData>) {
  try {
    const toStore: Record<string, any> = {};
    let savedCount = 0;
    let metadataOnlyCount = 0;
    
    for (const [id, data] of elections.entries()) {
      const contractAddress = data.contractAddress || data.election?.contractAddress;
      
      if (contractAddress) {
        // Save ONLY election metadata (title, description, candidates, endTime, contractAddress)
        // Do NOT save blockchain or vote data - that comes from backend/blockchain
        console.log(`Saving election ${id} metadata only (contract at ${contractAddress})`);
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
          // Don't save blockchain or votedIds for contracts - they're on blockchain
          blockchain: null, // Will be loaded from backend
          votedIds: [], // Not used for contracts
          contractAddress: contractAddress,
          metadataOnly: true, // Flag to indicate this is metadata-only
        };
        metadataOnlyCount++;
      } else {
        // Local-only election - save everything
        console.log(`Saving election ${id} (local-only):`, {
          title: data.election.title,
          candidates: data.election.candidates,
          candidatesCount: data.election.candidates.length,
        });
        toStore[id] = {
          election: data.election,
          blockchain: data.blockchain,
          votedIds: Array.from(data.votedIds), // Convert Set to Array for JSON
          contractAddress: null,
          metadataOnly: false,
        };
        savedCount++;
      }
    }
    
    localStorage.setItem(
      "blockchain_voting_elections",
      JSON.stringify(toStore)
    );
    console.log(`Saved ${savedCount} local-only elections and ${metadataOnlyCount} contract election metadata to localStorage`);
  } catch (err) {
    console.error("Error saving elections to storage:", err);
  }
}

// Listen for storage changes (when other tabs update elections)
function useStorageSync() {
  const [syncKey, setSyncKey] = useState(0);

  useEffect(() => {
    // Listen for changes from other tabs only
    // Note: storage event only fires for OTHER tabs, not the same tab
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "blockchain_voting_elections") {
        setSyncKey((prev) => prev + 1); // Trigger re-render
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return syncKey;
}

function App() {
  const [elections, setElections] = useState<Map<string, ElectionData>>(() =>
    loadElectionsFromStorage()
  );
  const [currentElectionId, setCurrentElectionId] = useState<string | null>(
    null
  );
  const [copiedId, setCopiedId] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("vote");
  const [isMining, setIsMining] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [smartContractData, setSmartContractData] = useState<{
    candidates: Candidate[];
    stats: ElectionStats | null;
  } | null>(null);

  // Sync with other tabs
  const syncKey = useStorageSync();

  // Use a ref to track if we're making a local update (to prevent circular updates)
  const isLocalUpdateRef = useRef(false);

  // Reload elections when storage changes (from other tabs)
  useEffect(() => {
    // Only reload if this is a change from another tab (not a local update)
    if (syncKey > 0 && !isLocalUpdateRef.current) {
      const updated = loadElectionsFromStorage();
      setElections(updated);
    }
    // Don't reset the flag here - each function that sets it will reset it after completion
  }, [syncKey]);

  // Save elections whenever they change
  useEffect(() => {
    // Always save, even if empty (to clear localStorage when all elections are deleted)
    saveElectionsToStorage(elections);
    // Only trigger custom event for cross-tab sync (not for local updates)
    // The storage event will handle cross-tab updates automatically
  }, [elections]);

  // Calculate currentElection first
  const currentElection = currentElectionId
    ? elections.get(currentElectionId)
    : null;

  // Check backend connection and fetch smart contract data
  useEffect(() => {
    if (!currentElectionId || !currentElection) {
      setBackendConnected(false);
      setSmartContractData(null);
      return;
    }

    // Check if this election has a contract address
    const electionContractAddress = currentElection.contractAddress || currentElection.election.contractAddress;
    
    if (!electionContractAddress) {
      // No contract deployed for this election - use local blockchain
      setBackendConnected(false);
      setSmartContractData(null);
      return;
    }

    // Check backend health asynchronously (don't block render)
    let cancelled = false;
    
    // Use setTimeout to ensure this doesn't block initial render
    const timeoutId = setTimeout(() => {
      api.health()
        .then(() => {
          if (cancelled) return;
          setBackendConnected(true);
          // Fetch candidates and stats from smart contract using election-specific address
          Promise.all([
            api.getCandidates(electionContractAddress).catch(() => []),
            api.getStats(electionContractAddress).catch(() => null),
          ]).then(([candidates, stats]) => {
            if (!cancelled) {
              setSmartContractData({ candidates, stats });
            }
          }).catch((error) => {
            if (!cancelled) {
              console.error("Error fetching smart contract data:", error);
              setSmartContractData(null);
            }
          });
        })
        .catch((error) => {
          if (!cancelled) {
            console.warn("Backend not connected:", error);
            setBackendConnected(false);
            setSmartContractData(null);
          }
        });
    }, 100); // Small delay to ensure render happens first
    
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [currentElectionId, currentElection]);

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
      const durationHours = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60)));

      let contractAddress: string | undefined = undefined;

      // Try to deploy contract if backend is available
      try {
        console.log("Attempting to deploy contract to blockchain...");
        const deployResult = await api.deployContract(
          electionData.candidates,
          100, // maxVoters
          durationHours
        );
        contractAddress = deployResult.contractAddress;
        console.log("Contract deployed successfully:", contractAddress);
        toast.success("Election deployed to blockchain!");
      } catch (error) {
        console.warn("Failed to deploy contract, using local blockchain:", error);
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
      
      const newElectionData: ElectionData = {
        election,
        blockchain: [createGenesisBlock()],
        votedIds: new Set(),
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
      setCurrentElectionId(normalizedId);
      toast.success("Joined election successfully!");
    } else {
      // Election not found - this could be because:
      // 1. It was created in a different browser (localStorage is per-browser)
      // 2. Wrong Election ID
      // 3. Election was deleted
      console.warn(
        "Election not found. Available elections:",
        Array.from(elections.keys())
      );
      toast.error(
        `Election "${normalizedId}" not found in this browser! ` +
          `Elections are stored per-browser in localStorage. ` +
          `If this election was created in another browser, you'll need to create it again ` +
          `or have the creator share the Election ID. ` +
          `Available elections in this browser: ${
            elections.size > 0
              ? Array.from(elections.keys()).join(", ")
              : "none"
          }`
      );
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
    const electionContractAddress = currentElection.contractAddress || currentElection.election.contractAddress;
    
    // Try to use backend if connected and contract is deployed, otherwise fall back to local
    if (backendConnected && electionContractAddress) {
      setIsMining(true);
      try {
        // Note: With anonymous voting, we can't check if a voter ID has voted
        // because addresses are random. We rely on frontend sessionStorage tracking
        // and the contract's address-based duplicate prevention

        // Call backend API to vote on real blockchain
        const result = await api.vote(candidate, voterId, electionContractAddress);
        
        setIsMining(false);
        
        // Create the vote object for local blockchain (anonymized - no voter ID stored)
        const newVote: Vote = {
          voterId: "ANONYMOUS", // Don't store actual voter ID for anonymity
          candidate,
          timestamp: Date.now(),
        };

        // Add vote to local blockchain so UI updates immediately
        const lastBlock = currentElection.blockchain[currentElection.blockchain.length - 1];
        const newBlockIndex = lastBlock.index + 1;
        console.log(
          `[BACKEND VOTE] Creating new block #${newBlockIndex}. Current blockchain length: ${currentElection.blockchain.length}`
        );
        
        const newBlock: Block = {
          index: newBlockIndex,
          timestamp: Date.now(),
          votes: [newVote],
          previousHash: lastBlock.hash,
          hash: "",
          nonce: 0,
        };

        // Mine the block (fast with difficulty 2)
        const minedBlock = mineBlock(newBlock);
        const updatedBlockchain = [...currentElection.blockchain, minedBlock];
        
        console.log(
          `[BACKEND VOTE] Blockchain updated. New length: ${updatedBlockchain.length}, New block index: ${minedBlock.index}`
        );
        
        // Mark this tab as having voted (per-tab tracking)
        // Note: For backend votes, the contract prevents duplicate addresses
        // but we still track per-tab to prevent UI confusion
        sessionStorage.setItem(`election_${currentElectionId}_tab_voted`, "true");
        sessionStorage.setItem(`election_${currentElectionId}_tab_voter_id`, voterId);
        
        // Update local state to track this vote AND update blockchain
        const updatedElection: ElectionData = {
          ...currentElection,
          blockchain: updatedBlockchain,
          // Don't update votedIds Set - backend contract handles duplicate prevention
          votedIds: currentElection.votedIds, // Keep existing (for backwards compatibility)
        };
        
        isLocalUpdateRef.current = true;
        setElections((prev) => {
          const newMap = new Map(prev);
          newMap.set(currentElectionId!, updatedElection);
          return newMap;
        });
        setTimeout(() => {
          isLocalUpdateRef.current = false;
        }, 200);
        
        // Refresh smart contract data
        try {
          const [candidates, stats] = await Promise.all([
            api.getCandidates(electionContractAddress),
            api.getStats(electionContractAddress),
          ]);
          setSmartContractData({ candidates, stats });
        } catch (error) {
          console.error("Error refreshing contract data:", error);
        }
        
        return {
          success: true,
          message: `Vote for ${candidate} recorded successfully on the blockchain! Transaction: ${result.transactionHash.slice(0, 10)}...`,
        };
      } catch (error) {
        setIsMining(false);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to submit vote to blockchain",
        };
      }
    } else {
      // Fallback to local blockchain simulation
      console.log("Backend not connected, using local blockchain simulation");
      
      // Use sessionStorage to check if THIS TAB has voted (per-tab tracking)
      // This allows each tab to vote independently
      const tabVoteKey = `election_${currentElectionId}_tab_voted`;
      const hasTabVoted = sessionStorage.getItem(tabVoteKey);
      
      if (hasTabVoted) {
        console.log("This tab has already voted (sessionStorage check)");
        return { success: false, message: "You have already voted in this tab!" };
      }
      
      // Also check if this specific voter ID was used in this tab
      const tabVoterIdKey = `election_${currentElectionId}_tab_voter_id`;
      const tabVoterId = sessionStorage.getItem(tabVoterIdKey);
      
      if (tabVoterId === voterId) {
        console.log("This voter ID was already used in this tab");
        return { success: false, message: "This voter ID has already voted in this tab!" };
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
              // Mark this tab as having voted (per-tab tracking)
              sessionStorage.setItem(`election_${currentElectionId}_tab_voted`, "true");
              sessionStorage.setItem(`election_${currentElectionId}_tab_voter_id`, voterId);
              
              const updatedElection: ElectionData = {
                ...currentElection,
                blockchain: updatedBlockchain,
                // Don't update votedIds Set - use sessionStorage instead for per-tab tracking
                votedIds: currentElection.votedIds, // Keep existing (for backwards compatibility)
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

  // For contract elections, reconstruct blockchain from backend vote data
  // For local elections, use the stored blockchain
  const blockchain = useMemo(() => {
    if (!currentElection) return [];
    
    const hasContract = currentElection.contractAddress || currentElection.election.contractAddress;
    
    // If contract exists and backend is connected, reconstruct blocks from backend votes
    if (hasContract && backendConnected && smartContractData?.candidates) {
      // Get all votes from backend data
      const votes: Vote[] = [];
      for (const candidate of smartContractData.candidates) {
        const count = parseInt(candidate.voteCount);
        for (let i = 0; i < count; i++) {
          votes.push({
            voterId: "ANONYMOUS",
            candidate: candidate.name,
            timestamp: (currentElection.election.createdAt || Date.now()) + (i * 1000), // Spread timestamps
          });
        }
      }
      
      // If no votes, return just genesis block
      if (votes.length === 0) {
        return currentElection.blockchain.length > 0 
          ? currentElection.blockchain 
          : [createGenesisBlock()];
      }
      
      // Reconstruct blocks from votes
      // Each vote gets its own block for maximum transparency
      const blocks: Block[] = [];
      
      // Start with genesis block
      const genesisBlock = currentElection.blockchain[0] || createGenesisBlock();
      blocks.push(genesisBlock);
      
      // Create one block per vote for transparency
      for (let i = 0; i < votes.length; i++) {
        const vote = votes[i];
        const previousBlock = blocks[blocks.length - 1];
        
        const newBlock: Block = {
          index: blocks.length,
          timestamp: vote.timestamp,
          votes: [vote], // One vote per block
          previousHash: previousBlock.hash,
          hash: "",
          nonce: 0,
        };
        
        // Mine the block
        const minedBlock = mineBlock(newBlock);
        blocks.push(minedBlock);
      }
      
      console.log(`[BLOCKCHAIN] Reconstructed ${blocks.length} blocks from ${votes.length} backend votes`);
      return blocks;
    }
    
    // For local elections or when backend not connected, use stored blockchain
    return currentElection.blockchain.length > 0 
      ? currentElection.blockchain 
      : [createGenesisBlock()];
  }, [currentElection, backendConnected, smartContractData, currentElection?.contractAddress]);

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

  // SOLUTION 5: For elections with contracts, use backend data instead of localStorage
  const allVotes = useMemo(() => {
    if (!currentElection) return [];
    
    const hasContract = currentElection.contractAddress || currentElection.election.contractAddress;
    
    // If contract exists and backend is connected, create votes from backend data
    if (hasContract && backendConnected && smartContractData?.candidates) {
      // Create vote objects from backend vote counts (for display purposes)
      // This ensures results match blockchain data, not localStorage
      const votes: Vote[] = [];
      for (const candidate of smartContractData.candidates) {
        const count = parseInt(candidate.voteCount);
        // Create one vote object per vote count (for display)
        for (let i = 0; i < count; i++) {
          votes.push({
            voterId: "ANONYMOUS",
            candidate: candidate.name,
            timestamp: Date.now() - (count - i) * 1000, // Spread timestamps
          });
        }
      }
      return votes;
    }
    
    // No contract or backend not connected - use local blockchain data
    return currentElection.blockchain.flatMap((block) => block.votes);
  }, [currentElection?.blockchain, currentElection?.contractAddress, backendConnected, smartContractData]);

  // Memoize candidate vote counts
  // SOLUTION 5: Always use backend data when contract exists (ignore localStorage tampering)
  const candidatesWithVotes = useMemo(() => {
    if (!currentElection) {
      console.log("No currentElection, returning empty candidates");
      return [];
    }
    
    const localCandidates = currentElection.election.candidates;
    const hasContract = currentElection.contractAddress || currentElection.election.contractAddress;
    
    console.log("=== Candidates Calculation ===");
    console.log("Local election candidates:", localCandidates);
    console.log("Has contract:", hasContract);
    console.log("Backend connected:", backendConnected);
    console.log("Backend candidates:", smartContractData?.candidates);
    
    // SOLUTION 5: If contract exists, ONLY use backend data (ignore localStorage)
    if (hasContract && backendConnected && smartContractData?.candidates) {
      console.log("Using backend data only (contract exists - localStorage ignored for security)");
      
      // Create a map of backend candidates
      const backendCandidatesMap = new Map(
        smartContractData.candidates.map(c => [c.name, c.voteCount])
      );
      
      // Use backend vote counts for all candidates
      const result = localCandidates.map((name) => {
        const backendVoteCount = backendCandidatesMap.get(name);
        // If candidate exists in backend, use backend count, otherwise 0
        return {
          name,
          voteCount: backendVoteCount !== undefined ? backendVoteCount : "0"
        };
      });
      
      console.log("Backend-only candidates result:", result);
      console.log("=============================");
      return result;
    }
    
    // Contract exists but backend not connected - show warning
    if (hasContract && !backendConnected) {
      console.warn("Contract exists but backend not connected - cannot verify vote counts");
      return localCandidates.map((name) => ({
        name,
        voteCount: "N/A" // Can't verify without backend
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
  }, [backendConnected, smartContractData, currentElection?.election.candidates, currentElection?.contractAddress, allVotes]);

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
    if (currentElection && (currentElection.election.status === "closed" || Date.now() > currentElection.election.endTime)) {
      if (activeTab === "vote") {
        setActiveTab("results");
      }
    }
  }, [currentElection, activeTab]);

  // SOLUTION 5: Validate localStorage data against backend (detect tampering)
  useEffect(() => {
    if (!currentElection || !backendConnected) return;
    
    const contractAddress = currentElection.contractAddress || currentElection.election.contractAddress;
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
        <div style={{ padding: "2rem", color: "white", background: "#1a1a1a", minHeight: "100vh" }}>
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

  const votedIds = currentElection.votedIds;

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
            <div className={`p-3 border rounded-lg flex items-center gap-2 ${
              backendConnected 
                ? "bg-green-500/10 border-green-500/30" 
                : "bg-yellow-500/10 border-yellow-500/30"
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                backendConnected ? "bg-green-500" : "bg-yellow-500"
              }`}></div>
              <span className={`text-sm ${
                backendConnected ? "text-green-300" : "text-yellow-300"
              }`}>
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
          defaultValue={currentElection.election.status === "closed" || Date.now() > currentElection.election.endTime ? "results" : "vote"}
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-6"
        >
          <TabsList className={`grid w-full ${currentElection.election.status === "closed" || Date.now() > currentElection.election.endTime ? "grid-cols-2" : "grid-cols-3"} max-w-2xl bg-slate-800/50 border border-slate-700`}>
            {(currentElection.election.status === "active" && Date.now() <= currentElection.election.endTime) && (
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

          {(currentElection.election.status === "active" && Date.now() <= currentElection.election.endTime) && (
            <TabsContent value="vote">
              <VotingInterface
                onVote={async (candidate: string, voterAddress: string) => {
                  const result = await addVote(voterAddress, candidate);
                  if (result.success) {
                    // Store voter ID in sessionStorage (per-tab) to track if this tab has voted
                    // sessionStorage is unique per tab, so each tab can vote independently
                    sessionStorage.setItem(
                      `election_${currentElectionId}_voter`,
                      voterAddress
                    );
                    // Switch to results tab after successful vote
                    setTimeout(() => {
                      setActiveTab("results");
                      toast.success("View your vote in the Results tab!");
                    }, 1500);
                  }
                  return result;
                }}
                hasVoted={(() => {
                  // Use sessionStorage to check if THIS TAB has voted
                  // This is per-tab, so each tab can vote independently
                  const tabVoteKey = `election_${currentElectionId}_tab_voted`;
                  const hasTabVoted = sessionStorage.getItem(tabVoteKey);
                  
                  // Also check the legacy key for backwards compatibility
                  const storedVoter = sessionStorage.getItem(
                    `election_${currentElectionId}_voter`
                  );
                  
                  return !!(hasTabVoted || storedVoter);
                })()}
                candidates={candidatesWithVotes}
                voterAddress={undefined}
                isMining={isMining}
              />
            </TabsContent>
          )}

          <TabsContent value="results">
            <VoteResults votes={allVotes} />
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
