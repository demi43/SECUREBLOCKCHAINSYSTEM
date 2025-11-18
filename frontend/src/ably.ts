// Import the Ably real-time messaging library
import * as Ably from 'ably';

// Get the Ably API key from environment variables (set in .env file)
const ABLY_API_KEY = import.meta.env.VITE_ABLY_API_KEY;

// Initialize the Ably client variable as null (will be set if API key exists)
let ablyClient: Ably.Realtime | null = null;

// Check if the API key is configured
if (ABLY_API_KEY) {
  // Create a new Ably Realtime client instance with the API key
  ablyClient = new Ably.Realtime({ key: ABLY_API_KEY });
  // Log successful initialization to console
  console.log('[ABLY] Client initialized');
} else {
  // Log a warning if API key is not set (real-time features will be disabled)
  console.warn('[ABLY] VITE_ABLY_API_KEY not set. Real-time updates disabled.');
}

/**
 * Get or create a user session ID that persists across devices
 * This allows the same user to vote from multiple devices
 */
// Export function to get or create a user session ID
export function getUserSessionId(): string {
  // Define the localStorage key where we'll store the session ID
  const STORAGE_KEY = 'voting_user_session_id';
  // Try to retrieve existing session ID from localStorage
  let sessionId = localStorage.getItem(STORAGE_KEY);
  
  // Check if no session ID exists yet
  if (!sessionId) {
    // Generate a unique session ID: timestamp + random
    // Combine current timestamp with random string for uniqueness
    sessionId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    // Store the generated session ID in localStorage for persistence
    localStorage.setItem(STORAGE_KEY, sessionId);
    // Log the newly generated session ID
    console.log('[ABLY] Generated new user session ID:', sessionId);
  }
  
  // Return the session ID (either existing or newly generated)
  return sessionId;
}

/**
 * Set a custom user session ID (for syncing across devices)
 */
// Export function to manually set a user session ID
export function setUserSessionId(sessionId: string): void {
  // Define the localStorage key where we'll store the session ID
  const STORAGE_KEY = 'voting_user_session_id';
  // Store the provided session ID in localStorage
  localStorage.setItem(STORAGE_KEY, sessionId);
  // Log that the session ID was set
  console.log('[ABLY] User session ID set to:', sessionId);
}

// Define the structure of a vote event that will be published
export interface VoteEvent {
  // The candidate name that was voted for
  candidate: string;
  // The voter ID (anonymized as "ANONYMOUS" for privacy)
  voterId: string;
  // Track which user session voted (for cross-device sync)
  userSessionId: string; // Track which user session voted
  // Timestamp when the vote was cast
  timestamp: number;
  // Optional blockchain transaction hash (if vote was on-chain)
  transactionHash?: string;
}

// Define the structure of election statistics event
export interface StatsEvent {
  // Array of candidates with their vote counts
  candidates: Array<{ name: string; voteCount: string }>;
  // Total number of voters who have voted
  totalVoters: string;
  // Maximum number of voters allowed in this election
  maxAllowedVoters: string;
  // Number of voters remaining (max - total)
  remainingVoters: string;
  // Whether the election is currently active
  isActive: boolean;
  // Time remaining in the election (in milliseconds as string)
  timeRemaining: string;
}

// Define the structure of user vote status (for cross-device sync)
export interface UserVoteStatus {
  // The user session ID this status belongs to
  userSessionId: string;
  // Whether this user has voted
  hasVoted: boolean;
  // Optional: which candidate they voted for
  votedCandidate?: string;
  // Optional: timestamp when they voted
  votedAt?: number;
}

// Define the structure of a block event (for syncing blockchain across devices)
export interface BlockEvent {
  // The block data to sync
  block: {
    index: number;
    timestamp: number;
    votes: Array<{
      voterId: string;
      candidate: string;
      timestamp: number;
    }>;
    previousHash: string;
    hash: string;
    nonce: number;
    transactionHash?: string;
    blockType?: 'genesis' | 'vote' | 'deployment';
    contractAddress?: string;
  };
  // Election ID this block belongs to
  electionId: string;
  // Timestamp when the block was created
  timestamp: number;
}

