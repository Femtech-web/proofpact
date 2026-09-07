// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

/// @title ProofPactEscrow
/// @notice Holds one ERC-20 reward per immutable pact and settles it only from a receipt-bound permit.
contract ProofPactEscrow {
    enum PactStatus {
        NONE,
        FUNDED,
        RELEASED,
        REFUNDED
    }

    enum SettlementAction {
        RELEASE,
        REFUND
    }

    struct Pact {
        address requester;
        address worker;
        uint256 amount;
        uint48 refundAfter;
        bytes32 termsHash;
        PactStatus status;
    }

    struct SettlementPermit {
        bytes32 pactId;
        bytes32 receiptHash;
        bytes32 termsHash;
        SettlementAction action;
        address recipient;
        address token;
        uint256 amount;
        uint256 nonce;
        uint48 validAfter;
        uint48 deadline;
    }

    bytes32 public constant SETTLEMENT_PERMIT_TYPEHASH = keccak256(
        "SettlementPermit(bytes32 pactId,bytes32 receiptHash,bytes32 termsHash,uint8 action,address recipient,address token,uint256 amount,uint256 nonce,uint48 validAfter,uint48 deadline)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("ProofPactEscrow");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant SECP256K1_HALF_ORDER =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    IERC20Minimal public immutable TOKEN;
    uint256 public immutable MAX_PACT_AMOUNT;
    address public owner;
    address public pendingOwner;
    address public authorizer;

    mapping(bytes32 pactId => Pact pact) public pacts;
    mapping(address signer => mapping(uint256 nonce => bool used)) public usedNonces;

    uint256 private lockState = 1;

    error InvalidAddress();
    error InvalidAmount();
    error InvalidPactId();
    error InvalidTermsHash();
    error InvalidRefundTime();
    error PactAlreadyExists(bytes32 pactId);
    error PactNotFunded(bytes32 pactId);
    error OnlyOwner();
    error OnlyPendingOwner();
    error OnlyRequester();
    error RefundNotAvailable(uint48 refundAfter);
    error EmptyReceiptHash();
    error PermitNotActive(uint48 validAfter);
    error PermitExpired(uint48 deadline);
    error PermitMismatch();
    error NonceAlreadyUsed(address signer, uint256 nonce);
    error InvalidSignature();
    error TokenCallFailed();
    error UnsupportedTokenBehavior();
    error ReentrantCall();

    event PactFunded(
        bytes32 indexed pactId,
        address indexed requester,
        address indexed worker,
        uint256 amount,
        uint48 refundAfter,
        bytes32 termsHash
    );
    event PactSettled(
        bytes32 indexed pactId,
        bytes32 indexed receiptHash,
        SettlementAction indexed action,
        address recipient,
        uint256 amount,
        uint256 nonce,
        address authorizer
    );
    event PactRefundedAfterExpiry(bytes32 indexed pactId, address indexed requester, uint256 amount);
    event AuthorizerUpdated(address indexed previousAuthorizer, address indexed newAuthorizer);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    modifier nonReentrant() {
        _beforeNonReentrant();
        _;
        _afterNonReentrant();
    }

    function _checkOwner() private view {
        if (msg.sender != owner) revert OnlyOwner();
    }

    function _beforeNonReentrant() private {
        if (lockState != 1) revert ReentrantCall();
        lockState = 2;
    }

    function _afterNonReentrant() private {
        lockState = 1;
    }

    constructor(
        address initialOwner,
        address initialAuthorizer,
        address tokenAddress,
        uint256 pactAmountCap
    ) {
        if (initialOwner == address(0) || initialAuthorizer == address(0) || tokenAddress == address(0)) {
            revert InvalidAddress();
        }
        if (pactAmountCap == 0) revert InvalidAmount();
        owner = initialOwner;
        authorizer = initialAuthorizer;
        TOKEN = IERC20Minimal(tokenAddress);
        MAX_PACT_AMOUNT = pactAmountCap;
        emit OwnershipTransferred(address(0), initialOwner);
        emit AuthorizerUpdated(address(0), initialAuthorizer);
    }

    function fundPact(bytes32 pactId, address worker, uint256 amount, uint48 refundAfter, bytes32 termsHash)
        external
        nonReentrant
    {
        if (pactId == bytes32(0)) revert InvalidPactId();
        if (worker == address(0) || worker == msg.sender) revert InvalidAddress();
        if (amount == 0 || amount > MAX_PACT_AMOUNT) revert InvalidAmount();
        if (refundAfter <= block.timestamp) revert InvalidRefundTime();
        if (termsHash == bytes32(0)) revert InvalidTermsHash();
        if (pacts[pactId].status != PactStatus.NONE) revert PactAlreadyExists(pactId);

        uint256 balanceBefore = TOKEN.balanceOf(address(this));
        _safeTransferFrom(msg.sender, address(this), amount);
        if (TOKEN.balanceOf(address(this)) - balanceBefore != amount) revert UnsupportedTokenBehavior();

        pacts[pactId] = Pact({
            requester: msg.sender,
            worker: worker,
            amount: amount,
            refundAfter: refundAfter,
            termsHash: termsHash,
            status: PactStatus.FUNDED
        });
        emit PactFunded(pactId, msg.sender, worker, amount, refundAfter, termsHash);
    }

    function settle(SettlementPermit calldata permit, bytes calldata signature) external nonReentrant {
        Pact storage pact = pacts[permit.pactId];
        if (pact.status != PactStatus.FUNDED) revert PactNotFunded(permit.pactId);
        if (permit.receiptHash == bytes32(0)) revert EmptyReceiptHash();
        if (block.timestamp < permit.validAfter) revert PermitNotActive(permit.validAfter);
        if (block.timestamp > permit.deadline) revert PermitExpired(permit.deadline);

        address expectedRecipient = permit.action == SettlementAction.RELEASE ? pact.worker : pact.requester;
        if (
            permit.termsHash != pact.termsHash || permit.recipient != expectedRecipient
                || permit.token != address(TOKEN) || permit.amount != pact.amount
        ) revert PermitMismatch();

        address currentAuthorizer = authorizer;
        if (usedNonces[currentAuthorizer][permit.nonce]) {
            revert NonceAlreadyUsed(currentAuthorizer, permit.nonce);
        }
        if (_recover(settlementDigest(permit), signature) != currentAuthorizer) revert InvalidSignature();

        usedNonces[currentAuthorizer][permit.nonce] = true;
        pact.status = permit.action == SettlementAction.RELEASE ? PactStatus.RELEASED : PactStatus.REFUNDED;
        _safeTransfer(expectedRecipient, pact.amount);

        emit PactSettled(
            permit.pactId,
            permit.receiptHash,
            permit.action,
            expectedRecipient,
            pact.amount,
            permit.nonce,
            currentAuthorizer
        );
    }

    function refundExpired(bytes32 pactId) external nonReentrant {
        Pact storage pact = pacts[pactId];
        if (pact.status != PactStatus.FUNDED) revert PactNotFunded(pactId);
        if (msg.sender != pact.requester) revert OnlyRequester();
        if (block.timestamp < pact.refundAfter) revert RefundNotAvailable(pact.refundAfter);

        pact.status = PactStatus.REFUNDED;
        _safeTransfer(pact.requester, pact.amount);
        emit PactRefundedAfterExpiry(pactId, pact.requester, pact.amount);
    }

    function setAuthorizer(address newAuthorizer) external onlyOwner {
        if (newAuthorizer == address(0)) revert InvalidAddress();
        address previousAuthorizer = authorizer;
        authorizer = newAuthorizer;
        emit AuthorizerUpdated(previousAuthorizer, newAuthorizer);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert OnlyPendingOwner();
        address previousOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, msg.sender);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function settlementDigest(SettlementPermit calldata permit) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                SETTLEMENT_PERMIT_TYPEHASH,
                permit.pactId,
                permit.receiptHash,
                permit.termsHash,
                permit.action,
                permit.recipient,
                permit.token,
                permit.amount,
                permit.nonce,
                permit.validAfter,
                permit.deadline
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function _safeTransfer(address recipient, uint256 amount) private {
        (bool success, bytes memory result) =
            address(TOKEN).call(abi.encodeCall(IERC20Minimal.transfer, (recipient, amount)));
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) revert TokenCallFailed();
    }

    function _safeTransferFrom(address sender, address recipient, uint256 amount) private {
        (bool success, bytes memory result) =
            address(TOKEN).call(abi.encodeCall(IERC20Minimal.transferFrom, (sender, recipient, amount)));
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) revert TokenCallFailed();
    }

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address recovered) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > SECP256K1_HALF_ORDER || (v != 27 && v != 28)) revert InvalidSignature();
        recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert InvalidSignature();
    }
}
