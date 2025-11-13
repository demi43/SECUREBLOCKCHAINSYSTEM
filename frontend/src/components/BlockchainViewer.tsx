import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Shield, CheckCircle, XCircle } from 'lucide-react';

export interface Block {
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
}

interface BlockchainViewerProps {
  blocks: Block[];
  isValid: boolean;
}

export function BlockchainViewer({ blocks, isValid }: BlockchainViewerProps) {
  console.log('BlockchainViewer rendering. Total blocks:', blocks.length, 'Blocks:', blocks.map(b => `#${b.index}`).join(', '));
  
  return (
    <div className="blockchain-viewer">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-purple-400" />
            Blockchain Explorer
          </CardTitle>
          <CardDescription>
            View all blocks in the blockchain. Each block contains votes and is cryptographically linked to the previous block.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`chain-status ${isValid ? 'chain-valid' : 'chain-invalid'}`}>
            {isValid ? (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>Chain is valid</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5" />
                <span>Chain is invalid</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="blocks-container">
        {blocks.map((block, index) => (
          <Card key={block.index} className="block-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Block #{block.index}</span>
                {block.index === 0 && (
                  <span className="genesis-badge">Genesis Block</span>
                )}
              </CardTitle>
              <CardDescription>
                Mined at {new Date(block.timestamp).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="block-details">
                <div className="block-detail-item">
                  <span className="block-label">Previous Hash:</span>
                  <code className="block-hash">{block.previousHash || '0 (Genesis)'}</code>
                </div>
                <div className="block-detail-item">
                  <span className="block-label">Current Hash:</span>
                  <code className="block-hash">{block.hash}</code>
                </div>
                <div className="block-detail-item">
                  <span className="block-label">Nonce:</span>
                  <code className="block-nonce">{block.nonce}</code>
                </div>
                {block.votes.length > 0 && (
                  <div className="block-votes">
                    <span className="block-label">Votes in this block:</span>
                    <div className="votes-list">
                      {block.votes.map((vote, voteIndex) => (
                        <div key={voteIndex} className="vote-item">
                          <div className="vote-candidate">{vote.candidate}</div>
                          <div className="vote-meta">
                            <span className="vote-voter" style={{ fontStyle: 'italic', color: '#94a3b8' }}>
                              Anonymous Vote #{voteIndex + 1}
                            </span>
                            <span className="vote-time">
                              {new Date(vote.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {block.index > 0 && (
                  <div className="block-link">
                    <div className="block-link-line"></div>
                    <div className="block-link-arrow">↓</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