// Define the structure of an election ended event (for cross-device election ending)
export interface ElectionEndedEvent {
  // Election ID that was ended
  electionId: string;
  // User session ID of the person who ended the election
  endedBy: string;
  // Timestamp when the election was ended
  timestamp: number;
  // Optional transaction hash if ended on blockchain
  transactionHash?: string;
}

/**
 * Subscribe to real-time updates for an election
 */
// Export function to subscribe to real-time election updates
export function subscribeToElectionUpdates(
  // The unique election ID to subscribe to
  electionId: string,
  // Callback function when a vote event is received
  onVote: (data: VoteEvent) => void,
  // Optional callback function when stats are updated
  onStats?: (data: StatsEvent) => void,
  // Optional callback function when user vote status changes
  onUserVoteStatus?: (data: UserVoteStatus) => void
): () => void {
  // Check if Ably client is initialized and election ID is provided
  if (!ablyClient || !electionId) {
    // Log warning if subscription cannot proceed
    console.warn('[ABLY] Cannot subscribe: client not initialized or no election ID');
    // Return empty function (no-op unsubscribe) if subscription fails
    return () => {};
  }

  // Get or create the Ably channel for this specific election
  const channel = ablyClient.channels.get(`election:${electionId}`);
  
  // Subscribe to vote events
  // Listen for 'vote' messages on the channel
  channel.subscribe('vote', (message) => {
    // Log when a vote event is received
    console.log('[ABLY] Vote event received:', message.data);
    // Call the onVote callback with the vote data (cast to VoteEvent type)
    onVote(message.data as VoteEvent);
  });

  // Subscribe to stats updates
  // Only subscribe if the onStats callback is provided
  if (onStats) {
    // Listen for 'stats' messages on the channel
    channel.subscribe('stats', (message) => {
      // Log when stats update is received
      console.log('[ABLY] Stats update received:', message.data);
      // Call the onStats callback with the stats data (cast to StatsEvent type)
      onStats(message.data as StatsEvent);
    });
  }

  // Subscribe to user vote status updates (for cross-device sync)
  // Only subscribe if the onUserVoteStatus callback is provided
  if (onUserVoteStatus) {
    // Listen for 'user-vote-status' messages on the channel
    channel.subscribe('user-vote-status', (message) => {
      // Log when user vote status is received
      console.log('[ABLY] User vote status received:', message.data);
      // Call the onUserVoteStatus callback with the status data (cast to UserVoteStatus type)
      onUserVoteStatus(message.data as UserVoteStatus);
    });
  }

  // Log successful subscription to the channel
  console.log(`[ABLY] Subscribed to channel: election:${electionId}`);

  // Return an unsubscribe function that can be called to stop listening
  return () => {
    // Unsubscribe from all events on this channel
    channel.unsubscribe();
    // Log that we've unsubscribed
    console.log(`[ABLY] Unsubscribed from channel: election:${electionId}`);
  };
}

/**
 * Publish a vote event to the election channel
 */
// Export function to publish a vote event to all subscribers
export function publishVoteEvent(
  // The unique election ID to publish to
  electionId: string,
  // The vote event data to publish
  voteData: VoteEvent
): void {
  // Check if Ably client is initialized and election ID is provided
  if (!ablyClient || !electionId) {
    // Log warning if publish cannot proceed
    console.warn('[ABLY] Cannot publish: client not initialized or no election ID');
    // Exit early if conditions not met
    return;
  }

  // Get or create the Ably channel for this specific election
  const channel = ablyClient.channels.get(`election:${electionId}`);
  // Publish the vote event to the channel with event name 'vote'
  channel.publish('vote', voteData).then(() => {
    // Log success when vote event is published
    console.log('[ABLY] Vote event published successfully');
  }).catch((err) => {
    // Log error if publish fails
    console.error('[ABLY] Failed to publish vote event:', err);
  });
}

