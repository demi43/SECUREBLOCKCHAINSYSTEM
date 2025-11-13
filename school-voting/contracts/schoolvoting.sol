// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SchoolVoting {
    struct Candidate {
        string name;
        uint voteCount;
    }

    address public admin;
    bool public electionEnded;
    mapping(address => bool) public hasVoted;
    Candidate[] public candidates;
    uint public maxVoters;
    uint public voterCount;
    uint public electionStartTime;
    uint public electionEndTime;

    // Events for transparency (anonymized - no voter address)
    event VoteCast(uint indexed candidateIndex, uint timestamp);
    event ElectionEnded(address indexed admin);
    event ElectionStarted(uint startTime, uint endTime);

    constructor(string[] memory candidateNames, uint _maxVoters, uint _electionDurationHours) {
        admin = msg.sender;
        maxVoters = _maxVoters;
        electionStartTime = block.timestamp;
        electionEndTime = block.timestamp + (_electionDurationHours * 1 hours);
        
        for (uint i = 0; i < candidateNames.length; i++) {
            candidates.push(Candidate(candidateNames[i], 0));
        }
        
        emit ElectionStarted(electionStartTime, electionEndTime);
    }

    function vote(uint candidateIndex) public {
        _castVote(candidateIndex, msg.sender);
    }

    function voteByName(string memory candidateName) public {
        (uint candidateIndex, bool exists) = _findCandidateIndex(candidateName);
        require(exists, "Candidate does not exist");
        _castVote(candidateIndex, msg.sender);
    }

    // Function to vote on behalf of a voter (for server-signed transactions)
    function voteForAddress(uint candidateIndex, address voter) public {
        _castVote(candidateIndex, voter);
    }

    function voteByNameForAddress(string memory candidateName, address voter) public {
        (uint candidateIndex, bool exists) = _findCandidateIndex(candidateName);
        require(exists, "Candidate does not exist");
        _castVote(candidateIndex, voter);
    }

    function endElection() public {
        require(msg.sender == admin, "Only admin can end the election");
        electionEnded = true;
        emit ElectionEnded(admin);
    }

    function getCandidates() public view returns (Candidate[] memory) {
        return candidates;
    }

    function getWinner() public view returns (string memory winnerName, uint winnerVotes, bool isTie) {
        require(electionEnded || block.timestamp > electionEndTime, "Election is still ongoing");
        
        if (candidates.length == 0) {
            return ("", 0, false);
        }
        
        uint maxVotes = 0;
        uint winnerIndex = 0;
        uint winnerCount = 0;
        
        // Find the maximum vote count
        for (uint i = 0; i < candidates.length; i++) {
            if (candidates[i].voteCount > maxVotes) {
                maxVotes = candidates[i].voteCount;
                winnerIndex = i;
                winnerCount = 1;
            } else if (candidates[i].voteCount == maxVotes && maxVotes > 0) {
                winnerCount++;
            }
        }
        
        isTie = (winnerCount > 1);
        winnerName = candidates[winnerIndex].name;
        winnerVotes = maxVotes;
        
        return (winnerName, winnerVotes, isTie);
    }

    function getElectionStats() public view returns (
        uint totalVoters,
        uint maxAllowedVoters,
        uint remainingVoters,
        bool isActive,
        uint timeRemaining
    ) {
        totalVoters = voterCount;
        maxAllowedVoters = maxVoters;
        remainingVoters = maxVoters > voterCount ? maxVoters - voterCount : 0;
        isActive = !electionEnded && block.timestamp >= electionStartTime && block.timestamp <= electionEndTime;
        
        if (block.timestamp < electionEndTime) {
            timeRemaining = electionEndTime - block.timestamp;
        } else {
            timeRemaining = 0;
        }
        
        return (totalVoters, maxAllowedVoters, remainingVoters, isActive, timeRemaining);
    }

    function getCandidateIndexByName(string memory candidateName) public view returns (uint, bool) {
        return _findCandidateIndex(candidateName);
    }

    function _castVote(uint candidateIndex, address voter) internal {
        require(!electionEnded, "Election has ended");
        require(block.timestamp >= electionStartTime, "Election has not started yet");
        require(block.timestamp <= electionEndTime, "Election time has expired");
        require(!hasVoted[voter], "You have already voted");
        require(candidateIndex < candidates.length, "Invalid candidate index");
        require(voterCount < maxVoters, "Maximum voters reached");

        hasVoted[voter] = true;
        voterCount++;
        candidates[candidateIndex].voteCount++;
        
        // Emit event without voter address for anonymity
        emit VoteCast(candidateIndex, block.timestamp);
    }

    function _findCandidateIndex(string memory candidateName) internal view returns (uint, bool) {
        bytes32 target = keccak256(bytes(candidateName));
        for (uint i = 0; i < candidates.length; i++) {
            if (keccak256(bytes(candidates[i].name)) == target) {
                return (i, true);
            }
        }
        return (0, false);
    }
}
