/**
 * HomePage Component
 * 
 * This is the main landing page of the voting application.
 * It allows users to:
 * - Create new elections
 * - Join existing elections by ID
 * - View and manage their elections (active, pending, closed)
 * - Delete closed elections
 */

// Import React hooks for state management
import { useState } from 'react';
// Import UI components for building the homepage
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
// Import dialog components for creating elections
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';
// Import icons for visual elements
import { Plus, Users, Clock, Calendar, Shield, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
// Import toast notifications for user feedback
import { toast } from 'sonner';

/**
 * Election interface
 * Represents an election with all its properties
 */
export interface Election {
  // Unique identifier for the election
  id: string;
  // Title/name of the election
  title: string;
  // Optional description of the election
  description?: string;
  // Array of candidate names
  candidates: string[];
  // Timestamp when the election ends (milliseconds since epoch)
  endTime: number;
  // Timestamp when the election was created (milliseconds since epoch)
  createdAt: number;
  // Current status of the election
  status: 'active' | 'closed';
  // Optional Ethereum contract address if election is deployed to blockchain
  contractAddress?: string;
  // ID of the user who created this election (for admin controls)
  creatorId?: string;
}

/**
 * Props interface for HomePage component
 */
interface HomePageProps {
  // Callback function when user creates a new election
  onCreateElection: (electionData: Omit<Election, 'id' | 'createdAt' | 'status'>) => void;
  // Callback function when user joins an election by ID
  onJoinElection: (electionId: string) => void;
  // Callback function when user deletes an election
  onDeleteElection: (electionId: string) => void;
  // Array of all elections to display
  elections: Election[];
}

/**
 * HomePage Component
 * 
 * Main landing page component that provides:
 * - Election creation interface
 * - Election joining interface
 * - Election list display (active, pending, closed)
 * - Election management (delete)
 * 
 * @param onCreateElection - Function to call when creating a new election
 * @param onJoinElection - Function to call when joining an election
 * @param onDeleteElection - Function to call when deleting an election
 * @param elections - Array of elections to display
 */
export function HomePage({ onCreateElection, onJoinElection, onDeleteElection, elections }: HomePageProps) {
  // State for the election ID input when joining an election
  const [joinElectionId, setJoinElectionId] = useState('');
  // State controlling visibility of the create election dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  // State for the new election form data
  const [newElection, setNewElection] = useState({
    title: '',           // Election title
    description: '',     // Election description
    candidates: ['', ''], // Array of candidate names (starts with 2 empty strings)
    endDate: '',         // End date (YYYY-MM-DD format)
    endTime: '',         // End time (HH:MM format)
  });

  /**
   * Handle election creation
   * Validates form data and calls onCreateElection callback
   */
  const handleCreateElection = () => {
    // Validate that title is not empty
    if (!newElection.title.trim()) {
      toast.error("Election title cannot be empty.");
      return;
    }
    // Validate that at least 2 candidates are provided
    if (newElection.candidates.filter(c => c.trim()).length < 2) {
      toast.error("Please add at least two candidates.");
      return;
    }
    // Validate that end date and time are provided
    if (!newElection.endDate || !newElection.endTime) {
      toast.error("Please select an end date and time.");
      return;
    }

    // Combine date and time into a single timestamp
    const endDateTime = new Date(`${newElection.endDate}T${newElection.endTime}`).getTime();
    // Validate that end date/time is in the future
    if (endDateTime <= Date.now()) {
      toast.error("End date and time must be in the future.");
      return;
    }

    // Call the onCreateElection callback with validated data
    onCreateElection({
      title: newElection.title,
      description: newElection.description,
      // Filter out empty candidate names
      candidates: newElection.candidates.filter(c => c.trim()),
      endTime: endDateTime,
    });

    // Reset the form after successful creation
    setNewElection({
      title: '',
      description: '',
      candidates: ['', ''],
      endDate: '',
      endTime: '',
    });
    // Close the create dialog
    setShowCreateDialog(false);
  };

  /**
   * Add a new candidate input field to the form
   */
  const handleAddCandidate = () => {
    setNewElection({
      ...newElection,
      // Add a new empty string to the candidates array
      candidates: [...newElection.candidates, ''],
    });
  };

  /**
   * Remove a candidate input field from the form
   * Ensures at least one candidate field remains
   * 
   * @param index - Index of the candidate to remove
   */
  const handleRemoveCandidate = (index: number) => {
    // Only allow removal if there's more than one candidate
    if (newElection.candidates.length > 1) {
      setNewElection({
        ...newElection,
        // Filter out the candidate at the specified index
        candidates: newElection.candidates.filter((_, i) => i !== index),
      });
    }
  };

  /**
   * Handle change to a candidate input field
   * 
   * @param index - Index of the candidate being edited
   * @param value - New value for the candidate name
   */
  const handleCandidateChange = (index: number, value: string) => {
    // Create a copy of the candidates array
    const newCandidates = [...newElection.candidates];
    // Update the candidate at the specified index
    newCandidates[index] = value;
    // Update state with the modified candidates array
    setNewElection({ ...newElection, candidates: newCandidates });
  };

  // Render the homepage UI
  return (
    // Main container with gradient background
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900">
      {/* Container for page content */}
      <div className="container mx-auto px-4 py-12 max-w-6xl">
        {/* Hero section with title and description */}
        <div className="text-center mb-12">
          <h1 className="hero-title mb-4">Blockchain Voting Platform</h1>
          <p className="hero-subtitle mb-4">
            Create secure, transparent, and tamper-proof elections powered by blockchain technology
          </p>
          <p className="hero-description">
            Every vote is immutably recorded on the blockchain, ensuring complete transparency and preventing fraud
          </p>
        </div>

        {/* Grid layout for Create and Join election cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-12">
          {/* Create Election Card - Opens dialog to create new election */}
          <AlertDialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <Card className="glass-card hover:scale-105 transition-transform cursor-pointer border-purple-500/30">
              <AlertDialogTrigger asChild>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-purple-500/20 rounded-xl border border-purple-500/30">
                      <Plus className="w-6 h-6 text-purple-400" />
                    </div>
                    <CardTitle className="text-xl">Create New Election</CardTitle>
                  </div>
                  <CardDescription className="text-gray-400 mb-4">
                    Set up a new blockchain-powered voting election with custom candidates and duration
                  </CardDescription>
                  <Button className="w-full btn btn-primary">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Election
                  </Button>
                </div>
              </AlertDialogTrigger>
            </Card>
            <AlertDialogContent className="alert-dialog-content-large">
              <AlertDialogHeader>
                <AlertDialogTitle>Create New Election</AlertDialogTitle>
                <AlertDialogDescription>
                  Set up a new blockchain-powered election
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="alert-dialog-body">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="title">Election Title *</Label>
                    <Input
                      id="title"
                      value={newElection.title}
                      onChange={(e) => setNewElection({ ...newElection, title: e.target.value })}
                      placeholder="Enter election title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={newElection.description}
                      onChange={(e) => setNewElection({ ...newElection, description: e.target.value })}
                      placeholder="Enter description (optional)"
                    />
                  </div>
                  <div>
                    <Label>Candidates * (Minimum 2)</Label>
                    {newElection.candidates.map((candidate, index) => (
                      <div key={index} className="flex gap-2 mb-2">
                        <Input
                          value={candidate}
                          onChange={(e) => handleCandidateChange(index, e.target.value)}
                          placeholder={`Candidate ${index + 1}`}
                        />
                        {newElection.candidates.length > 1 && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => handleRemoveCandidate(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="secondary" onClick={handleAddCandidate}>
                      Add Candidate
                    </Button>
                  </div>
                  <div>
                    <Label htmlFor="endDate">End Date *</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={newElection.endDate}
                      onChange={(e) => setNewElection({ ...newElection, endDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endTime">End Time *</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={newElection.endTime}
                      onChange={(e) => setNewElection({ ...newElection, endTime: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleCreateElection}>
                  Create Election
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Join Election Card */}
          <Card className="glass-card border-pink-500/30 hover:border-pink-500/50 transition-all">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-xl border border-pink-500/30 shadow-lg shadow-pink-500/20">
                  <Users className="w-6 h-6 text-pink-400" />
                </div>
                <div>
                  <CardTitle className="text-xl bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
                    Join Election
                  </CardTitle>
                  <CardDescription className="text-gray-400 text-sm mt-1">
                    Enter Election ID to participate
                  </CardDescription>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    <Shield className="w-5 h-5" />
                  </div>
                  <Input
                    value={joinElectionId}
                    onChange={(e) => setJoinElectionId(e.target.value.toUpperCase())}
                    placeholder="Enter Election ID (e.g., ABC123)"
                    className="w-full pl-10 bg-slate-900/70 border-slate-700/50 text-gray-100 placeholder:text-gray-500 focus:border-pink-500/50 focus:ring-2 focus:ring-pink-500/20 transition-all"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && joinElectionId.trim()) {
                        onJoinElection(joinElectionId.trim());
                      }
                    }}
                  />
                </div>
                
                <Button
                  onClick={() => {
                    if (joinElectionId.trim()) {
                      onJoinElection(joinElectionId.trim());
                    } else {
                      toast.error("Please enter an Election ID");
                    }
                  }}
                  className="w-full bg-gradient-to-r from-pink-600 via-purple-600 to-pink-600 hover:from-pink-500 hover:via-purple-500 hover:to-pink-500 text-white font-semibold py-6 text-lg shadow-lg shadow-pink-500/30 hover:shadow-pink-500/50 transition-all"
                >
                  <Users className="w-5 h-5 mr-2" />
                  Join Election
                </Button>
                
                {elections.length > 0 && (
                  <div className="pt-3 border-t border-slate-700/50">
                    <p className="text-xs text-gray-500 mb-2 text-center">Or select from active elections below</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Display elections list if there are any elections */}
        {elections.length > 0 && (() => {
          // Get current timestamp for filtering
          const now = Date.now();
          // Filter active elections (status is active and end time hasn't passed)
          const activeElections = elections.filter(e => 
            e.status === 'active' && e.endTime > now
          );
          // Filter closed elections (status is closed OR end time has passed)
          const closedElections = elections.filter(e => 
            e.status === 'closed' || e.endTime <= now
          );
          // Filter pending elections (active, not ended, and created in the last minute)
          // This shows elections that were just created
          const pendingElections = elections.filter(e => 
            e.status === 'active' && e.endTime > now && e.createdAt > now - 60000 // Created in last minute
          );

          return (
            <div className="mt-12 space-y-8">
              {/* Active Elections */}
              {activeElections.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <CheckCircle2 className="w-6 h-6 text-green-400" />
                    <h2 className="text-2xl font-bold">Active Elections</h2>
                    <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-semibold">
                      {activeElections.length}
                    </span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {activeElections.map((election) => (
                      <Card key={election.id} className="election-card border-green-500/30">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            {election.title}
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                          </CardTitle>
                          <CardDescription>{election.description || 'No description'}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 mb-4">
                            <div className="flex items-center gap-2 text-sm text-gray-300">
                              <Users className="w-4 h-4" />
                              {election.candidates.length} candidates
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-300">
                              <Clock className="w-4 h-4" />
                              Ends: {new Date(election.endTime).toLocaleString()}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-300">
                              <Calendar className="w-4 h-4" />
                              Created: {new Date(election.createdAt).toLocaleDateString()}
                            </div>
                            <div className="pt-2 border-t border-slate-700">
                              <div className="flex items-center gap-2 text-sm text-green-400 font-semibold">
                                <CheckCircle2 className="w-4 h-4" />
                                Active - Accepting Votes
                              </div>
                            </div>
                          </div>
                          <Button
                            onClick={() => onJoinElection(election.id)}
                            className="w-full btn btn-primary"
                          >
                            Join Election
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Elections (Recently Created) */}
              {pendingElections.length > 0 && pendingElections.length !== activeElections.length && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <Clock className="w-6 h-6 text-yellow-400" />
                    <h2 className="text-2xl font-bold">Pending Elections</h2>
                    <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-semibold">
                      {pendingElections.length}
                    </span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {pendingElections.map((election) => (
                      <Card key={election.id} className="election-card border-yellow-500/30">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            {election.title}
                            <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                          </CardTitle>
                          <CardDescription>{election.description || 'No description'}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 mb-4">
                            <div className="flex items-center gap-2 text-sm text-gray-300">
                              <Users className="w-4 h-4" />
                              {election.candidates.length} candidates
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-300">
                              <Clock className="w-4 h-4" />
                              Starts: {new Date(election.createdAt).toLocaleString()}
                            </div>
                            <div className="pt-2 border-t border-slate-700">
                              <div className="flex items-center gap-2 text-sm text-yellow-400 font-semibold">
                                <Clock className="w-4 h-4" />
                                Pending - Starting Soon
                              </div>
                            </div>
                          </div>
                          <Button
                            onClick={() => onJoinElection(election.id)}
                            className="w-full btn btn-secondary"
                          >
                            View Election
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Closed Elections */}
              {closedElections.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <XCircle className="w-6 h-6 text-gray-500" />
                    <h2 className="text-2xl font-bold text-gray-400">Closed Elections</h2>
                    <span className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-sm font-semibold">
                      {closedElections.length}
                    </span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {closedElections.map((election) => (
                      <Card key={election.id} className="election-card border-gray-500/30 opacity-75">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-gray-400">
                            {election.title}
                            <XCircle className="w-4 h-4" />
                          </CardTitle>
                          <CardDescription className="text-gray-500">{election.description || 'No description'}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 mb-4">
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Users className="w-4 h-4" />
                              {election.candidates.length} candidates
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <Clock className="w-4 h-4" />
                              Ended: {new Date(election.endTime).toLocaleString()}
                            </div>
                            <div className="pt-2 border-t border-slate-700">
                              <div className="flex items-center gap-2 text-sm text-gray-500 font-semibold">
                                <XCircle className="w-4 h-4" />
                                Closed - No Longer Accepting Votes
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => onJoinElection(election.id)}
                              className="flex-1 btn btn-secondary"
                            >
                              View Results
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  className="bg-red-600/20 hover:bg-red-600/30 border border-red-600/50 text-red-400"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-slate-900 border-slate-700">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-gray-100">
                                    Delete Election?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-gray-400">
                                    Are you sure you want to delete "{election.title}"? This action cannot be undone and all election data will be permanently removed.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="bg-slate-800 border-slate-700 text-gray-300 hover:bg-slate-700">
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => onDeleteElection(election.id)}
                                    className="bg-red-600 hover:bg-red-500"
                                  >
                                    Delete Election
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <div className="features-grid mt-12">
          <div className="glass-card feature-card">
            <div className="feature-icon">🔒</div>
            <h4>Secure & Immutable</h4>
            <p>Votes are cryptographically secured and cannot be altered once recorded on the blockchain</p>
          </div>
          <div className="glass-card feature-card">
            <div className="feature-icon">👁️</div>
            <h4>Transparent</h4>
            <p>All votes are publicly verifiable on the blockchain while maintaining voter privacy</p>
          </div>
          <div className="glass-card feature-card">
            <div className="feature-icon">🛡️</div>
            <h4>Tamper-Proof</h4>
            <p>Any attempt to modify votes breaks the blockchain, making fraud immediately detectable</p>
          </div>
        </div>
      </div>
    </div>
  );
}