/**
 * Publish user vote status (for cross-device sync)
 */
// Export function to publish user vote status for cross-device synchronization
export function publishUserVoteStatus(
  // The unique election ID to publish to
  electionId: string,
  // The user vote status data to publish
  status: UserVoteStatus
): void {
  // Check if Ably client is initialized and election ID is provided
  if (!ablyClient || !electionId) {
    // Log warning if publish cannot proceed
    console.warn('[ABLY] Cannot publish: client not initialized or no election ID');
    // Exit early if conditions not met
    return;
  }

  // Get or create the Ably channel for this specific election
  const channel = ablyClient.channels.get(`election:${electionId}`);
  // Publish the user vote status to the channel with event name 'user-vote-status'
  channel.publish('user-vote-status', status).then(() => {
    // Log success when user vote status is published
    console.log('[ABLY] User vote status published successfully');
  }).catch((err) => {
    // Log error if publish fails
    console.error('[ABLY] Failed to publish user vote status:', err);
  });
}

/**
 * Publish stats update to the election channel
 */
// Export function to publish election statistics updates
export function publishStatsEvent(
  // The unique election ID to publish to
  electionId: string,
  // The statistics data to publish
  statsData: StatsEvent
): void {
  // Check if Ably client is initialized and election ID is provided
  if (!ablyClient || !electionId) {
    // Log warning if publish cannot proceed
    console.warn('[ABLY] Cannot publish: client not initialized or no election ID');
    // Exit early if conditions not met
    return;
  }

  // Get or create the Ably channel for this specific election
  const channel = ablyClient.channels.get(`election:${electionId}`);
  // Publish the stats update to the channel with event name 'stats'
  channel.publish('stats', statsData).then(() => {
    // Log success when stats event is published
    console.log('[ABLY] Stats event published successfully');
  }).catch((err) => {
    // Log error if publish fails
    console.error('[ABLY] Failed to publish stats event:', err);
  });
}

/**
 * Publish a block event to sync blockchain across devices
 */
// Export function to publish a block event to all subscribers
export function publishBlockEvent(
  // The unique election ID to publish to
  electionId: string,
  // The block data to publish
  block: BlockEvent['block']
): void {
  // Check if Ably client is initialized and election ID is provided
  if (!ablyClient || !electionId) {
    // Log warning if publish cannot proceed
    console.warn('[ABLY] Cannot publish block: client not initialized or no election ID');
    // Exit early if conditions not met
    return;
  }

  // Get or create the Ably channel for this specific election
  const channel = ablyClient.channels.get(`election:${electionId}`);
  
  // Create the block event
  const blockEvent: BlockEvent = {
    block: block,
    electionId: electionId,
    timestamp: Date.now(),
  };
  
  // Publish the block event to the channel with event name 'block'
  channel.publish('block', blockEvent).then(() => {
    // Log success when block event is published
    console.log('[ABLY] Block event published successfully');
  }).catch((err) => {
    // Log error if publish fails
    console.error('[ABLY] Failed to publish block event:', err);
  });
}

/**
 * Publish an election ended event to sync election ending across devices
 */
