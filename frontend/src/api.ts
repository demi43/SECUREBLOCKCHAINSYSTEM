/**
 * API Client for Blockchain Voting System
 * 
 * This module provides a centralized API client for communicating with the backend server.
 * All API calls go through this module, ensuring consistent error handling and response formatting.
 */

// Get the API base URL from environment variables, or default to localhost
// This allows the API URL to be configured per environment (dev, staging, production)
/**
 * Base URL for backend API requests.
 * - In development, we default to a relative path (`/api`) so Vite can proxy to the backend.
 * - In production, set VITE_API_URL to your deployed backend (e.g. https://api.yourapp.com/api).
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Interface representing a candidate in an election
 * Used for displaying candidate information and vote counts
 */
export interface Candidate {
  // The name of the candidate
  name: string;
  // The number of votes this candidate has received (as string for large numbers)
  voteCount: string;
}

/**
 * Interface representing election statistics
 * Contains information about the election's current state and voter participation
 */
export interface ElectionStats {
  // Total number of voters who have cast their vote
  totalVoters: string;
  // Maximum number of voters allowed in this election
  maxAllowedVoters: string;
  // Number of voters remaining (max - total)
  remainingVoters: string;
  // Whether the election is currently active (not ended)
  isActive: boolean;
  // Time remaining in the election (in milliseconds as string)
  timeRemaining: string;
}

/**
 * Interface representing the winner of an election
 * Returned when querying election results
 */
export interface Winner {
  // Name of the winning candidate
  winnerName: string;
  // Number of votes the winner received
  winnerVotes: string;
  // Whether there was a tie (multiple candidates with same vote count)
  isTie: boolean;
}

/**
 * Interface representing the response from contract deployment
 * Contains the deployed contract address and transaction hash
 */
export interface DeployContractResponse {
  // The Ethereum address where the contract was deployed
  contractAddress: string;
  // The transaction hash of the deployment transaction
  transactionHash: string;
}

/**
 * Generic API response wrapper
 * All API responses follow this format for consistent error handling
 */
export interface ApiResponse<T> {
  // Whether the API call was successful
  success: boolean;
  // The response data (type depends on endpoint)
  data?: T;
  // Error message if the call failed
  error?: string;
}

/**
 * Generic function for making GET requests to the API
 * Handles error parsing and response validation
 * 
 * @param endpoint - The API endpoint to call (e.g., '/candidates')
 * @returns Promise resolving to the response data
 * @throws Error if the request fails or returns invalid data
 */
async function apiCall<T>(endpoint: string): Promise<T> {
  // Variable to hold the fetch response
  let response;
  try {
    // Make the HTTP GET request to the API endpoint
    response = await fetch(`${API_BASE_URL}${endpoint}`);
  } catch (err) {
    // If the request fails (network error, server down, etc.), throw a descriptive error
    throw new Error(`Failed to connect to backend API at ${API_BASE_URL}. Is the server running?`);
  }
  
  // Check if the HTTP response status indicates an error
  if (!response.ok) {
    // Try to parse error response
    // The backend may return error details in JSON format
    let errorMessage: string;
    try {
      // Attempt to parse the error response as JSON
      const errorResult = await response.json();
      // Extract error message from response (may be in 'error' or 'detail' field)
      errorMessage = errorResult.error || errorResult.detail || `API request failed with status ${response.status}`;
    } catch {
      // If JSON parsing fails, use a generic error message with status code
      errorMessage = `API request failed with status ${response.status}`;
    }
    // Throw error with the parsed message
    throw new Error(errorMessage);
  }
  
  // Parse the successful response as JSON
  const result: ApiResponse<T> = await response.json();
  
  // Check if the API returned a success flag (some endpoints may return success: false)
  if (!result.success) {
    // Throw error with the message from the API response
    throw new Error(result.error || 'API call failed');
  }
  
  // Check if data field exists (not undefined or null), but allow false/0/"" as valid values
  // This ensures we have actual data to return, not just a success flag
  if (result.data === undefined || result.data === null) {
    // Log the error for debugging
    console.error(`[API] No data returned from ${endpoint}. Response:`, result);
    // Throw error indicating no data was returned
    throw new Error(`No data returned from API endpoint: ${endpoint}`);
  }
  
  // Return the data from the response
  return result.data;
}

/**
 * Generic function for making POST requests to the API
 * Handles error parsing and response validation for write operations
 * 
 * @param endpoint - The API endpoint to call (e.g., '/vote')
 * @param body - The data to send in the request body
 * @returns Promise resolving to the response data
 * @throws Error if the request fails or returns invalid data
 */
