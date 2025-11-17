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
  // Optional: Transaction hash from blockchain (for contract elections)
  transactionHash?: string;
  // Optional: Block type (genesis, vote, deployment)
  blockType?: 'genesis' | 'vote' | 'deployment';
  // Optional: Contract address (for genesis/deployment blocks)
  contractAddress?: string;
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
        {blocks.map((block) => (
          <Card key={block.index} className="block-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Block #{block.index}</span>
                <div className="flex items-center gap-2">
                  {block.blockType === 'deployment' && (
                    <span className="genesis-badge">Contract Deployment</span>
                  )}
                  {block.blockType === 'vote' && (
                    <span className="genesis-badge" style={{ backgroundColor: '#10b981' }}>Vote Transaction</span>
                  )}
                  {block.index === 0 && !block.blockType && (
                    <span className="genesis-badge">Genesis Block</span>
                  )}
                </div>
              </CardTitle>
              <CardDescription>
                {block.blockType === 'deployment' ? 'Contract deployed' : block.blockType === 'vote' ? 'Vote cast' : 'Mined'} at {new Date(block.timestamp).toLocaleString()}
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
                {block.transactionHash && (
                  <div className="block-detail-item">
                    <span className="block-label">Transaction Hash:</span>
                    <code className="block-hash" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                      {block.transactionHash}
                    </code>
                    <a 
                      href={`https://sepolia.etherscan.io/tx/${block.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginLeft: '8px', color: '#3b82f6', textDecoration: 'underline' }}
                    >
                      View on Etherscan
                    </a>
                  </div>
                )}
                {block.contractAddress && (
                  <div className="block-detail-item">
                    <span className="block-label">Contract Address:</span>
                    <code className="block-hash" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                      {block.contractAddress}
                    </code>
                    <a 
                      href={`https://sepolia.etherscan.io/address/${block.contractAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginLeft: '8px', color: '#3b82f6', textDecoration: 'underline' }}
                    >
                      View on Etherscan
                    </a>
                  </div>
                )}
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

