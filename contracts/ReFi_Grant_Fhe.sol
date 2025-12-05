pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ReFiGrantFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    struct GrantApplication {
        euint32 encryptedAmount;
        euint32 encryptedScore;
        euint32 encryptedGrantAmount;
    }
    mapping(uint256 => GrantApplication) public applications; // batchId -> application
    mapping(uint256 => bool) public batchActive;
    mapping(uint256 => uint256) public batchTotalEncryptedAmount;
    mapping(uint256 => uint256) public batchTotalEncryptedScore;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownSecondsSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event GrantSubmitted(address indexed provider, uint256 indexed batchId, euint32 encryptedAmount, euint32 encryptedScore);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalAmount, uint256 totalScore, uint256 grantAmount);

    error NotOwner();
    error NotProvider();
    error PausedError();
    error CooldownActive();
    error BatchNotActive();
    error BatchAlreadyActive();
    error InvalidBatch();
    error ReplayAttempt();
    error StateMismatch();
    error DecryptionFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedError();
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        emit ProviderAdded(owner);
        cooldownSeconds = 60; // Default cooldown
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        if (!paused) revert PausedError(); // Already unpaused
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(oldCooldownSeconds, newCooldownSeconds);
    }

    function openBatch(uint256 batchId) external onlyOwner {
        if (batchActive[batchId]) revert BatchAlreadyActive();
        batchActive[batchId] = true;
        emit BatchOpened(batchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner {
        if (!batchActive[batchId]) revert BatchNotActive();
        batchActive[batchId] = false;
        emit BatchClosed(batchId);
    }

    function submitGrantApplication(
        uint256 batchId,
        euint32 encryptedAmount,
        euint32 encryptedScore
    ) external onlyProvider whenNotPaused {
        if (!batchActive[batchId]) revert BatchNotActive();
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastSubmissionTime[msg.sender] = block.timestamp;

        applications[batchId] = GrantApplication(encryptedAmount, encryptedScore, euint32(0));
        emit GrantSubmitted(msg.sender, batchId, encryptedAmount, encryptedScore);
    }

    function calculateAndRequestGrantAmountDecryption(uint256 batchId) external onlyOwner whenNotPaused {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        GrantApplication storage app = applications[batchId];
        if (!FHE.isInitialized(app.encryptedAmount)) revert InvalidBatch();
        if (!FHE.isInitialized(app.encryptedScore)) revert InvalidBatch();

        euint32 encryptedGrantAmount = app.encryptedAmount.fheMul(app.encryptedScore);
        app.encryptedGrantAmount = encryptedGrantAmount;

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(encryptedGrantAmount);

        bytes32 stateHash = keccak256(abi.encode(cts, address(this)));
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext(batchId, stateHash, false);
        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function myCallback(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // Rebuild ciphertexts array in the exact same order as in calculateAndRequestGrantAmountDecryption
        // For this contract, it's a single element: the encryptedGrantAmount
        GrantApplication storage app = applications[decryptionContexts[requestId].batchId];
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(app.encryptedGrantAmount);

        bytes32 currentHash = keccak256(abi.encode(cts, address(this)));
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        try FHE.checkSignatures(requestId, cleartexts, proof) {
            // Decode cleartexts in the same order
            uint256 grantAmount = abi.decode(cleartexts, (uint256));

            decryptionContexts[requestId].processed = true;
            emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, 0, 0, grantAmount); // totalAmount and totalScore are 0 as they are not decrypted here
        } catch {
            revert DecryptionFailed();
        }
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 _e) internal {
        _e.fheAdd(euint32(0)); // Ensures initialization
    }

    function _requireInitialized(euint32 _e) internal view {
        if (!FHE.isInitialized(_e)) revert InvalidBatch();
    }
}