// Export function to publish an election ended event
export function publishElectionEnded(
  // The unique election ID that was ended
  electionId: string,
  // Optional transaction hash if ended on blockchain
  transactionHash?: string
): void {
  // Check if Ably client is initialized and election ID is provided
  if (!ablyClient || !electionId) {
    // Log warning if publish cannot proceed
    console.warn('[ABLY] Cannot publish election ended: client not initialized or no election ID');
    // Exit early if conditions not met
    return;
  }

  // Get or create the Ably channel for this specific election
  const channel = ablyClient.channels.get(`election:${electionId}`);
  
  // Get the user session ID of the person ending the election
  const endedBy = getUserSessionId();
  
  // Create the election ended event
  const endedEvent: ElectionEndedEvent = {
    electionId: electionId,
    endedBy: endedBy,
    timestamp: Date.now(),
    transactionHash: transactionHash,
  };
  
  // Publish the election ended event to the channel with event name 'election-ended'
  channel.publish('election-ended', endedEvent).then(() => {
    // Log success when election ended event is published
    console.log('[ABLY] Election ended event published successfully');
  }).catch((err) => {
    // Log error if publish fails
    console.error('[ABLY] Failed to publish election ended event:', err);
  });
}

/**
 * Enter presence on the election channel (show user is active)
 */
// Export function to enter presence on the election channel (indicates user is active)
export function enterPresence(electionId: string, userSessionId: string): () => void {
  // Check if Ably client is initialized and election ID is provided
  if (!ablyClient || !electionId) {
    // Return empty function (no-op) if presence cannot be entered
    return () => {};
  }

  // Get or create the Ably channel for this specific election
  const channel = ablyClient.channels.get(`election:${electionId}`);
  // Enter presence on the channel with the user session ID as data
  channel.presence.enter({ userSessionId }).then(() => {
    // Log success when presence is entered
    console.log('[ABLY] Entered presence for election:', electionId);
  }).catch((err) => {
    // Log error if entering presence fails
    console.error('[ABLY] Failed to enter presence:', err);
  });

  // Return a cleanup function that will leave presence when called
  return () => {
    // Leave presence on the channel
    channel.presence.leave().catch((err) => {
      // Log error if leaving presence fails
      console.error('[ABLY] Failed to leave presence:', err);
    });
  };
}

/**
 * Session Sync Interface - for sharing session IDs across devices via Ably
 */
// Define the structure of a session sync event
export interface SessionSyncEvent {
  // The session ID being shared
  sessionId: string;
  // Timestamp when the session was shared
  timestamp: number;
  // Device identifier (optional, for debugging)
  deviceId?: string;
}

/**
 * Generate a short sync code (6 characters) for easy sharing
 * Format: 3 letters + 3 numbers (e.g., "ABC123")
 */
// Export function to generate a short sync code
/**
 * Generate a secure random token for creator verification
 * Uses crypto.randomUUID if available, otherwise falls back to Math.random
 */
