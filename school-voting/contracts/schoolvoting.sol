// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Secure SchoolVoting
/// @notice Time-bound election with direct and signature-authorized proxy votes (ECDSA).
/// @dev This contract implements on-chain signature verification to allow server-submitted proxy votes
///      only when the voter actually signed the authorization. Admin cannot prematurely end the election.
contract SchoolVoting {
    /* ========== STRUCTS & STORAGE ========== */

    struct Candidate {
        string name;
        uint256 voteCount;
    }

    address public owner; // admin/owner
    Candidate[] public candidates;

    // voter state
    mapping(address => bool) public hasVoted;
    mapping(address => uint256) public nonces; // for replay protection when using signatures
    uint256 public voterCount;
    uint256 public maxVoters;

    // election timing
    uint256 public electionStartTime;
    uint256 public electionEndTime;
    bool public electionEnded; // explicit end flag (only valid after scheduled end)

    /* ========== EVENTS ========== */

    event ElectionStarted(uint256 startTime, uint256 endTime);
    event VoteCast(address indexed voter, uint256 indexed candidateIndex, uint256 timestamp);
    event ElectionEnded(uint256 endedAt, address indexed endedBy);
    event CandidateAdded(string name);

    /* ========== MODIFIERS ========== */

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyDuringElection() {
        require(!electionEnded, "Election has ended");
        require(block.timestamp >= electionStartTime, "Election not started");
        require(block.timestamp <= electionEndTime, "Election time expired");
        _;
    }

    /* ========== CONSTRUCTOR / SETUP ========== */

    /// @param candidateNames initial candidate names (must be unique)
    /// @param _maxVoters maximum allowed voters (prevent unbounded counting)
    /// @param durationHours election duration in hours
    constructor(string[] memory candidateNames, uint256 _maxVoters, uint256 durationHours) {
        require(candidateNames.length >= 2, "At least two candidates");
        require(_maxVoters > 0, "maxVoters > 0");
        require(durationHours > 0, "duration > 0");

        owner = msg.sender;
        maxVoters = _maxVoters;
        electionStartTime = block.timestamp;
        electionEndTime = block.timestamp + (durationHours * 1 hours);

        // Add candidates and prohibit duplicate names
        for (uint i = 0; i < candidateNames.length; i++) {
            // basic uniqueness check (gas O(n^2) for small candidate lists is acceptable)
            for (uint j = 0; j < i; j++) {
                require(keccak256(bytes(candidateNames[i])) != keccak256(bytes(candidateNames[j])), "Duplicate candidate name");
            }
            candidates.push(Candidate({ name: candidateNames[i], voteCount: 0 }));
            emit CandidateAdded(candidateNames[i]);
        }

        emit ElectionStarted(electionStartTime, electionEndTime);
    }

    /* ========== VIEW HELPERS ========== */

    function candidateCount() external view returns (uint256) {
        return candidates.length;
    }

    /// @notice Get the index of a candidate by exact name match
    function getCandidateIndexByName(string memory candidateName) public view returns (uint256, bool) {
        bytes32 target = keccak256(bytes(candidateName));
        for (uint i = 0; i < candidates.length; i++) {
            if (keccak256(bytes(candidates[i].name)) == target) {
                return (i, true);
            }
        }
        return (0, false);
    }

    /* ========== CORE VOTING FUNCTIONS ========== */

    /// @notice Voter casts their own vote (transaction must be sent by voter)
    function vote(uint256 candidateIndex) external onlyDuringElection {
        _castVote(candidateIndex, msg.sender);
    }

    /// @notice Vote by candidate name (caller must be the voter)
    function voteByName(string memory candidateName) external onlyDuringElection {
        (uint256 idx, bool exists) = getCandidateIndexByName(candidateName);
        require(exists, "Candidate not found");
        _castVote(idx, msg.sender);
    }

    /// @notice Submit a vote on behalf of a voter using the voter's ECDSA signature.
    /// @param candidateIndex index of the candidate
    /// @param voter address of the voter (the signer)
    /// @param nonce voter's current nonce at signing time (must match contract's nonces[voter])
    /// @param signature 65-byte eth_sign-style signature (r,s,v)
    /// @dev Message to sign is keccak256(abi.encodePacked(address(this), voter, candidateIndex, nonce))
    function voteBySignature(
        uint256 candidateIndex,
        address voter,
        uint256 nonce,
        bytes calldata signature
    ) external onlyDuringElection {
        require(candidateIndex < candidates.length, "Invalid candidate");
        require(!hasVoted[voter], "Voter already voted");
        require(voterCount < maxVoters, "Max voters reached");

        // Verify provided nonce matches current nonce for voter (prevents replay & ordered signing)
        require(nonces[voter] == nonce, "Invalid nonce");

        // Recreate message and verify signature
        bytes32 digest = _prefixed(keccak256(abi.encodePacked(address(this), voter, candidateIndex, nonce)));
        address recovered = _recover(digest, signature);
        require(recovered == voter, "Invalid signature");

        // consume nonce
        unchecked { nonces[voter] = nonces[voter] + 1; }

        // cast vote
        _castVote(candidateIndex, voter);
    }

    /* ========== INTERNALS ========== */

    function _castVote(uint256 candidateIndex, address voter) internal {
        require(!hasVoted[voter], "Already voted");
        require(candidateIndex < candidates.length, "Candidate out of range");
        require(voterCount < maxVoters, "Max voters reached");

        hasVoted[voter] = true;
        voterCount++;
        candidates[candidateIndex].voteCount++;

        emit VoteCast(voter, candidateIndex, block.timestamp);
    }

    /* ========== ADMIN / ENDING ========== */

    /// @notice End election. Only allowed after scheduled end time to prevent admin manipulations.
    function endElection() external onlyOwner {
        require(!electionEnded, "Already ended");
        require(block.timestamp >= electionEndTime, "Election still running");
        electionEnded = true;
        emit ElectionEnded(block.timestamp, msg.sender);
    }

    /// @notice Emergency end — ONLY allowed if owner sets emergency flag (not implemented here).
    /// Leaving this out reduces attack surface. If governance needed, add multisig/time-lock off-chain.
    /// For stricter security, we intentionally disallow early admin termination in this contract.

    /* ========== RESULTS & STATS ========== */

    /// @notice Compute winner and whether there is a tie.
    /// @return winnerName string (empty if no votes), winnerVotes, tie boolean
    function getWinner() external view returns (string memory winnerName, uint256 winnerVotes, bool tie) {
        // must have ended or time passed
        require(electionEnded || block.timestamp > electionEndTime, "Election ongoing");

        if (candidates.length == 0) return ("", 0, false);

        uint256 maxVotes = 0;
        uint256 winners = 0;
        uint256 winnerIdx = 0;

        for (uint i = 0; i < candidates.length; i++) {
            uint256 v = candidates[i].voteCount;
            if (v > maxVotes) {
                maxVotes = v;
                winners = 1;
                winnerIdx = i;
            } else if (v == maxVotes && v > 0) {
                winners++;
            }
        }

        if (maxVotes == 0) {
            // no votes cast
            return ("", 0, false);
        }

        return (candidates[winnerIdx].name, maxVotes, winners > 1);
    }

    function getElectionStats() external view returns (
        uint256 totalVoters,
        uint256 maxAllowedVoters,
        uint256 remainingVoters,
        bool isActive,
        uint256 timeRemaining
    ) {
        totalVoters = voterCount;
        maxAllowedVoters = maxVoters;
        remainingVoters = maxVoters > voterCount ? maxVoters - voterCount : 0;
        isActive = !electionEnded && block.timestamp >= electionStartTime && block.timestamp <= electionEndTime;
        timeRemaining = block.timestamp < electionEndTime ? electionEndTime - block.timestamp : 0;
    }

    /* ========== ECDSA HELPERS (ETH_SIGN style) ========== */

    /// @dev prefix according to eth_sign: "\x19Ethereum Signed Message:\n32" + hash
    function _prefixed(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    /// @dev Recover signer from signature (65 bytes: r(32) | s(32) | v(1))
    function _recover(bytes32 digest, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }
        // Accept both 27/28 and 0/1 signatures (some clients produce 0/1)
        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "Invalid v");
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "Invalid signer");
        return signer;
    }

    /* ========== ADMIN UTILS (OPTIONAL) ========== */

    /// @notice Owner can add a candidate only before election starts (safer), or else the candidate list should be fixed.
    function addCandidate(string memory name) external onlyOwner {
        require(block.timestamp < electionStartTime, "Can only add candidates before start");
        // basic duplicate check
        for (uint i = 0; i < candidates.length; i++) {
            require(keccak256(bytes(candidates[i].name)) != keccak256(bytes(name)), "Duplicate candidate");
        }
        candidates.push(Candidate({ name: name, voteCount: 0 }));
        emit CandidateAdded(name);
    }
}
