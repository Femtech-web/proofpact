// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import { ProofPactEscrow } from "../src/ProofPactEscrow.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function envAddress(string calldata name) external returns (address);
    function envOr(string calldata name, uint256 defaultValue) external returns (uint256);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployProofPactEscrow {
    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    uint256 private constant DEFAULT_MAX_PACT_AMOUNT = 10_000e6;

    function run() external returns (ProofPactEscrow escrow) {
        uint256 deployerKey = VM.envUint("PROOFPACT_DEPLOYER_PRIVATE_KEY");
        uint256 authorizerKey = VM.envUint("PROOFPACT_AUTHORIZER_PRIVATE_KEY");
        address owner = VM.envAddress("PROOFPACT_OWNER_ADDRESS");
        address authorizer = VM.addr(authorizerKey);
        uint256 maxPactAmount = VM.envOr("PROOFPACT_MAX_PACT_AMOUNT_BASE_UNITS", DEFAULT_MAX_PACT_AMOUNT);

        VM.startBroadcast(deployerKey);
        escrow = new ProofPactEscrow(owner, authorizer, BASE_SEPOLIA_USDC, maxPactAmount);
        VM.stopBroadcast();
    }
}