async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  // Variable to hold the fetch response
  let response;
  try {
    // Make the HTTP POST request with JSON body
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      // Specify POST method
      method: 'POST',
      // Set headers to indicate JSON content
      headers: {
        'Content-Type': 'application/json',
      },
      // Convert the body object to JSON string
      body: JSON.stringify(body),
    });
  } catch (err) {
    // If the request fails (network error, server down, etc.), throw a descriptive error
    throw new Error(`Failed to connect to backend API at ${API_BASE_URL}. Is the server running?`);
  }
  
  // Check if response is OK before trying to parse JSON
  // This prevents trying to parse HTML error pages as JSON
  if (!response.ok) {
    // Try to parse as JSON first, fallback to text if it fails (HTML error pages)
    let errorMessage: string;
    try {
      // Attempt to parse the error response as JSON
      const errorResult = await response.json();
      // Extract error message from response
      errorMessage = errorResult.error || errorResult.detail || `API request failed with status ${response.status}`;
    } catch {
      // If JSON parsing fails (HTML error page), get text response
      // This handles cases where the server returns an HTML error page instead of JSON
      const text = await response.text();
      // Use the text response or a generic error message
      errorMessage = text || `API request failed with status ${response.status}`;
    }
    // Throw error with the parsed message
    throw new Error(errorMessage);
  }
  
  // Parse the successful response as JSON
  const result: ApiResponse<T> = await response.json();
  
  // Check if the API returned a success flag
  if (!result.success) {
    // Throw error with the message from the API response
    throw new Error(result.error || 'API call failed');
  }
  
  // Check if data field exists (not undefined or null), but allow false/0/"" as valid values
  // This ensures we have actual data to return
  if (result.data === undefined || result.data === null) {
    // Log the error for debugging
    console.error(`[API] No data returned from POST ${endpoint}. Response:`, result);
    // Throw error indicating no data was returned
    throw new Error(`No data returned from API endpoint: ${endpoint}`);
  }
  
  // Return the data from the response, cast to the expected type
  return result.data as T;
}

/**
 * API client object containing all available API methods
 * Provides a clean interface for making API calls throughout the application
 */
export const api = {
  /**
   * Get the list of candidates for an election
   * @param contractAddress - Optional contract address for election-specific queries
   * @returns Promise resolving to array of candidates with vote counts
   */
  getCandidates: (contractAddress?: string) => {
    // Build URL with optional contract address query parameter
    const url = contractAddress 
      ? `/candidates?contractAddress=${encodeURIComponent(contractAddress)}`
      : '/candidates';
    // Call the API and return typed candidate array
    return apiCall<Candidate[]>(url);
  },
  
  /**
   * Get election statistics (voter counts, status, time remaining)
   * @param contractAddress - Optional contract address for election-specific queries
   * @returns Promise resolving to election statistics
   */
  getStats: (contractAddress?: string) => {
    // Build URL with optional contract address query parameter
    const url = contractAddress 
      ? `/stats?contractAddress=${encodeURIComponent(contractAddress)}`
      : '/stats';
    // Call the API and return typed election stats
    return apiCall<ElectionStats>(url);
  },
  
  /**
   * Get the admin address of an election contract
   * @returns Promise resolving to the admin address string
   */
  getAdmin: () => apiCall<string>('/admin'),
  
  /**
   * Submit a vote for a candidate
   * @param candidate - The name of the candidate to vote for
   * @param voterAddress - The voter's address/ID (used for tracking, anonymized on backend)
   * @param contractAddress - Optional contract address for election-specific voting
   * @returns Promise resolving to transaction hash of the vote
   */
  vote: (candidate: string, voterAddress: string, contractAddress?: string) => 
    // Make POST request with vote data
    apiPost<{ transactionHash: string }>('/vote', { candidate, voterAddress, contractAddress }),
  
  /**
   * End an election (admin only)
   * @param adminAddress - The admin address (for authorization check)
   * @param contractAddress - Optional contract address for election-specific ending
   * @returns Promise resolving to transaction hash of the end election transaction
   */
  endElection: (adminAddress: string, contractAddress?: string) => 
    // Make POST request with end election data
    apiPost<{ transactionHash: string }>('/end-election', { adminAddress, contractAddress }),
  
  /**
   * Get the winner of an election
   * @param contractAddress - Optional contract address for election-specific queries
   * @returns Promise resolving to winner information (name, votes, tie status)
   */
  getWinner: (contractAddress?: string) => {
    // Build URL with optional contract address query parameter
    const url = contractAddress 
      ? `/winner?contractAddress=${encodeURIComponent(contractAddress)}`
      : '/winner';
    // Call the API and return typed winner information
    return apiCall<Winner>(url);
  },
  
  /**
   * Deploy a new election contract to the blockchain
   * @param candidates - Array of candidate names
   * @param maxVoters - Maximum number of voters allowed
   * @param durationHours - Duration of the election in hours
   * @returns Promise resolving to contract address and deployment transaction hash
   */
  deployContract: (candidates: string[], maxVoters: number, durationHours: number) =>
    // Make POST request with contract deployment parameters
    apiPost<DeployContractResponse>('/deploy-contract', {
      candidates,
      maxVoters,
      durationHours,
    }),
  
  /**
   * Check the health status of the backend API
   * Health endpoint has different format, handle it separately
   * @returns Promise resolving to health check response
   */
  health: async () => {
    // Health endpoint has different format, handle it separately
    // Make a simple GET request to the health endpoint
    const response = await fetch(`${API_BASE_URL}/health`);
    // Check if the response is OK
    if (!response.ok) {
      // Throw error if health check fails
      throw new Error(`Health check failed with status ${response.status}`);
    }
    // Parse and return the full result (health endpoint doesn't follow standard ApiResponse format)
    const result = await response.json();
    return result; // Return the full result for health check
  },
};

