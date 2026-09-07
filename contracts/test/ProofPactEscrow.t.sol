// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import { IERC20Minimal, ProofPactEscrow } from "../src/ProofPactEscrow.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function assume(bool condition) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function sign(uint256 privateKey, bytes32 digest) external returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 newTimestamp) external;
    function expectPartialRevert(bytes4 selector) external;
}

contract MockToken is IERC20Minimal {
    mapping(address account => uint256 balance) public balances;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowances;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackAttempted;
    bool public callbackSucceeded;
    bool public chargeFee;
    bool public returnFalse;

    function mint(address recipient, uint256 amount) external {
        balances[recipient] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowances[msg.sender][spender] = amount;
        return true;
    }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }

    function setChargeFee(bool enabled) external {
        chargeFee = enabled;
    }

    function setReturnFalse(bool enabled) external {
        returnFalse = enabled;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        if (returnFalse) return false;
        _move(msg.sender, recipient, amount);
        _callback();
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool) {
        if (returnFalse) return false;
        uint256 allowed = allowances[sender][msg.sender];
        require(allowed >= amount, "allowance");
        allowances[sender][msg.sender] = allowed - amount;
        uint256 received = chargeFee ? amount - 1 : amount;
        balances[sender] -= amount;
        balances[recipient] += received;
        _callback();
        return true;
    }

    function _move(address sender, address recipient, uint256 amount) private {
        balances[sender] -= amount;
        balances[recipient] += amount;
    }

    function _callback() private {
        if (callbackTarget == address(0)) return;
        callbackAttempted = true;
        (callbackSucceeded,) = callbackTarget.call(callbackData);
    }
}

