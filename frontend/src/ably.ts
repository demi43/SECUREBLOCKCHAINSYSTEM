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

// Export the ablyClient so it can be used elsewhere if needed
export { ablyClient };

