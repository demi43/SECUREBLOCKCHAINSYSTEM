/**
 * VotingInterface Component
 * 
 * This component provides the user interface for casting votes in an election.
 * It handles candidate selection, voter ID generation, vote confirmation, and submission.
 * The component ensures votes are properly validated before submission to the blockchain.
 */

// Import React hooks for state management and side effects
import { useState, useEffect } from 'react';
// Import UI components for building the voting interface
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Alert, AlertDescription } from '../ui/alert';
// Import icons for visual elements
import { CheckCircle, AlertCircle, User, Users } from 'lucide-react';

/**
 * Props interface for VotingInterface component
 */
interface VotingInterfaceProps {
  // Callback function called when user submits a vote
  // Returns a promise with success status and message
  onVote: (candidate: string, voterAddress: string) => Promise<{ success: boolean; message: string }> | { success: boolean; message: string };
  // Whether the user has already voted (prevents duplicate voting)
  hasVoted: boolean;
  // Array of candidates - can be array of strings or objects with name and voteCount
  candidates: Array<{ name: string; voteCount: string }> | string[];
  // Optional voter address/ID (if provided, will be used instead of generating one)
  voterAddress?: string;
  // Whether a vote is currently being processed (shows mining animation)
  isMining?: boolean;
}

/**
 * VotingInterface Component
 * 
 * Main component for the voting interface. Handles:
 * - Candidate selection via radio buttons
 * - Voter ID generation (auto or manual)
 * - Vote confirmation dialog
 * - Vote submission to blockchain
 * 
 * @param onVote - Function to call when vote is submitted
 * @param hasVoted - Whether user has already voted
 * @param candidates - List of candidates to vote for
 * @param voterAddress - Optional pre-set voter address
 * @param externalIsMining - Whether vote is being processed externally
 */
