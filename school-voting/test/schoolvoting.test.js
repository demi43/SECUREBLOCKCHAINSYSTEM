// Load hardhat config first
import "./../hardhat.config.js";
import { expect } from "chai";
import hre from "hardhat";
import { ethers } from "ethers";

describe("SchoolVoting", function () {
    // Variables to store our contract and accounts
    let schoolVoting;
    let owner;
    let voter1;
    let voter2;
    let provider;

    before(async function () {
        provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    
        try {
            // Get accounts - listAccounts() returns account objects, extract addresses
            const accounts = await provider.listAccounts();
            if (accounts.length < 3) {
                throw new Error("Need at least 3 accounts from the Hardhat node");
            }
            
            // Extract addresses from account objects (ethers v6 returns objects with address property)
            const ownerAddress = typeof accounts[0] === 'string' ? accounts[0] : accounts[0].address;
            const voter1Address = typeof accounts[1] === 'string' ? accounts[1] : accounts[1].address;
            const voter2Address = typeof accounts[2] === 'string' ? accounts[2] : accounts[2].address;
            
            owner = await provider.getSigner(ownerAddress);
            voter1 = await provider.getSigner(voter1Address);
            voter2 = await provider.getSigner(voter2Address);
        } catch (err) {
            throw new Error(`Unable to connect to Hardhat node at http://127.0.0.1:8545. Start it with: npx hardhat node\nOriginal error: ${err.message}`);
        }
    });

    beforeEach(async function () {

        // Deploy the contract with initial candidates
        // Load the contract ABI and bytecode from artifacts
        const contractArtifact = await hre.artifacts.readArtifact("SchoolVoting");
        const candidateNames = ["Alice", "Bob", "Charlie"];
        const maxVoters = 100; // Maximum 100 voters
        const electionDurationHours = 24; // Election lasts 24 hours
        
        const factory = new ethers.ContractFactory(
            contractArtifact.abi,
            contractArtifact.bytecode,
            owner
        );
        schoolVoting = await factory.deploy(candidateNames, maxVoters, electionDurationHours);
        await schoolVoting.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the deployer as admin", async function () {
            expect(await schoolVoting.admin()).to.equal(owner.address);
        });

        it("Should initialize candidates correctly", async function () {
            const candidates = await schoolVoting.getCandidates();
            expect(candidates.length).to.equal(3);
            expect(candidates[0].name).to.equal("Alice");
            expect(candidates[1].name).to.equal("Bob");
            expect(candidates[2].name).to.equal("Charlie");
        });

        it("Should initialize with zero votes", async function () {
            const candidates = await schoolVoting.getCandidates();
            expect(candidates[0].voteCount).to.equal(0n);
            expect(candidates[1].voteCount).to.equal(0n);
            expect(candidates[2].voteCount).to.equal(0n);
        });

        it("Should start with election not ended", async function () {
            expect(await schoolVoting.electionEnded()).to.equal(false);
        });
    });

    describe("Voting", function () {
        it("Should allow a voter to vote", async function () {
            await schoolVoting.connect(voter1).vote(0);
            const candidates = await schoolVoting.getCandidates();
            expect(candidates[0].voteCount).to.equal(1n);
        });

        it("Should allow a voter to vote by name", async function () {
            await schoolVoting.connect(voter1).voteByName("Alice");
            const candidates = await schoolVoting.getCandidates();
            expect(candidates[0].voteCount).to.equal(1n);
            expect(await schoolVoting.hasVoted(voter1.address)).to.equal(true);
        });

        it("Should mark voter as having voted", async function () {
            await schoolVoting.connect(voter1).vote(0);
            expect(await schoolVoting.hasVoted(voter1.address)).to.equal(true);
        });

        it("Should prevent double voting", async function () {
            await schoolVoting.connect(voter1).vote(0);
            try {
                await schoolVoting.connect(voter1).vote(1);
                expect.fail("Expected transaction to revert");
            } catch (error) {
                expect(error.message).to.include("revert");
            }
        });

        it("Should reject invalid candidate index", async function () {
            try {
                await schoolVoting.connect(voter1).vote(10);
                expect.fail("Expected transaction to revert");
            } catch (error) {
                expect(error.message).to.include("revert");
            }
        });

        it("Should reject invalid candidate name", async function () {
            try {
                await schoolVoting.connect(voter1).voteByName("NonExistent");
                expect.fail("Expected transaction to revert");
            } catch (error) {
                expect(error.message).to.include("revert");
            }
        });

        it("Should allow multiple voters to vote", async function () {
            await schoolVoting.connect(voter1).vote(0);
            await schoolVoting.connect(voter2).vote(1);
            
            const candidates = await schoolVoting.getCandidates();
            expect(candidates[0].voteCount).to.equal(1n);
            expect(candidates[1].voteCount).to.equal(1n);
        });
    });

    describe("Ending Election", function () {
        it("Should allow admin to end election", async function () {
            await schoolVoting.connect(owner).endElection();
            expect(await schoolVoting.electionEnded()).to.equal(true);
        });

        it("Should prevent non-admin from ending election", async function () {
            try {
                await schoolVoting.connect(voter1).endElection();
                expect.fail("Expected transaction to revert");
            } catch (error) {
                expect(error.message).to.include("revert");
            }
        });

        it("Should prevent voting after election ends", async function () {
            await schoolVoting.connect(owner).endElection();
            try {
                await schoolVoting.connect(voter1).vote(0);
                expect.fail("Expected transaction to revert");
            } catch (error) {
                expect(error.message).to.include("revert");
            }
        });
    });

    describe("New Features", function () {
        it("Should track voter count", async function () {
            expect(await schoolVoting.voterCount()).to.equal(0n);
            await schoolVoting.connect(voter1).vote(0);
            expect(await schoolVoting.voterCount()).to.equal(1n);
            await schoolVoting.connect(voter2).vote(1);
            expect(await schoolVoting.voterCount()).to.equal(2n);
        });

        it("Should have max voters limit", async function () {
            const maxVoters = await schoolVoting.maxVoters();
            expect(maxVoters).to.equal(100n);
        });

        it("Should prevent voting when max voters reached", async function () {
            // Deploy a new contract with max 2 voters for this test
            const contractArtifact = await hre.artifacts.readArtifact("SchoolVoting");
            const candidateNames = ["Alice", "Bob"];
            const factory = new ethers.ContractFactory(
                contractArtifact.abi,
                contractArtifact.bytecode,
                owner
            );
            const limitedContract = await factory.deploy(candidateNames, 2, 24);
            await limitedContract.waitForDeployment();

            // Vote with 2 voters (max reached)
            await limitedContract.connect(voter1).vote(0);
            await limitedContract.connect(voter2).vote(1);

            // Try to vote with a third voter - should fail
            const accounts = await provider.listAccounts();
            const voter3Address = typeof accounts[2] === 'string' ? accounts[2] : accounts[2].address;
            const voter3Signer = await provider.getSigner(voter3Address);
            
            try {
                await limitedContract.connect(voter3Signer).vote(0);
                expect.fail("Expected transaction to revert");
            } catch (error) {
                expect(error.message).to.include("revert");
            }
        });

        it("Should return election stats", async function () {
            const stats = await schoolVoting.getElectionStats();
            expect(stats.totalVoters).to.equal(0n);
            expect(stats.maxAllowedVoters).to.equal(100n);
            expect(stats.remainingVoters).to.equal(100n);
            expect(stats.isActive).to.equal(true);
        });

        it("Should get winner after election ends", async function () {
            // Vote for candidate 0 twice
            await schoolVoting.connect(voter1).vote(0);
            await schoolVoting.connect(voter2).vote(0);
            
            // End election
            await schoolVoting.connect(owner).endElection();
            
            const [winnerName, winnerVotes, isTie] = await schoolVoting.getWinner();
            expect(winnerName).to.equal("Alice");
            expect(winnerVotes).to.equal(2n);
            expect(isTie).to.equal(false);
        });

        it("Should detect ties", async function () {
            // Deploy new contract for tie test
            const contractArtifact = await hre.artifacts.readArtifact("SchoolVoting");
            const candidateNames = ["Alice", "Bob"];
            const factory = new ethers.ContractFactory(
                contractArtifact.abi,
                contractArtifact.bytecode,
                owner
            );
            const tieContract = await factory.deploy(candidateNames, 10, 24);
            await tieContract.waitForDeployment();

            // Vote: Alice gets 1, Bob gets 1 (tie)
            await tieContract.connect(voter1).vote(0);
            await tieContract.connect(voter2).vote(1);
            
            await tieContract.connect(owner).endElection();
            
            const [winnerName, winnerVotes, isTie] = await tieContract.getWinner();
            expect(winnerVotes).to.equal(1n);
            expect(isTie).to.equal(true);
        });
    });
});
