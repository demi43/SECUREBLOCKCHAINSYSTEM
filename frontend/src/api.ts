const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface Candidate {
  name: string;
  voteCount: string;
}

export interface ElectionStats {
  totalVoters: string;
  maxAllowedVoters: string;
  remainingVoters: string;
  isActive: boolean;
  timeRemaining: string;
}

export interface Winner {
  winnerName: string;
  winnerVotes: string;
  isTie: boolean;
}

export interface DeployContractResponse {
  contractAddress: string;
  transactionHash: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function apiCall<T>(endpoint: string): Promise<T> {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`);
  } catch (err) {
    throw new Error(`Failed to connect to backend API at ${API_BASE_URL}. Is the server running?`);
  }
  
  if (!response.ok) {
    // Try to parse error response
    let errorMessage: string;
    try {
      const errorResult = await response.json();
      errorMessage = errorResult.error || errorResult.detail || `API request failed with status ${response.status}`;
    } catch {
      errorMessage = `API request failed with status ${response.status}`;
    }
    throw new Error(errorMessage);
  }
  
  const result: ApiResponse<T> = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'API call failed');
  }
  
  // Check if data field exists (not undefined or null), but allow false/0/"" as valid values
  if (result.data === undefined || result.data === null) {
    console.error(`[API] No data returned from ${endpoint}. Response:`, result);
    throw new Error(`No data returned from API endpoint: ${endpoint}`);
  }
  
  return result.data;
}

async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Failed to connect to backend API at ${API_BASE_URL}. Is the server running?`);
  }
  
  // Check if response is OK before trying to parse JSON
  if (!response.ok) {
    // Try to parse as JSON first, fallback to text if it fails (HTML error pages)
    let errorMessage: string;
    try {
      const errorResult = await response.json();
      errorMessage = errorResult.error || errorResult.detail || `API request failed with status ${response.status}`;
    } catch {
      // If JSON parsing fails (HTML error page), get text response
      const text = await response.text();
      errorMessage = text || `API request failed with status ${response.status}`;
    }
    throw new Error(errorMessage);
  }
  
  const result: ApiResponse<T> = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'API call failed');
  }
  
  // Check if data field exists (not undefined or null), but allow false/0/"" as valid values
  if (result.data === undefined || result.data === null) {
    console.error(`[API] No data returned from POST ${endpoint}. Response:`, result);
    throw new Error(`No data returned from API endpoint: ${endpoint}`);
  }
  
  return result.data as T;
}

export const api = {
  getCandidates: (contractAddress?: string) => {
    const url = contractAddress 
      ? `/candidates?contractAddress=${encodeURIComponent(contractAddress)}`
      : '/candidates';
    return apiCall<Candidate[]>(url);
  },
  getStats: (contractAddress?: string) => {
    const url = contractAddress 
      ? `/stats?contractAddress=${encodeURIComponent(contractAddress)}`
      : '/stats';
    return apiCall<ElectionStats>(url);
  },
  getAdmin: () => apiCall<string>('/admin'),
  hasVoted: (address: string, contractAddress?: string) => {
    const url = contractAddress 
      ? `/has-voted/${address}?contractAddress=${encodeURIComponent(contractAddress)}`
      : `/has-voted/${address}`;
    return apiCall<boolean>(url);
  },
  vote: (candidate: string, voterAddress: string, contractAddress?: string) => 
    apiPost<{ transactionHash: string }>('/vote', { candidate, voterAddress, contractAddress }),
  endElection: (adminAddress: string, contractAddress?: string) => 
    apiPost<{ transactionHash: string }>('/end-election', { adminAddress, contractAddress }),
  getWinner: (contractAddress?: string) => {
    const url = contractAddress 
      ? `/winner?contractAddress=${encodeURIComponent(contractAddress)}`
      : '/winner';
    return apiCall<Winner>(url);
  },
  deployContract: (candidates: string[], maxVoters: number, durationHours: number) =>
    apiPost<DeployContractResponse>('/deploy-contract', {
      candidates,
      maxVoters,
      durationHours,
    }),
  health: async () => {
    // Health endpoint has different format, handle it separately
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}`);
    }
    const result = await response.json();
    return result; // Return the full result for health check
  },
};