export function generateCreatorToken(): string {
  // Use crypto.randomUUID if available (more secure)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback to timestamp + random string
  return `token_${Date.now()}_${Math.random().toString(36).substring(2, 15)}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Get creator token for an election from localStorage
 */
export function getCreatorToken(electionId: string): string | null {
  const key = `election_${electionId}_creator_token`;
  return localStorage.getItem(key);
}

/**
 * Store creator token for an election in localStorage
 */
export function setCreatorToken(electionId: string, token: string): void {
  const key = `election_${electionId}_creator_token`;
  localStorage.setItem(key, token);
}

export function generateSyncCode(): string {
  // Generate 3 random uppercase letters
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude I and O to avoid confusion
  const letterPart = Array.from({ length: 3 }, () => 
    letters[Math.floor(Math.random() * letters.length)]
  ).join('');
  
  // Generate 3 random digits
  const numberPart = Array.from({ length: 3 }, () => 
    Math.floor(Math.random() * 10)
  ).join('');
  
  // Combine letters and numbers: "ABC123"
  return `${letterPart}${numberPart}`;
}

/**
 * Publish session ID to a sync channel using a sync code
 * Other devices can subscribe to this channel using the same sync code
 */
// Export function to publish session ID to a sync channel
export function publishSessionId(
  // The sync code to publish to (e.g., "ABC123")
  syncCode: string,
  // The session ID to share
  sessionId: string
): Promise<void> {
  // Check if Ably client is initialized
  if (!ablyClient) {
    // Log warning if publish cannot proceed
    console.warn('[ABLY] Cannot publish session ID: client not initialized');
    // Return rejected promise if conditions not met
    return Promise.reject(new Error('Ably client not initialized'));
  }

  // Get or create the Ably channel for this sync code
  // Channel name format: "session:sync:ABC123"
  const channel = ablyClient.channels.get(`session:sync:${syncCode.toUpperCase()}`);
  
  // Create the session sync event data
  const syncEvent: SessionSyncEvent = {
    sessionId: sessionId,
    timestamp: Date.now(),
    deviceId: navigator.userAgent.substring(0, 50), // First 50 chars of user agent
  };

  // Publish the session ID to the channel with event name 'session-sync'
  return channel.publish('session-sync', syncEvent).then(() => {
    // Log success when session ID is published
    console.log(`[ABLY] Session ID published to sync code: ${syncCode}`);
  }).catch((err) => {
    // Log error if publish fails
    console.error('[ABLY] Failed to publish session ID:', err);
    throw err;
  });
}

/**
 * Subscribe to a session sync channel and automatically apply the received session ID
 * Returns an unsubscribe function
 */
// Export function to subscribe to a session sync channel
export function subscribeToSessionSync(
  // The sync code to subscribe to (e.g., "ABC123")
  syncCode: string,
  // Callback function when a session ID is received
  onSessionReceived: (sessionId: string) => void,
  // Optional callback for errors
  onError?: (error: Error) => void
): () => void {
  // Check if Ably client is initialized
  if (!ablyClient) {
    // Log warning if subscription cannot proceed
    console.warn('[ABLY] Cannot subscribe to session sync: client not initialized');
    // Call error callback if provided
    if (onError) {
      onError(new Error('Ably client not initialized'));
    }
    // Return empty function (no-op unsubscribe) if subscription fails
    return () => {};
  }

  // Get or create the Ably channel for this sync code
  // Channel name format: "session:sync:ABC123"
  const channel = ablyClient.channels.get(`session:sync:${syncCode.toUpperCase()}`);
  
  // Subscribe to session sync events
  // Listen for 'session-sync' messages on the channel
  channel.subscribe('session-sync', (message) => {
    // Log when a session sync event is received
    console.log('[ABLY] Session sync event received:', message.data);
    
    try {
      // Cast the message data to SessionSyncEvent type
      const syncEvent = message.data as SessionSyncEvent;
      
      // Validate that session ID exists
      if (syncEvent.sessionId) {
        // Log the received session ID
        console.log('[ABLY] Received session ID:', syncEvent.sessionId);
        // Call the callback with the received session ID
        onSessionReceived(syncEvent.sessionId);
      } else {
        // Log error if session ID is missing
        console.error('[ABLY] Received session sync event without session ID');
        if (onError) {
          onError(new Error('Session sync event missing session ID'));
        }
      }
    } catch (err) {
      // Log error if parsing fails
      console.error('[ABLY] Failed to parse session sync event:', err);
      if (onError) {
        onError(err as Error);
      }
    }
  });

  // Log successful subscription to the channel
  console.log(`[ABLY] Subscribed to session sync channel: session:sync:${syncCode.toUpperCase()}`);

  // Return an unsubscribe function that can be called to stop listening
  return () => {
    // Unsubscribe from all events on this channel
    channel.unsubscribe();
    // Log that we've unsubscribed
    console.log(`[ABLY] Unsubscribed from session sync channel: session:sync:${syncCode.toUpperCase()}`);
  };
}

/**
 * Election Data Interface - for sharing election metadata across devices
 */
// Define the structure of election data event
export interface ElectionDataEvent {
  // Election metadata
  election: {
    id: string;
    title: string;
    description?: string;
    candidates: string[];
    endTime: number;
    createdAt: number;
    status: 'active' | 'closed';
    contractAddress?: string;
    creatorId?: string; // ID of the user who created this election (for admin controls)
  };
  // Optional contract address
  contractAddress?: string;
  // Timestamp when the election data was shared
  timestamp: number;
}

/**
 * Publish election data to an Ably channel so other devices can join
 * This allows elections created on one device to be accessible on other devices
 */
// Export function to publish election data to a channel
export function publishElectionData(
  // The election ID to publish to
  electionId: string,
  // The election data to share
  electionData: ElectionDataEvent['election'],
  // Optional contract address
  contractAddress?: string
): Promise<void> {
  // Check if Ably client is initialized
  if (!ablyClient) {
    // Log warning if publish cannot proceed
    console.warn('[ABLY] Cannot publish election data: client not initialized');
    // Return rejected promise if conditions not met
    return Promise.reject(new Error('Ably client not initialized'));
  }

  // Get or create the Ably channel for this election data
  // Channel name format: "election:data:ABC123"
  const channel = ablyClient.channels.get(`election:data:${electionId.toUpperCase()}`);
  
  // Create the election data event
  const dataEvent: ElectionDataEvent = {
    election: electionData,
    contractAddress: contractAddress,
    timestamp: Date.now(),
  };

  // Publish the election data to the channel with event name 'election-data'
  return channel.publish('election-data', dataEvent).then(() => {
    // Log success when election data is published
    console.log(`[ABLY] Election data published for: ${electionId}`);
  }).catch((err) => {
    // Log error if publish fails
    console.error('[ABLY] Failed to publish election data:', err);
    throw err;
  });
}

/**
 * Subscribe to election data channel and receive election metadata
 * Returns an unsubscribe function
 */
// Export function to subscribe to an election data channel
export function subscribeToElectionData(
  // The election ID to subscribe to
  electionId: string,
  // Callback function when election data is received
  onElectionReceived: (data: ElectionDataEvent) => void,
  // Optional callback for errors
  onError?: (error: Error) => void
): () => void {
  // Check if Ably client is initialized
  if (!ablyClient) {
    // Log warning if subscription cannot proceed
    console.warn('[ABLY] Cannot subscribe to election data: client not initialized');
    // Call error callback if provided
    if (onError) {
      onError(new Error('Ably client not initialized'));
    }
    // Return empty function (no-op unsubscribe) if subscription fails
    return () => {};
  }

  // Get or create the Ably channel for this election data
  // Channel name format: "election:data:ABC123"
  const channel = ablyClient.channels.get(`election:data:${electionId.toUpperCase()}`);
  
  // Subscribe to election data events
  // Listen for 'election-data' messages on the channel
  channel.subscribe('election-data', (message) => {
    // Log when an election data event is received
    console.log('[ABLY] Election data event received:', message.data);
    
    try {
      // Cast the message data to ElectionDataEvent type
      const dataEvent = message.data as ElectionDataEvent;
      
      // Validate that election data exists
      if (dataEvent.election) {
        // Log the received election data
        console.log('[ABLY] Received election data:', dataEvent.election.id);
        // Call the callback with the received election data
        onElectionReceived(dataEvent);
      } else {
        // Log error if election data is missing
        console.error('[ABLY] Received election data event without election data');
        if (onError) {
          onError(new Error('Election data event missing election data'));
        }
      }
    } catch (err) {
      // Log error if parsing fails
      console.error('[ABLY] Failed to parse election data event:', err);
      if (onError) {
        onError(err as Error);
      }
    }
  });

  // Log successful subscription to the channel
  console.log(`[ABLY] Subscribed to election data channel: election:data:${electionId.toUpperCase()}`);

  // Return an unsubscribe function that can be called to stop listening
  return () => {
    // Unsubscribe from all events on this channel
    channel.unsubscribe();
    // Log that we've unsubscribed
    console.log(`[ABLY] Unsubscribed from election data channel: election:data:${electionId.toUpperCase()}`);
  };
}

// Export the ablyClient so it can be used elsewhere if needed
export { ablyClient };

