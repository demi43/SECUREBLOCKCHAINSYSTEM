/**
 * VoteResults Component
 * 
 * Displays the results of an election including vote counts, percentages, and winner information.
 * This component receives an array of votes and calculates statistics to display to users.
 */

// Import UI components for building the results display
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
// Import icons for visual elements
import { BarChart3, Trophy } from 'lucide-react';

/**
 * Interface representing a single vote
 * Matches the Vote interface from App.tsx
 */
interface Vote {
  // The voter's ID (anonymized as "ANONYMOUS" for privacy)
  voterId: string;
  // The candidate that was voted for
  candidate: string;
  // Timestamp when the vote was cast
  timestamp: number;
}

/**
 * Interface representing a candidate with vote count (from smart contract)
 */
interface CandidateWithVotes {
  name: string;
  voteCount: string;
}

/**
 * Props interface for VoteResults component
 */
interface VoteResultsProps {
  // Array of all votes cast in the election (for local elections)
  votes: Vote[];
  // Candidates with vote counts from smart contract (for contract elections)
  candidatesWithVotes?: CandidateWithVotes[];
  // Whether this election uses a smart contract
  hasContract?: boolean;
}

/**
 * VoteResults Component
 * 
 * Calculates and displays election results including:
 * - Total vote counts per candidate
 * - Vote percentages
 * - Winner information
 * - Tie detection
 * 
 * @param votes - Array of all votes to analyze and display
 */
export function VoteResults({ votes, candidatesWithVotes, hasContract }: VoteResultsProps) {
  // For contract elections, use candidatesWithVotes from smart contract
  // For local elections, calculate from votes array
  let voteCounts: Record<string, number>;
  let totalVotes: number;

  if (hasContract && candidatesWithVotes && candidatesWithVotes.length > 0) {
    // Use contract data - convert voteCount strings to numbers
    voteCounts = candidatesWithVotes.reduce((acc, candidate) => {
      acc[candidate.name] = parseInt(candidate.voteCount, 10) || 0;
      return acc;
    }, {} as Record<string, number>);
    // Calculate total from contract data
    totalVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);
  } else {
    // Calculate vote counts for each candidate from votes array (local elections)
    voteCounts = votes.reduce((acc, vote) => {
      // Increment the count for this candidate, or initialize to 1 if first vote
      acc[vote.candidate] = (acc[vote.candidate] || 0) + 1;
      // Return the accumulator for the next iteration
      return acc;
    }, {} as Record<string, number>);
    // Calculate total number of votes cast
    totalVotes = votes.length;
  }

  // Sort candidates by vote count (highest first)
  // Convert the voteCounts object to an array of [candidate, count] tuples
  // Sort by count (second element) in descending order
  const sortedCandidates = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
  
  // Get the winner (first candidate in sorted array, which has highest votes)
  const winner = sortedCandidates[0];
  
  // Check if there's a tie (multiple candidates with the same highest vote count)
  // Compare the first and second candidates' vote counts
  const isTie = sortedCandidates.length > 1 && sortedCandidates[0][1] === sortedCandidates[1][1];

  // Render the results UI
  return (
    <div className="vote-results">
      {/* Statistics Card - Shows total votes and number of candidates */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {/* Bar chart icon for statistics */}
            <BarChart3 className="w-6 h-6 text-purple-400" />
            Election Results
          </CardTitle>
          <CardDescription>
            Real-time vote tallies and statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="results-stats">
            {/* Display total number of votes */}
            <div className="stat-box">
              <span className="stat-label">Total Votes</span>
              <span className="stat-value-large">{totalVotes}</span>
            </div>
            {/* Display number of candidates */}
            <div className="stat-box">
              <span className="stat-label">Candidates</span>
              <span className="stat-value-large">{sortedCandidates.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Winner Card - Shows the winner or tie information */}
      {winner && (
        <Card className="mb-4 winner-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {/* Trophy icon for winner */}
              <Trophy className="w-6 h-6 text-yellow-400" />
              {/* Display "Tie" if there's a tie, otherwise "Winner" */}
              {isTie ? 'Tie' : 'Winner'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* If there's a tie, show all tied candidates */}
            {isTie ? (
              <div className="tie-message">
                <p>There is a tie between multiple candidates!</p>
                <div className="tied-candidates">
                  {/* Filter candidates with the same vote count as the winner */}
                  {sortedCandidates
                    .filter(([_, votes]) => votes === winner[1])
                    .map(([candidate]) => (
                      // Display each tied candidate
                      <div key={candidate} className="tied-candidate">
                        {candidate} - {winner[1]} votes
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              // If no tie, show the winner's information
              <div className="winner-info">
                {/* Display winner's name */}
                <div className="winner-name">{winner[0]}</div>
                {/* Display winner's vote count */}
                <div className="winner-votes">{winner[1]} votes</div>
                {/* Calculate and display winner's percentage */}
                <div className="winner-percentage">
                  {/* Calculate percentage: (winner votes / total votes) * 100 */}
                  {/* Use toFixed(1) to show one decimal place */}
                  {totalVotes > 0 ? ((winner[1] / totalVotes) * 100).toFixed(1) : 0}%
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detailed Results Card - Shows all candidates with vote counts and percentages */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="results-list">
            {/* Map over sorted candidates to display each one */}
            {sortedCandidates.map(([candidate, count]) => {
              // Calculate percentage of votes for this candidate
              // Percentage = (candidate votes / total votes) * 100
              const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
              return (
                <div key={candidate} className="result-item">
                  {/* Header showing candidate name and vote count */}
                  <div className="result-header">
                    {/* Display candidate name */}
                    <span className="result-candidate">{candidate}</span>
                    {/* Display vote count and percentage */}
                    <span className="result-count">
                      {/* Show "vote" or "votes" based on count */}
                      {count} vote{count !== 1 ? 's' : ''} ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  {/* Visual bar showing percentage of votes */}
                  <div className="result-bar-container">
                    {/* Bar width is set to the percentage value */}
                    <div
                      className="result-bar"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