export function VotingInterface({ onVote, hasVoted, candidates, voterAddress, isMining: externalIsMining }: VotingInterfaceProps) {
  // State for the currently selected candidate
  const [selectedCandidate, setSelectedCandidate] = useState('');
  // State for vote submission result (success/error message)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  // State tracking whether vote is currently being submitted
  const [isSubmitting, setIsSubmitting] = useState(false);
  // State controlling visibility of vote confirmation dialog
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  // State for user-entered voter name (optional)
  const [voterName, setVoterName] = useState('');
  // State for auto-generated voter ID (displayed to user)
  const [generatedVoterId, setGeneratedVoterId] = useState<string>('');
  // State for final voter ID that will be used when confirming vote
  const [finalVoterId, setFinalVoterId] = useState<string>('');
  // Use external mining state or default to false
  const isMining = externalIsMining || false;
  
  // Generate a unique ID for this tab that persists across page reloads
  // Use sessionStorage to ensure it's unique per tab
  // Note: Currently unused but kept for potential future use
  const [_tabId] = useState(() => {
    const storageKey = 'voting_tab_id';
    let tabId = sessionStorage.getItem(storageKey);
    if (!tabId) {
      // Generate a unique tab ID: timestamp + random string
      tabId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      sessionStorage.setItem(storageKey, tabId);
    }
    return tabId;
  });

  /**
   * Generate a shorter, more readable voter ID
   * Format: VOTER-{timestamp}-{random}
   * Example: VOTER-A1B2-C3D4E5
   * 
   * @returns A formatted voter ID string
   */
  const generateReadableVoterId = () => {
    // Generate random part (6 characters, uppercase)
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    // Generate timestamp part (4 characters from current time, uppercase)
    const timestamp = Date.now().toString(36).substring(5, 9).toUpperCase();
    // Combine into readable format
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

  /**
   * Handle form submission when user clicks "Submit Vote"
   * Validates selection, generates voter ID, and shows confirmation dialog
   * 
   * @param e - Form submission event
   */
  const handleSubmit = async (e: React.FormEvent) => {
    // Prevent default form submission behavior
    e.preventDefault();
    
    // Validate that a candidate has been selected
    if (!selectedCandidate) {
      setResult({ success: false, message: 'Please select a candidate' });
      return;
    }

    // Check if user has already voted (prevent duplicate voting)
    if (hasVoted) {
      setResult({ success: false, message: 'You have already voted' });
      return;
    }

    // Generate the final voter ID now (before showing dialog) so we can show it accurately
    let voterId: string;
    // If user entered a name, use it with a random hash for uniqueness
    if (voterName.trim()) {
      // Generate a short random hash to append to the name
      const nameHash = Math.random().toString(36).substring(2, 6).toUpperCase();
      // Combine name and hash: "John-A1B2"
      voterId = `${voterName.trim()}-${nameHash}`;
    } else if (voterAddress) {
      // If voter address was provided as prop, use it
      voterId = voterAddress;
    } else {
      // Otherwise, use generated ID or create a new one
      voterId = generatedVoterId || generateReadableVoterId();
      // If we just generated it, store it in state
      if (!generatedVoterId) {
        setGeneratedVoterId(voterId);
      }
    }
    
    // Store the final voter ID so we can use it in the confirmation dialog and when confirming
    setFinalVoterId(voterId);
    // Show the confirmation dialog
    setShowConfirmDialog(true);
  };

  /**
   * Handle vote confirmation - called when user clicks "Confirm Vote" in dialog
   * Submits the vote to the blockchain via the onVote callback
   */
  const confirmVote = async () => {
    // Close the confirmation dialog
    setShowConfirmDialog(false);
    
    // Use the pre-generated voter ID (same one shown in the dialog)
    const voterId = finalVoterId;
    
    // Validate that voter ID was generated
    if (!voterId) {
      setResult({ success: false, message: 'Voter ID not generated. Please try again.' });
      return;
    }
    
    // Log vote details for debugging
    console.log('Confirming vote for candidate:', selectedCandidate);
    console.log('Voter Name:', voterName);
    console.log('Final Voter ID:', voterId);
    console.log('All available candidates:', candidates);
    
    // Set submitting state to show loading indicator
    setIsSubmitting(true);
    // Clear any previous result messages
    setResult(null);
    
    try {
      // Call the onVote callback with selected candidate and voter ID
      // Promise.resolve ensures we handle both sync and async returns
      const response = await Promise.resolve(onVote(selectedCandidate, voterId));
      // Log the response for debugging
      console.log('Vote response:', response);
      // Store the result to display success/error message
      setResult(response);
      
      // If vote was successful, reset the form
      if (response.success) {
        // Clear selected candidate
        setSelectedCandidate('');
        // Store the voter ID that was actually used (for reference)
        sessionStorage.setItem('last_voter_id', voterId);
      }
    } catch (error) {
      // Log error for debugging
      console.error('Vote error:', error);
      // Display error message to user
      setResult({ 
        success: false, 
        // Extract error message if it's an Error object, otherwise use generic message
        message: error instanceof Error ? error.message : 'Failed to submit vote' 
      });
    } finally {
      // Always reset submitting state, even if there was an error
      setIsSubmitting(false);
    }
  };

  /**
   * Handle candidate selection change
   * Allows user to change their selection before submitting
   * 
   * @param candidate - The candidate name that was selected
   */
  const handleCandidateSelect = (candidate: string) => {
    // Allow selection change as long as vote hasn't been submitted yet
    // Check that user hasn't voted, isn't currently submitting, and mining isn't in progress
    if (!hasVoted && !isSubmitting && !isMining) {
      // Update selected candidate
      setSelectedCandidate(candidate);
      // Clear any previous result messages
      setResult(null);
      // Close confirmation dialog if open when changing selection
      // This allows user to change their mind before confirming
      if (showConfirmDialog) {
        setShowConfirmDialog(false);
      }
    }
  };

  // Render the voting interface UI
  return (
    // Main card container for the voting interface
    <Card className="voting-interface-card">
      {/* Card header with title and description */}
      <CardHeader>
        <CardTitle className="card-title-with-icon">
          {/* Users icon for visual appeal */}
          <Users className="icon-purple" />
          Cast Your Vote
        </CardTitle>
        <CardDescription>
          Your vote will be securely recorded on the blockchain and cannot be altered
        </CardDescription>
      </CardHeader>
      {/* Card content with the voting form */}
      <CardContent>
            {/* Voting form - handles submission via handleSubmit */}
            <form onSubmit={handleSubmit} className="voting-form">
              {/* Voter name/ID input section */}
              <div className="form-group">
                <Label htmlFor="voterName" className="label-with-icon">
                  {/* User icon for visual context */}
                  <User className="icon-small" />
                  Your Name / Voter ID (Optional)
                </Label>
                {/* Input field for voter name (optional) */}
                <Input
                  id="voterName"
                  value={voterName}
                  onChange={(e) => setVoterName(e.target.value)}
                  placeholder={generatedVoterId || "Enter your name or leave blank for auto-generated ID"}
                  // Disable input if user has voted, is submitting, or mining is in progress
                  disabled={hasVoted || isSubmitting || isMining}
                  className={hasVoted || isSubmitting || isMining ? "input-disabled" : ""}
                />
                {/* Hint text explaining voter ID generation */}
                <p className="form-hint">
                  {voterName.trim() 
                    ? `Your vote will be recorded with your name plus a unique code`
                    : generatedVoterId 
                      ? `Auto-generated ID: ${generatedVoterId}`
                      : "A unique voter ID will be generated when you submit your vote"}
                </p>
              </div>

          {/* Candidate selection section */}
          <div className="form-group">
            <Label className="form-label">Select Candidate</Label>
            {/* Check if candidates are available */}
            {candidates.length === 0 ? (
              // Show warning if no candidates available
              <Alert className="alert-warning">
                <AlertCircle className="alert-icon" />
                <AlertDescription>No candidates available for this election.</AlertDescription>
              </Alert>
            ) : (
              // Radio group for candidate selection
              <RadioGroup value={selectedCandidate} onValueChange={handleCandidateSelect}>
                <div className="candidates-radio-grid">
                  {(() => {
                    // Normalize candidates to array of objects
                    // Handles both string[] and {name, voteCount}[] formats
                    const normalizedCandidates: Array<{ name: string; voteCount: string }> = 
                      candidates.length > 0 && typeof candidates[0] === 'string'
                        ? (candidates as string[]).map(name => ({ name, voteCount: '0' }))
                        : (candidates as Array<{ name: string; voteCount: string }>);
                    
                    // Log normalized candidates for debugging
                    console.log('Normalized candidates:', normalizedCandidates);
                    
                    // Map each candidate to a radio button option
                    return normalizedCandidates.map((candidate, index) => {
                      // Generate unique ID for this candidate option
                      const candidateId = `candidate-${index}-${candidate.name.replace(/\s+/g, '-')}`;
                      return (
                        <RadioGroupItem
                          key={`${candidate.name}-${index}`}
                          value={candidate.name}
                          id={candidateId}
                          // Disable pointer events if vote has been submitted
                          className={hasVoted || isSubmitting || isMining ? 'pointer-events-none' : ''}
                        >
                          <Label
                            htmlFor={candidateId}
                            // Apply color class based on index (cycles through colors)
                            // Add selected class if this candidate is selected
                            // Add disabled class if vote has been submitted
                            className={`${candidateColors[index % candidateColors.length]} ${
                              selectedCandidate === candidate.name ? 'candidate-selected' : ''
                            } ${hasVoted || isSubmitting || isMining ? 'candidate-disabled' : ''}`}
                          >
                            <div className="candidate-radio-content">
                              {/* Display candidate name */}
                              <div className="candidate-radio-name">{candidate.name}</div>
                              {/* Display current vote count for this candidate */}
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

          {/* Display result message (success or error) */}
          {result && (
            <Alert className={result.success ? 'alert-success' : 'alert-error'}>
              {/* Show checkmark icon for success, alert icon for error */}
              {result.success ? (
                <CheckCircle className="alert-icon" />
              ) : (
                <AlertCircle className="alert-icon" />
              )}
              <AlertDescription>
                {/* Display the result message */}
                {result.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Submit vote button */}
          <Button 
            type="submit" 
            className="btn-vote-submit" 
            size="lg"
            // Disable button if user has voted, is submitting, no candidate selected, or mining
            disabled={hasVoted || isSubmitting || !selectedCandidate || isMining}
          >
            {/* Show different text based on current state */}
            {isMining ? (
              // Show mining animation when block is being mined
              <>
                <span className="mining-spinner">⛏️</span>
                Mining Block...
              </>
            ) : isSubmitting ? (
              // Show submitting text when vote is being processed
              'Submitting...'
            ) : hasVoted ? (
              // Show "Already Voted" if user has already voted
              'Already Voted'
            ) : (
              // Default text for submit button
              'Submit Vote'
            )}
          </Button>

              {/* Confirmation dialog - shown before final vote submission */}
              {showConfirmDialog && (
                // Overlay that closes dialog when clicked
                <div className="confirm-dialog-overlay" onClick={() => setShowConfirmDialog(false)}>
                  // Dialog content - stop propagation to prevent closing when clicking inside
                  <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                    <h3 className="confirm-dialog-title">Confirm Your Vote</h3>
                    {/* Show which candidate was selected */}
                    <p className="confirm-dialog-message">
                      You are about to vote for <strong>{selectedCandidate}</strong>
                    </p>
                    {/* Inform user about anonymous voting */}
                    <p className="confirm-dialog-message" style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#cbd5e1' }}>
                      Your vote will be recorded <strong style={{ color: '#a855f7' }}>anonymously</strong> on the blockchain.
                    </p>
                    {/* Warning that vote cannot be undone */}
                    <p className="confirm-dialog-warning">
                      This action cannot be undone. Your vote will be permanently recorded on the blockchain.
                    </p>
                {/* Dialog action buttons */}
                <div className="confirm-dialog-actions">
                  {/* Cancel button - closes dialog without voting */}
                  <Button
                    variant="secondary"
                    onClick={() => setShowConfirmDialog(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  {/* Confirm button - submits the vote */}
                  <Button
                    variant="default"
                    onClick={confirmVote}
                    disabled={isSubmitting}
                    className="btn-confirm-vote"
                  >
                    {/* Show submitting text if vote is being processed */}
                    {isSubmitting ? 'Submitting...' : 'Confirm Vote'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Information section about blockchain features */}
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

