"""FastAPI backend for the SchoolVoting smart contract."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from web3 import Web3
from web3.exceptions import ContractLogicError
from eth_account import Account


load_dotenv()


PROJECT_ROOT = Path(__file__).resolve().parent.parent
ARTIFACT_PATH = (
    PROJECT_ROOT
    / "school-voting"
    / "artifacts"
    / "contracts"
    / "schoolvoting.sol"
    / "SchoolVoting.json"
)

if not ARTIFACT_PATH.exists():
    raise RuntimeError(
        "Contract artifact not found. Compile the contract first: "
        "cd school-voting && npx hardhat compile"
    )

artifact = json.loads(ARTIFACT_PATH.read_text())
CONTRACT_ABI = artifact["abi"]


def env_or_default(key: str, default: str) -> str:
    value = os.getenv(key)
    return value if value else default


RPC_URL = env_or_default("RPC_URL", "http://127.0.0.1:8545")
CONTRACT_ADDRESS = env_or_default(
    "CONTRACT_ADDRESS", "0x5FbDB2315678afecb367f032d93F642f64180aa3"
)
PORT = int(env_or_default("PORT", "3001"))
SERVER_PRIVATE_KEY = os.getenv("SERVER_PRIVATE_KEY")

# Initialize server account if private key is provided
if SERVER_PRIVATE_KEY:
    try:
        SERVER_ACCOUNT = Account.from_key(SERVER_PRIVATE_KEY)
        SERVER_ADDRESS = SERVER_ACCOUNT.address
    except Exception as exc:
        print(f"Warning: Failed to initialize server account: {exc}")
        SERVER_ACCOUNT = None
        SERVER_ADDRESS = None
else:
    SERVER_ACCOUNT = None
    SERVER_ADDRESS = None
    print("Warning: SERVER_PRIVATE_KEY not set. Voting will not work without it.")


def create_web3() -> Web3:
    provider = Web3.HTTPProvider(RPC_URL)
    web3 = Web3(provider)
    if not web3.is_connected():
        raise RuntimeError(
            f"Could not connect to blockchain network at {RPC_URL}. "
            "Check your RPC_URL configuration."
        )
    return web3


w3 = create_web3()

# Store election creators: electionId -> creatorIP
# In production, use a database instead of in-memory dict
election_creators: Dict[str, str] = {}


def get_client_ip(request: Request) -> str:
    """Get client IP address from request, handling proxies."""
    # Check X-Forwarded-For header (for proxies/load balancers)
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # X-Forwarded-For can contain multiple IPs, take the first one
        return forwarded_for.split(",")[0].strip()
    # Check X-Real-IP header (alternative proxy header)
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    # Fall back to direct client IP
    if request.client:
        return request.client.host
    return "unknown"


try:
    checksum_address = Web3.to_checksum_address(CONTRACT_ADDRESS)
    print(f"[INIT] Contract address: {checksum_address}")
    contract = w3.eth.contract(address=checksum_address, abi=CONTRACT_ABI)
    # Verify contract exists by checking code
    code = w3.eth.get_code(checksum_address)
    if code == b'':
        print(f"[INIT] WARNING: No contract code found at {checksum_address}. Contract may not be deployed!")
    else:
        print(f"[INIT] Contract code found at {checksum_address} ({len(code)} bytes)")
except ValueError as exc:
    print(f"[INIT] ERROR: Invalid CONTRACT_ADDRESS: {exc}")
    raise RuntimeError(
        "Invalid CONTRACT_ADDRESS. Update your environment variables."
    ) from exc


app = FastAPI(title="School Voting Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Convert HTTPException to frontend-expected format."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": exc.detail},
    )


def _ensure_contract_connection() -> None:
    if not w3.is_connected():
        raise HTTPException(
            status_code=503,
            detail=f"Blockchain network is not reachable at {RPC_URL}. Check your connection.",
        )


def _get_contract_instance(contract_address: str | None = None):
    """Get a contract instance for the given address, or default."""
    target_address = contract_address or CONTRACT_ADDRESS
    try:
        checksum_address = Web3.to_checksum_address(target_address)
        return w3.eth.contract(address=checksum_address, abi=CONTRACT_ABI)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid contract address: {str(exc)}"
        ) from exc


@app.get("/api/health")
def health() -> Dict[str, Any]:
    try:
        _ensure_contract_connection()
        block_number = w3.eth.block_number
    except Exception:
        block_number = None
    return {"success": True, "data": {"message": "Backend is running", "block": block_number}}


@app.get("/api/candidates")
def get_candidates(contractAddress: str | None = None) -> Dict[str, Any]:
    _ensure_contract_connection()
    try:
        target_contract = _get_contract_instance(contractAddress)
        # New contract uses public candidates array, need to read each candidate
        candidate_count = target_contract.functions.candidateCount().call()
        formatted = []
        for i in range(candidate_count):
            candidate = target_contract.functions.candidates(i).call()
            formatted.append({
                "name": candidate[0],
                "voteCount": str(candidate[1])
            })
        return {"success": True, "data": formatted}
    except ContractLogicError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/stats")
def get_stats(contractAddress: str | None = None) -> Dict[str, Any]:
    _ensure_contract_connection()
    target_contract = _get_contract_instance(contractAddress)
    stats = target_contract.functions.getElectionStats().call()
    return {
        "success": True,
        "data": {
            "totalVoters": str(stats[0]),
            "maxAllowedVoters": str(stats[1]),
            "remainingVoters": str(stats[2]),
            "isActive": bool(stats[3]),
            "timeRemaining": str(stats[4]),
        },
    }


@app.get("/api/admin")
def get_admin() -> Dict[str, Any]:
    _ensure_contract_connection()
    owner_address = contract.functions.owner().call()
    return {"success": True, "data": owner_address}


def _generate_anonymous_address() -> tuple[str, Account]:
    """Generate a random one-time Ethereum address and its account for anonymous voting.
    
    Returns both the address and the Account object (with private key) so we can sign messages.
    This address cannot be traced back to the voter ID, providing true anonymity.
    The address is only used to prevent double voting and is not linked to identity.
    
    Returns:
        tuple: (address_string, Account object with private key)
    """
    import secrets
    # Generate cryptographically secure random 32-byte private key
    random_key = secrets.token_bytes(32)
    account = Account.from_key(random_key)
    return account.address, account

def _build_transaction() -> Dict[str, Any]:
    """Build transaction parameters using server account."""
    if not SERVER_ADDRESS:
        raise HTTPException(
            status_code=500,
            detail="Server private key not configured. Set SERVER_PRIVATE_KEY in .env"
        )
    checksum = Web3.to_checksum_address(SERVER_ADDRESS)
    nonce = w3.eth.get_transaction_count(checksum)
    return {
        "from": checksum,
        "nonce": nonce,
        "gas": 3_000_000,
        "gasPrice": w3.eth.gas_price,
    }


@app.post("/api/vote")
def vote(payload: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_contract_connection()
    candidate = payload.get("candidate")
    voter_id = payload.get("voterAddress")  # This is actually a voter ID string
    contract_address = payload.get("contractAddress")  # Election-specific contract address

    print(f"[VOTE] Received vote request: candidate={candidate}, voter_id={voter_id}, contract={contract_address}")

    if not candidate or not voter_id:
        print("[VOTE] Error: Missing candidate or voterAddress")
        raise HTTPException(status_code=400, detail="Missing candidate or voterAddress")

    if not SERVER_ACCOUNT:
        print("[VOTE] Error: SERVER_ACCOUNT not configured")
        raise HTTPException(
            status_code=500,
            detail="Server account not configured. Set SERVER_PRIVATE_KEY in .env"
        )

    # Get contract instance for this election
    target_contract = _get_contract_instance(contract_address)
    print(f"[VOTE] Using contract address: {contract_address or CONTRACT_ADDRESS}")

    # Generate anonymous one-time address with private key (cannot be traced back to voter ID)
    try:
        voter_address, voter_account = _generate_anonymous_address()
        print(f"[VOTE] Generated anonymous address: {voter_address}")
        print(f"[VOTE] Note: This address cannot be linked to the voter ID for anonymity")
    except Exception as exc:
        print(f"[VOTE] Error generating anonymous address: {exc}")
        raise HTTPException(status_code=500, detail=f"Failed to generate anonymous address: {str(exc)}") from exc

    # Check if this random address has already voted (very unlikely but possible)
    # Note: Since addresses are random, collisions are extremely rare
    try:
        has_voted = target_contract.functions.hasVoted(voter_address).call()
        print(f"[VOTE] Has voted check: {has_voted}")
        if has_voted:
            # If collision occurs, generate a new address (extremely rare)
            print(f"[VOTE] Address collision detected, generating new address...")
            voter_address, voter_account = _generate_anonymous_address()
            has_voted = target_contract.functions.hasVoted(voter_address).call()
            if has_voted:
                raise HTTPException(status_code=500, detail="Address collision - please try again")
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[VOTE] Warning: hasVoted check failed: {exc}, continuing anyway")
        pass  # Continue if check fails, contract will reject anyway

    try:
        # Get the voter's current nonce from the contract
        voter_nonce = target_contract.functions.nonces(voter_address).call()
        print(f"[VOTE] Voter nonce: {voter_nonce}")
        
        # Determine candidate index
        if isinstance(candidate, str) and candidate.isdigit():
            candidate_index = int(candidate)
            print(f"[VOTE] Voting by index: {candidate_index}")
        else:
            # Get candidate index by name
            candidate_index, exists = target_contract.functions.getCandidateIndexByName(candidate).call()
            if not exists:
                raise HTTPException(status_code=400, detail=f"Candidate '{candidate}' not found")
            print(f"[VOTE] Voting by name: {candidate} (index: {candidate_index})")
        
        # Get contract address for message signing
        contract_address_checksum = Web3.to_checksum_address(contract_address or CONTRACT_ADDRESS)
        voter_address_checksum = Web3.to_checksum_address(voter_address)
        
        # Create the message hash: keccak256(abi.encodePacked(address(this), voter, candidateIndex, nonce))
        # We need to manually pack the data to match Solidity's abi.encodePacked
        from eth_utils import keccak
        from eth_utils.conversions import to_bytes
        
        # Encode each value and concatenate (matching abi.encodePacked behavior)
        # Addresses are 20 bytes, uint256 is 32 bytes
        contract_bytes = to_bytes(hexstr=contract_address_checksum)
        voter_bytes = to_bytes(hexstr=voter_address_checksum)
        candidate_bytes = candidate_index.to_bytes(32, byteorder='big')
        nonce_bytes = voter_nonce.to_bytes(32, byteorder='big')
        
        # Concatenate all bytes (this is what abi.encodePacked does)
        packed_data = contract_bytes + voter_bytes + candidate_bytes + nonce_bytes
        message_hash = keccak(packed_data)
        
        # The contract's _prefixed function adds "\x19Ethereum Signed Message:\n32" prefix
        # So we need to sign the prefixed hash
        # The contract does: keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message_hash))
        eth_sign_prefix = b"\x19Ethereum Signed Message:\n32"
        prefixed_data = eth_sign_prefix + message_hash
        prefixed_hash = keccak(prefixed_data)
        
        # Sign the prefixed hash with the anonymous voter's private key
        signed_message = voter_account.signHash(prefixed_hash)
        signature = signed_message.signature
        
        print(f"[VOTE] Message signed with anonymous voter's key")
        print(f"[VOTE] Building transaction...")
        
        # Build transaction to call voteBySignature
        tx_params = _build_transaction()
        print(f"[VOTE] Transaction params: from={tx_params['from']}, nonce={tx_params['nonce']}")
        
        tx_data = target_contract.functions.voteBySignature(
            candidate_index,
            Web3.to_checksum_address(voter_address),
            voter_nonce,
            signature
        ).build_transaction(tx_params)

        print(f"[VOTE] Transaction data built. Gas: {tx_data.get('gas')}, Gas price: {tx_data.get('gasPrice')}")

        # Sign transaction with server private key (for gas payment)
        print("[VOTE] Signing transaction...")
        signed_txn = SERVER_ACCOUNT.sign_transaction(tx_data)
        print(f"[VOTE] Transaction signed. Sending...")
        
        tx_hash = w3.eth.send_raw_transaction(signed_txn.rawTransaction)
        print(f"[VOTE] Transaction sent. Hash: {tx_hash.hex()}")
        
        print("[VOTE] Waiting for receipt...")
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        print(f"[VOTE] Transaction confirmed in block: {receipt.blockNumber}")

        return {"success": True, "data": {"transactionHash": receipt.transactionHash.hex()}}
    except ContractLogicError as exc:
        print(f"[VOTE] Contract logic error: {exc}")
        raise HTTPException(status_code=400, detail=f"Contract error: {str(exc)}") from exc
    except ValueError as exc:
        print(f"[VOTE] ValueError: {exc}")
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(exc)}") from exc
    except Exception as exc:
        print(f"[VOTE] Unexpected error: {type(exc).__name__}: {exc}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Transaction failed: {str(exc)}") from exc


@app.post("/api/deploy-contract")
def deploy_contract(payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
    """Deploy a new SchoolVoting contract with custom candidates.
    
    Stores the creator's IP address for later verification when ending elections.
    """
    _ensure_contract_connection()
    
    candidates = payload.get("candidates", [])
    max_voters = payload.get("maxVoters", 100)
    duration_hours = payload.get("durationHours", 24)
    election_id = payload.get("electionId")  # Election ID from frontend
    
    if not candidates or len(candidates) < 2:
        raise HTTPException(status_code=400, detail="At least 2 candidates are required")
    
    # Get creator IP address
    creator_ip = get_client_ip(request)
    print(f"[DEPLOY] Creator IP: {creator_ip}, Election ID: {election_id}")
    
    # Store creator info if election ID is provided
    if election_id:
        election_creators[election_id] = creator_ip
        print(f"[DEPLOY] Stored creator IP {creator_ip} for election {election_id}")
    
    if not SERVER_ACCOUNT:
        raise HTTPException(
            status_code=500,
            detail="Server account not configured. Set SERVER_PRIVATE_KEY in .env"
        )
    
    print(f"[DEPLOY] Deploying contract with candidates: {candidates}")
    
    try:
        # Load contract bytecode and ABI
        artifact = json.loads(ARTIFACT_PATH.read_text())
        bytecode = artifact["bytecode"]
        abi = artifact["abi"]
        
        # Create contract factory
        contract_factory = w3.eth.contract(abi=abi, bytecode=bytecode)
        
        # Build deployment transaction
        deployer_address = Web3.to_checksum_address(SERVER_ADDRESS)
        nonce = w3.eth.get_transaction_count(deployer_address)
        
        # Build constructor arguments
        constructor_txn = contract_factory.constructor(
            candidates,
            max_voters,
            duration_hours
        ).build_transaction({
            "from": deployer_address,
            "nonce": nonce,
            "gas": 3_000_000,
            "gasPrice": w3.eth.gas_price,
        })
        
        # Sign and send transaction
        print(f"[DEPLOY] Signing deployment transaction...")
        signed_txn = SERVER_ACCOUNT.sign_transaction(constructor_txn)
        tx_hash = w3.eth.send_raw_transaction(signed_txn.rawTransaction)
        
        print(f"[DEPLOY] Transaction sent. Hash: {tx_hash.hex()}")
        print(f"[DEPLOY] Waiting for receipt...")
        
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
        contract_address = receipt.contractAddress
        
        if not contract_address:
            raise HTTPException(
                status_code=500,
                detail="Contract deployment failed: No contract address in receipt"
            )
        
        print(f"[DEPLOY] Contract deployed successfully at: {contract_address}")
        
        return {
            "success": True,
            "data": {
                "contractAddress": contract_address,
                "transactionHash": receipt.transactionHash.hex(),
            },
        }
    except Exception as exc:
        print(f"[DEPLOY] Error deploying contract: {type(exc).__name__}: {exc}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Contract deployment failed: {str(exc)}"
        ) from exc


@app.post("/api/end-election")
def end_election(payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
    """End an election. Verifies that the requester is the creator (by IP address)."""
    _ensure_contract_connection()
    admin_address = payload.get("adminAddress")  # Not used for signing, but kept for compatibility
    contract_address = payload.get("contractAddress")  # Election-specific contract address
    election_id = payload.get("electionId")  # Election ID from frontend
    
    if not admin_address:
        raise HTTPException(status_code=400, detail="Missing adminAddress")

    if not SERVER_ACCOUNT:
        raise HTTPException(
            status_code=500,
            detail="Server account not configured. Set SERVER_PRIVATE_KEY in .env"
        )
    
    # Verify creator by IP address
    if election_id:
        creator_ip = election_creators.get(election_id)
        requester_ip = get_client_ip(request)
        
        print(f"[END] Election ID: {election_id}")
        print(f"[END] Creator IP: {creator_ip}, Requester IP: {requester_ip}")
        
        if creator_ip:
            if requester_ip != creator_ip:
                print(f"[END] Unauthorized: IP mismatch")
                raise HTTPException(
                    status_code=403,
                    detail="Only the election creator can end the election"
                )
            print(f"[END] Creator verified by IP")
        else:
            print(f"[END] Warning: No creator IP stored for election {election_id}, allowing request")
    else:
        print(f"[END] Warning: No election ID provided, skipping creator verification")

    # Get contract instance for this election
    target_contract = _get_contract_instance(contract_address)

    try:
        # Build transaction
        tx_params = _build_transaction()
        tx_data = target_contract.functions.endElection().build_transaction(tx_params)

        # Sign transaction with server private key
        signed_txn = SERVER_ACCOUNT.sign_transaction(tx_data)
        tx_hash = w3.eth.send_raw_transaction(signed_txn.rawTransaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        return {"success": True, "data": {"transactionHash": receipt.transactionHash.hex()}}
    except ContractLogicError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Transaction failed: {str(exc)}") from exc


@app.post("/api/register-election-creator")
def register_election_creator(payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
    """Register the creator of an election (for local elections without contracts)."""
    election_id = payload.get("electionId")
    
    if not election_id:
        raise HTTPException(status_code=400, detail="Missing electionId")
    
    # Get creator IP address
    creator_ip = get_client_ip(request)
    print(f"[REGISTER] Registering creator IP: {creator_ip} for election: {election_id}")
    
    # Store creator info
    election_creators[election_id] = creator_ip
    print(f"[REGISTER] Stored creator IP {creator_ip} for election {election_id}")
    
    return {
        "success": True,
        "data": {
            "electionId": election_id,
            "creatorIp": creator_ip,
        }
    }


@app.get("/api/check-creator")
def check_creator(electionId: str, request: Request) -> Dict[str, Any]:
    """Check if the current requester is the creator of the election."""
    creator_ip = election_creators.get(electionId)
    requester_ip = get_client_ip(request)
    
    is_creator = creator_ip is not None and requester_ip == creator_ip
    
    print(f"[CHECK] Election ID: {electionId}")
    print(f"[CHECK] Creator IP: {creator_ip}, Requester IP: {requester_ip}")
    print(f"[CHECK] Is creator: {is_creator}")
    
    return {
        "success": True,
        "data": {
            "isCreator": is_creator,
            "creatorIp": creator_ip if is_creator else None,  # Only return if they are the creator
        }
    }


@app.get("/api/winner")
def get_winner(contractAddress: str | None = None) -> Dict[str, Any]:
    _ensure_contract_connection()
    try:
        target_contract = _get_contract_instance(contractAddress)
        winner_name, winner_votes, is_tie = target_contract.functions.getWinner().call()
        return {
            "success": True,
            "data": {
                "winnerName": winner_name,
                "winnerVotes": str(winner_votes),
                "isTie": bool(is_tie),
            },
        }
    except ContractLogicError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def run_dev_server() -> None:
    """Run using uvicorn when executing the file directly."""
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)


if __name__ == "__main__":
    run_dev_server()
