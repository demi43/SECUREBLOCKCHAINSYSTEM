import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Alert, AlertDescription } from '../ui/alert';
import { CheckCircle, AlertCircle, User, Users } from 'lucide-react';

interface VotingInterfaceProps {
  onVote: (candidate: string, voterAddress: string) => Promise<{ success: boolean; message: string }> | { success: boolean; message: string };
  hasVoted: boolean;
  candidates: Array<{ name: string; voteCount: string }> | string[];
  voterAddress?: string;
  isMining?: boolean;
}

export function VotingInterface({ onVote, hasVoted, candidates, voterAddress, isMining: externalIsMining }: VotingInterfaceProps) {
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [voterName, setVoterName] = useState('');
  const [generatedVoterId, setGeneratedVoterId] = useState<string>('');
  const [finalVoterId, setFinalVoterId] = useState<string>('');
  const isMining = externalIsMining || false;
  
  // Generate a unique ID for this tab that persists across page reloads
  // Use sessionStorage to ensure it's unique per tab
  const [tabId] = useState(() => {
    const storageKey = 'voting_tab_id';
    let tabId = sessionStorage.getItem(storageKey);
    if (!tabId) {
      // Generate a unique tab ID: timestamp + random string
      tabId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      sessionStorage.setItem(storageKey, tabId);
    }
    return tabId;
  });

  // Generate a shorter, more readable voter ID
  const generateReadableVoterId = () => {
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    const timestamp = Date.now().toString(36).substring(5, 9).toUpperCase();
    return `VOTER-${timestamp}-${randomPart}`;
  };

  // Initialize generated voter ID on mount
  useEffect(() => {
    if (!voterAddress && !generatedVoterId) {
      const id = generateReadableVoterId();
      setGeneratedVoterId(id);
    }
  }, [voterAddress, generatedVoterId]);

  // Debug: Log candidates to help diagnose issues
  useEffect(() => {
    console.log('=== VotingInterface Candidates Debug ===');
    console.log('Raw candidates prop:', candidates);
    console.log('Candidates type:', Array.isArray(candidates) ? 'array' : typeof candidates);
    console.log('Candidates length:', candidates.length);
    if (candidates.length > 0) {
      console.log('First candidate:', candidates[0]);
      console.log('First candidate type:', typeof candidates[0]);
    }
    const normalizedCandidates: Array<{ name: string; voteCount: string }> = 
      candidates.length > 0 && typeof candidates[0] === 'string'
        ? (candidates as string[]).map(name => ({ name, voteCount: '0' }))
        : (candidates as Array<{ name: string; voteCount: string }>);
    console.log('Normalized candidates:', normalizedCandidates);
    console.log('Candidate names to render:', normalizedCandidates.map(c => c.name));
    console.log('========================================');
  }, [candidates]);

  // Generate colors for candidates dynamically
  const candidateColors = [
    'candidate-option candidate-blue',
    'candidate-option candidate-green',
    'candidate-option candidate-purple',
    'candidate-option candidate-orange',
    'candidate-option candidate-pink',
    'candidate-option candidate-cyan',
    'candidate-option candidate-yellow',
    'candidate-option candidate-red',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCandidate) {
      setResult({ success: false, message: 'Please select a candidate' });
      return;
    }

    if (hasVoted) {
      setResult({ success: false, message: 'You have already voted' });
      return;
    }

    // Generate the final voter ID now (before showing dialog) so we can show it accurately
    let voterId: string;
    if (voterName.trim()) {
      const nameHash = Math.random().toString(36).substring(2, 6).toUpperCase();
      voterId = `${voterName.trim()}-${nameHash}`;
    } else if (voterAddress) {
      voterId = voterAddress;
    } else {
      voterId = generatedVoterId || generateReadableVoterId();
      if (!generatedVoterId) {
        setGeneratedVoterId(voterId);
      }
    }
    
    setFinalVoterId(voterId);  // Store it so we can show it in the dialog and use it when confirming
    setShowConfirmDialog(true);
  };

  const confirmVote = async () => {
    setShowConfirmDialog(false);
    
    // Use the pre-generated voter ID (same one shown in the dialog)
    const voterId = finalVoterId;
    
    if (!voterId) {
      setResult({ success: false, message: 'Voter ID not generated. Please try again.' });
      return;
    }
    
    console.log('Confirming vote for candidate:', selectedCandidate);
    console.log('Voter Name:', voterName);
    console.log('Final Voter ID:', voterId);
    console.log('All available candidates:', candidates);
    
    setIsSubmitting(true);
    setResult(null);
    
    try {
      const response = await Promise.resolve(onVote(selectedCandidate, voterId));
      console.log('Vote response:', response);
      setResult(response);
      
      if (response.success) {
        setSelectedCandidate('');
        // Store the voter ID that was actually used
        sessionStorage.setItem('last_voter_id', voterId);
      }
    } catch (error) {
      console.error('Vote error:', error);
      setResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to submit vote' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCandidateSelect = (candidate: string) => {
    // Allow selection change as long as vote hasn't been submitted yet
    if (!hasVoted && !isSubmitting && !isMining) {
      setSelectedCandidate(candidate);
      setResult(null);
      // Close confirmation dialog if open when changing selection
      if (showConfirmDialog) {
        setShowConfirmDialog(false);
      }
    }
  };

  return (
    <Card className="voting-interface-card">
      <CardHeader>
        <CardTitle className="card-title-with-icon">
          <Users className="icon-purple" />
          Cast Your Vote
        </CardTitle>
        <CardDescription>
          Your vote will be securely recorded on the blockchain and cannot be altered
        </CardDescription>
      </CardHeader>
      <CardContent>
            <form onSubmit={handleSubmit} className="voting-form">
              <div className="form-group">
                <Label htmlFor="voterName" className="label-with-icon">
                  <User className="icon-small" />
                  Your Name / Voter ID (Optional)
                </Label>
                <Input
                  id="voterName"
                  value={voterName}
                  onChange={(e) => setVoterName(e.target.value)}
                  placeholder={generatedVoterId || "Enter your name or leave blank for auto-generated ID"}
                  disabled={hasVoted || isSubmitting || isMining}
                  className={hasVoted || isSubmitting || isMining ? "input-disabled" : ""}
                />
                <p className="form-hint">
                  {voterName.trim() 
                    ? `Your vote will be recorded with your name plus a unique code`
                    : generatedVoterId 
                      ? `Auto-generated ID: ${generatedVoterId}`
                      : "A unique voter ID will be generated when you submit your vote"}
                </p>
              </div>

          <div className="form-group">
            <Label className="form-label">Select Candidate</Label>
            {candidates.length === 0 ? (
              <Alert className="alert-warning">
                <AlertCircle className="alert-icon" />
                <AlertDescription>No candidates available for this election.</AlertDescription>
              </Alert>
            ) : (
              <RadioGroup value={selectedCandidate} onValueChange={handleCandidateSelect}>
                <div className="candidates-radio-grid">
                  {(() => {
                    // Normalize candidates to array of objects
                    const normalizedCandidates: Array<{ name: string; voteCount: string }> = 
                      candidates.length > 0 && typeof candidates[0] === 'string'
                        ? (candidates as string[]).map(name => ({ name, voteCount: '0' }))
                        : (candidates as Array<{ name: string; voteCount: string }>);
                    
                    console.log('Normalized candidates:', normalizedCandidates);
                    
                    return normalizedCandidates.map((candidate, index) => {
                      const candidateId = `candidate-${index}-${candidate.name.replace(/\s+/g, '-')}`;
                      return (
                        <RadioGroupItem
                          key={`${candidate.name}-${index}`}
                          value={candidate.name}
                          id={candidateId}
                          className={hasVoted || isSubmitting || isMining ? 'pointer-events-none' : ''}
                        >
                          <Label
                            htmlFor={candidateId}
                            className={`${candidateColors[index % candidateColors.length]} ${
                              selectedCandidate === candidate.name ? 'candidate-selected' : ''
                            } ${hasVoted || isSubmitting || isMining ? 'candidate-disabled' : ''}`}
                          >
                            <div className="candidate-radio-content">
                              <div className="candidate-radio-name">{candidate.name}</div>
                              <div className="candidate-radio-votes">{candidate.voteCount} votes</div>
                            </div>
                          </Label>
                        </RadioGroupItem>
                      );
                    });
                  })()}
                </div>
              </RadioGroup>
            )}
          </div>

          {result && (
            <Alert className={result.success ? 'alert-success' : 'alert-error'}>
              {result.success ? (
                <CheckCircle className="alert-icon" />
              ) : (
                <AlertCircle className="alert-icon" />
              )}
              <AlertDescription>
                {result.message}
              </AlertDescription>
            </Alert>
          )}

          <Button 
            type="submit" 
            className="btn-vote-submit" 
            size="lg"
            disabled={hasVoted || isSubmitting || !selectedCandidate || isMining}
          >
            {isMining ? (
              <>
                <span className="mining-spinner">⛏️</span>
                Mining Block...
              </>
            ) : isSubmitting ? (
              'Submitting...'
            ) : hasVoted ? (
              'Already Voted'
            ) : (
              'Submit Vote'
            )}
          </Button>

              {showConfirmDialog && (
                <div className="confirm-dialog-overlay" onClick={() => setShowConfirmDialog(false)}>
                  <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                    <h3 className="confirm-dialog-title">Confirm Your Vote</h3>
                    <p className="confirm-dialog-message">
                      You are about to vote for <strong>{selectedCandidate}</strong>
                    </p>
                    <p className="confirm-dialog-message" style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#cbd5e1' }}>
                      Your vote will be recorded <strong style={{ color: '#a855f7' }}>anonymously</strong> on the blockchain.
                    </p>
                    <p className="confirm-dialog-warning">
                      This action cannot be undone. Your vote will be permanently recorded on the blockchain.
                    </p>
                <div className="confirm-dialog-actions">
                  <Button
                    variant="secondary"
                    onClick={() => setShowConfirmDialog(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    onClick={confirmVote}
                    disabled={isSubmitting}
                    className="btn-confirm-vote"
                  >
                    {isSubmitting ? 'Submitting...' : 'Confirm Vote'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="blockchain-features">
            <h4 className="features-title">Blockchain Features:</h4>
            <ul className="features-list">
              <li>✓ No Wallet Required - Simple voter ID system</li>
              <li>✓ Immutable - Votes cannot be changed once recorded</li>
              <li>✓ Transparent - All votes are publicly verifiable</li>
              <li>✓ Secure - Cryptographic hashing ensures integrity</li>
              <li>✓ One Vote Per ID - Duplicate voting is prevented</li>
            </ul>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

