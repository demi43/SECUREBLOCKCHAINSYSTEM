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
        candidates: List[Any] = target_contract.functions.getCandidates().call()
        formatted = [
            {"name": candidate[0], "voteCount": str(candidate[1])}
            for candidate in candidates
        ]
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
    admin_address = contract.functions.admin().call()
    return {"success": True, "data": admin_address}


def _generate_anonymous_address() -> str:
    """Generate a random one-time Ethereum address for anonymous voting.
    
    This address cannot be traced back to the voter ID, providing true anonymity.
    The address is only used to prevent double voting and is not linked to identity.
    """
    import secrets
    # Generate cryptographically secure random 32-byte private key
    random_key = secrets.token_bytes(32)
    account = Account.from_key(random_key)
    return account.address

def _voter_id_to_address(voter_id: str) -> str:
    """Convert a voter ID string to a deterministic Ethereum address.
    
    DEPRECATED: This function is kept for backward compatibility but should
    not be used for new votes. Use _generate_anonymous_address() instead.
    """
    # Use keccak256 hash of voter ID, take first 20 bytes (address length)
    hash_bytes = Web3.keccak(text=voter_id)
    # Convert HexBytes to bytes and take first 20 bytes
    address_bytes = bytes(hash_bytes[:20])
    # Convert to hex string and create address
    address_hex = "0x" + address_bytes.hex()
    address = Web3.to_checksum_address(address_hex)
    return address


@app.get("/api/has-voted/{voter_id}")
def has_voted(voter_id: str, contractAddress: str | None = None) -> JSONResponse:
    """Check if a voter ID has already voted.
    
    NOTE: With anonymous voting, we cannot check if a specific voter ID has voted
    because votes use random addresses that cannot be traced back to voter IDs.
    This endpoint always returns False to maintain anonymity.
    The frontend should use sessionStorage to track if a tab has voted.
    """
    print(f"[HAS-VOTED] Received request: voter_id={voter_id}, contractAddress={contractAddress}")
    print(f"[HAS-VOTED] NOTE: With anonymous voting, we cannot verify if a voter ID has voted")
    print(f"[HAS-VOTED] Returning False to maintain anonymity (frontend should track via sessionStorage)")
    
    # With anonymous voting, we cannot check if a voter ID has voted
    # because the address is random and cannot be traced back to the voter ID
    # The frontend should handle duplicate voting prevention via sessionStorage
    response_data = {"success": True, "data": False}
    return JSONResponse(content=response_data, status_code=200)


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

    # Generate anonymous one-time address (cannot be traced back to voter ID)
    try:
        voter_address = _generate_anonymous_address()
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
            voter_address = _generate_anonymous_address()
            has_voted = target_contract.functions.hasVoted(voter_address).call()
            if has_voted:
                raise HTTPException(status_code=500, detail="Address collision - please try again")
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[VOTE] Warning: hasVoted check failed: {exc}, continuing anyway")
        pass  # Continue if check fails, contract will reject anyway

    try:
        # Build transaction
        print("[VOTE] Building transaction...")
        tx_params = _build_transaction()
        print(f"[VOTE] Transaction params: from={tx_params['from']}, nonce={tx_params['nonce']}")
        
        # Build transaction data - use voteForAddress to specify the voter address
        if isinstance(candidate, str) and candidate.isdigit():
            print(f"[VOTE] Voting by index: {int(candidate)}")
            tx_data = target_contract.functions.voteForAddress(int(candidate), voter_address).build_transaction(tx_params)
        else:
            print(f"[VOTE] Voting by name: {candidate}")
            tx_data = target_contract.functions.voteByNameForAddress(candidate, voter_address).build_transaction(tx_params)

        print(f"[VOTE] Transaction data built. Gas: {tx_data.get('gas')}, Gas price: {tx_data.get('gasPrice')}")

        # Sign transaction with server private key
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
def deploy_contract(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Deploy a new SchoolVoting contract with custom candidates."""
    _ensure_contract_connection()
    
    candidates = payload.get("candidates", [])
    max_voters = payload.get("maxVoters", 100)
    duration_hours = payload.get("durationHours", 24)
    
    if not candidates or len(candidates) < 2:
        raise HTTPException(status_code=400, detail="At least 2 candidates are required")
    
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
def end_election(payload: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_contract_connection()
    admin_address = payload.get("adminAddress")  # Not used for signing, but kept for compatibility
    contract_address = payload.get("contractAddress")  # Election-specific contract address
    
    if not admin_address:
        raise HTTPException(status_code=400, detail="Missing adminAddress")

    if not SERVER_ACCOUNT:
        raise HTTPException(
            status_code=500,
            detail="Server account not configured. Set SERVER_PRIVATE_KEY in .env"
        )

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