contract ProofPactEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant AUTHORIZER_KEY = 0xA11CE;
    uint256 private constant OTHER_KEY = 0xB0B;
    uint256 private constant ONE_USDC = 1_000_000;
    uint256 private constant CAP = 10_000 * ONE_USDC;

    MockToken private token;
    ProofPactEscrow private escrow;
    address private authorizer;
    address private requester = address(0x1111);
    address private worker = address(0x2222);

    function setUp() public {
        vm.warp(1_800_000_000);
        authorizer = vm.addr(AUTHORIZER_KEY);
        token = new MockToken();
        escrow = new ProofPactEscrow(address(this), authorizer, address(token), CAP);
        token.mint(requester, 20_000 * ONE_USDC);
        vm.prank(requester);
        token.approve(address(escrow), type(uint256).max);
    }

    function testFundsAndReleasesExactRewardFromReceiptBoundPermit() public {
        bytes32 pactId = _fund(800 * ONE_USDC);
        ProofPactEscrow.SettlementPermit memory permit =
            _permit(pactId, ProofPactEscrow.SettlementAction.RELEASE, worker, 800 * ONE_USDC, 1);

        escrow.settle(permit, _sign(permit, AUTHORIZER_KEY));

        _assertEq(token.balances(worker), 800 * ONE_USDC);
        _assertEq(token.balances(address(escrow)), 0);
        (,,,,, ProofPactEscrow.PactStatus status) = escrow.pacts(pactId);
        _assertEq(uint256(status), uint256(ProofPactEscrow.PactStatus.RELEASED));
        _assertTrue(escrow.usedNonces(authorizer, 1));
    }

    function testSignedRefundReturnsRewardToRequester() public {
        uint256 requesterBefore = token.balances(requester);
        bytes32 pactId = _fund(100 * ONE_USDC);
        ProofPactEscrow.SettlementPermit memory permit =
            _permit(pactId, ProofPactEscrow.SettlementAction.REFUND, requester, 100 * ONE_USDC, 2);

        escrow.settle(permit, _sign(permit, AUTHORIZER_KEY));

        _assertEq(token.balances(requester), requesterBefore);
        (,,,,, ProofPactEscrow.PactStatus status) = escrow.pacts(pactId);
        _assertEq(uint256(status), uint256(ProofPactEscrow.PactStatus.REFUNDED));
    }

    function testRequesterCanRecoverOnlyAfterRefundTime() public {
        bytes32 pactId = _fund(25 * ONE_USDC);
        vm.expectPartialRevert(ProofPactEscrow.RefundNotAvailable.selector);
        vm.prank(requester);
        escrow.refundExpired(pactId);

        vm.warp(block.timestamp + 7 days);
        vm.prank(worker);
        vm.expectPartialRevert(ProofPactEscrow.OnlyRequester.selector);
        escrow.refundExpired(pactId);

        vm.prank(requester);
        escrow.refundExpired(pactId);
        _assertEq(token.balances(address(escrow)), 0);
    }

    function testRejectsWrongSignerReplayAndExpiredPermit() public {
        bytes32 firstPact = _fundNamed(keccak256("first"), 10 * ONE_USDC);
        ProofPactEscrow.SettlementPermit memory wrongSigner =
            _permit(firstPact, ProofPactEscrow.SettlementAction.RELEASE, worker, 10 * ONE_USDC, 3);
        bytes memory wrongSignature = _sign(wrongSigner, OTHER_KEY);
        vm.expectPartialRevert(ProofPactEscrow.InvalidSignature.selector);
        escrow.settle(wrongSigner, wrongSignature);

        bytes memory signature = _sign(wrongSigner, AUTHORIZER_KEY);
        escrow.settle(wrongSigner, signature);
        vm.expectPartialRevert(ProofPactEscrow.PactNotFunded.selector);
        escrow.settle(wrongSigner, signature);

        bytes32 secondPact = _fundNamed(keccak256("second"), 10 * ONE_USDC);
        ProofPactEscrow.SettlementPermit memory replayedNonce =
            _permit(secondPact, ProofPactEscrow.SettlementAction.RELEASE, worker, 10 * ONE_USDC, 3);
        bytes memory replayedNonceSignature = _sign(replayedNonce, AUTHORIZER_KEY);
        vm.expectPartialRevert(ProofPactEscrow.NonceAlreadyUsed.selector);
        escrow.settle(replayedNonce, replayedNonceSignature);

        bytes32 thirdPact = _fundNamed(keccak256("third"), 10 * ONE_USDC);
        ProofPactEscrow.SettlementPermit memory expired =
            _permit(thirdPact, ProofPactEscrow.SettlementAction.RELEASE, worker, 10 * ONE_USDC, 4);
        expired.deadline = uint48(block.timestamp - 1);
        bytes memory expiredSignature = _sign(expired, AUTHORIZER_KEY);
        vm.expectPartialRevert(ProofPactEscrow.PermitExpired.selector);
        escrow.settle(expired, expiredSignature);
    }

    function testEveryEconomicAndEvidenceFieldIsBound() public {
        bytes32 pactId = _fund(50 * ONE_USDC);
        ProofPactEscrow.SettlementPermit memory permit =
            _permit(pactId, ProofPactEscrow.SettlementAction.RELEASE, worker, 50 * ONE_USDC, 5);
        bytes memory validSignature = _sign(permit, AUTHORIZER_KEY);

        permit.receiptHash = bytes32(uint256(1));
        vm.expectPartialRevert(ProofPactEscrow.InvalidSignature.selector);
        escrow.settle(permit, validSignature);

        permit = _permit(pactId, ProofPactEscrow.SettlementAction.RELEASE, requester, 50 * ONE_USDC, 5);
        bytes memory wrongRecipientSignature = _sign(permit, AUTHORIZER_KEY);
        vm.expectPartialRevert(ProofPactEscrow.PermitMismatch.selector);
        escrow.settle(permit, wrongRecipientSignature);

        permit = _permit(pactId, ProofPactEscrow.SettlementAction.RELEASE, worker, 49 * ONE_USDC, 5);
        bytes memory wrongAmountSignature = _sign(permit, AUTHORIZER_KEY);
        vm.expectPartialRevert(ProofPactEscrow.PermitMismatch.selector);
        escrow.settle(permit, wrongAmountSignature);

        permit = _permit(pactId, ProofPactEscrow.SettlementAction.RELEASE, worker, 50 * ONE_USDC, 5);
        permit.termsHash = keccak256("substituted terms");
        bytes memory wrongTermsSignature = _sign(permit, AUTHORIZER_KEY);
        vm.expectPartialRevert(ProofPactEscrow.PermitMismatch.selector);
        escrow.settle(permit, wrongTermsSignature);
    }

    function testAuthorizerRotationInvalidatesOldSignature() public {
        bytes32 pactId = _fund(10 * ONE_USDC);
        ProofPactEscrow.SettlementPermit memory permit =
            _permit(pactId, ProofPactEscrow.SettlementAction.RELEASE, worker, 10 * ONE_USDC, 6);
        bytes memory oldSignature = _sign(permit, AUTHORIZER_KEY);
        address nextAuthorizer = vm.addr(OTHER_KEY);
        escrow.setAuthorizer(nextAuthorizer);

        vm.expectPartialRevert(ProofPactEscrow.InvalidSignature.selector);
        escrow.settle(permit, oldSignature);
        escrow.settle(permit, _sign(permit, OTHER_KEY));
        _assertTrue(escrow.usedNonces(nextAuthorizer, 6));
    }

    function testRejectsDuplicateUnsafeAndFeeOnTransferFunding() public {
        bytes32 pactId = _fund(10 * ONE_USDC);
        vm.startPrank(requester);
        vm.expectPartialRevert(ProofPactEscrow.PactAlreadyExists.selector);
        escrow.fundPact(pactId, worker, ONE_USDC, uint48(block.timestamp + 1 days), keccak256("terms"));
        vm.expectPartialRevert(ProofPactEscrow.InvalidAddress.selector);
        escrow.fundPact(
            keccak256("self"), requester, ONE_USDC, uint48(block.timestamp + 1 days), keccak256("terms")
        );
        vm.expectPartialRevert(ProofPactEscrow.InvalidAmount.selector);
        escrow.fundPact(
            keccak256("cap"), worker, CAP + 1, uint48(block.timestamp + 1 days), keccak256("terms")
        );
        vm.stopPrank();

        token.setChargeFee(true);
        vm.expectPartialRevert(ProofPactEscrow.UnsupportedTokenBehavior.selector);
        vm.prank(requester);
        escrow.fundPact(
            keccak256("fee"), worker, ONE_USDC, uint48(block.timestamp + 1 days), keccak256("terms")
        );
    }

    function testRejectsFalseReturningTokenAndReentrantCallback() public {
        token.setReturnFalse(true);
        vm.expectPartialRevert(ProofPactEscrow.TokenCallFailed.selector);
        vm.prank(requester);
        escrow.fundPact(
            keccak256("false"), worker, ONE_USDC, uint48(block.timestamp + 1 days), keccak256("terms")
        );
        token.setReturnFalse(false);

        bytes32 pactId = _fund(ONE_USDC);
        token.setCallback(address(escrow), abi.encodeCall(ProofPactEscrow.refundExpired, (pactId)));
        ProofPactEscrow.SettlementPermit memory permit =
            _permit(pactId, ProofPactEscrow.SettlementAction.RELEASE, worker, ONE_USDC, 7);
        escrow.settle(permit, _sign(permit, AUTHORIZER_KEY));
        _assertTrue(token.callbackAttempted());
        _assertTrue(!token.callbackSucceeded());
        _assertEq(token.balances(worker), ONE_USDC);
    }

    function testOwnershipIsTwoStepAndControlsAreProtected() public {
        address outsider = address(0xBEEF);
        vm.expectPartialRevert(ProofPactEscrow.OnlyOwner.selector);
        vm.prank(outsider);
        escrow.setAuthorizer(outsider);

        escrow.transferOwnership(outsider);
        vm.expectPartialRevert(ProofPactEscrow.OnlyPendingOwner.selector);
        vm.prank(worker);
        escrow.acceptOwnership();
        vm.prank(outsider);
        escrow.acceptOwnership();
        _assertEq(escrow.owner(), outsider);
    }

    function testFuzzExactFunding(uint256 amount) public {
        vm.assume(amount > 0 && amount <= CAP);
        bytes32 pactId = keccak256(abi.encode("fuzz", amount));
        vm.prank(requester);
        escrow.fundPact(pactId, worker, amount, uint48(block.timestamp + 1 days), keccak256("fuzz terms"));
        _assertEq(token.balances(address(escrow)), amount);
    }

    function _fund(uint256 amount) private returns (bytes32 pactId) {
        return _fundNamed(keccak256(abi.encode("pact", amount)), amount);
    }

    function _fundNamed(bytes32 pactId, uint256 amount) private returns (bytes32) {
        vm.prank(requester);
        escrow.fundPact(pactId, worker, amount, uint48(block.timestamp + 7 days), keccak256("terms-v1"));
        return pactId;
    }

    function _permit(
        bytes32 pactId,
        ProofPactEscrow.SettlementAction action,
        address recipient,
        uint256 amount,
        uint256 nonce
    ) private view returns (ProofPactEscrow.SettlementPermit memory) {
        return ProofPactEscrow.SettlementPermit({
            pactId: pactId,
            receiptHash: keccak256(abi.encode("receipt", pactId, nonce)),
            termsHash: keccak256("terms-v1"),
            action: action,
            recipient: recipient,
            token: address(token),
            amount: amount,
            nonce: nonce,
            validAfter: uint48(block.timestamp - 1),
            deadline: uint48(block.timestamp + 15 minutes)
        });
    }

    function _sign(ProofPactEscrow.SettlementPermit memory permit, uint256 privateKey)
        private
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, escrow.settlementDigest(permit));
        return abi.encodePacked(r, s, v);
    }

    function _assertTrue(bool condition) private pure {
        require(condition, "assert true failed");
    }

    function _assertEq(uint256 left, uint256 right) private pure {
        require(left == right, "assert uint failed");
    }

    function _assertEq(address left, address right) private pure {
        require(left == right, "assert address failed");
    }
}
