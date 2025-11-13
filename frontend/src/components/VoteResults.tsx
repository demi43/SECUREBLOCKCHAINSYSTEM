import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { BarChart3, Trophy } from 'lucide-react';

interface Vote {
  voterId: string;
  candidate: string;
  timestamp: number;
}

interface VoteResultsProps {
  votes: Vote[];
}

export function VoteResults({ votes }: VoteResultsProps) {
  const voteCounts = votes.reduce((acc, vote) => {
    acc[vote.candidate] = (acc[vote.candidate] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedCandidates = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
  const totalVotes = votes.length;
  const winner = sortedCandidates[0];
  const isTie = sortedCandidates.length > 1 && sortedCandidates[0][1] === sortedCandidates[1][1];

  return (
    <div className="vote-results">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-purple-400" />
            Election Results
          </CardTitle>
          <CardDescription>
            Real-time vote tallies and statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="results-stats">
            <div className="stat-box">
              <span className="stat-label">Total Votes</span>
              <span className="stat-value-large">{totalVotes}</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">Candidates</span>
              <span className="stat-value-large">{sortedCandidates.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {winner && (
        <Card className="mb-4 winner-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-400" />
              {isTie ? 'Tie' : 'Winner'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isTie ? (
              <div className="tie-message">
                <p>There is a tie between multiple candidates!</p>
                <div className="tied-candidates">
                  {sortedCandidates
                    .filter(([_, votes]) => votes === winner[1])
                    .map(([candidate]) => (
                      <div key={candidate} className="tied-candidate">
                        {candidate} - {winner[1]} votes
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="winner-info">
                <div className="winner-name">{winner[0]}</div>
                <div className="winner-votes">{winner[1]} votes</div>
                <div className="winner-percentage">
                  {totalVotes > 0 ? ((winner[1] / totalVotes) * 100).toFixed(1) : 0}%
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Detailed Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="results-list">
            {sortedCandidates.map(([candidate, count]) => {
              const percentage = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
              return (
                <div key={candidate} className="result-item">
                  <div className="result-header">
                    <span className="result-candidate">{candidate}</span>
                    <span className="result-count">
                      {count} vote{count !== 1 ? 's' : ''} ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="result-bar-container">
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

