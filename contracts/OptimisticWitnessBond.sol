// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title OptimisticWitnessBond
 * @notice Base L2 10 USDC Rolling Slashable Bond & HTLC Preimage Settlement Contract
 *         for @pandaforge/alpha-witness-mcp (v1.2.0).
 */
contract OptimisticWitnessBond {
    IERC20 public immutable usdc;
    address public immutable seller;
    bytes32 public immutable sellerEd25519PubKeyHash;
    uint256 public immutable requiredBondAmount; // 10_000_000 (10 USDC, 6 decimals)

    mapping(bytes32 => bool) public processedWitnessLocks;

    event BondFunded(address indexed seller, uint256 amountUsdc);
    event BondSlashed(bytes32 indexed hashLockH, address indexed buyer, uint256 slashedAmountUsdc, uint256 actualBps, uint256 claimedBps);

    constructor(address _usdc, address _seller, bytes32 _sellerPubKeyHash, uint256 _requiredBondAmount) {
        usdc = IERC20(_usdc);
        seller = _seller;
        sellerEd25519PubKeyHash = _sellerPubKeyHash;
        requiredBondAmount = _requiredBondAmount;
    }

    function remainingBond() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /**
     * @notice Deterministic integer-cent slash predicate:
     *         Verifies sha256(revealedKeyK) == hashLockH and checks
     *         ((refCents - obsCents) * 10000) / refCents < claimedSpreadBps.
     */
    function verifyAndSlash(
        bytes32 hashLockH,
        bytes32 revealedKeyK,
        uint256 claimedSpreadBps,
        uint256 refPriceCents,
        uint256 obsPriceCents,
        bytes calldata sellerSignatureProof,
        address buyerRecipient
    ) external returns (bool slashed) {
        require(!processedWitnessLocks[hashLockH], "Witness already adjudicated");
        require(sha256(abi.encodePacked(revealedKeyK)) == hashLockH, "Invalid HTLC preimage K");
        require(sellerSignatureProof.length > 0, "Missing DSSE signature proof");

        processedWitnessLocks[hashLockH] = true;

        uint256 actualBps = obsPriceCents < refPriceCents
            ? ((refPriceCents - obsPriceCents) * 10000) / refPriceCents
            : 0;

        if (actualBps < claimedSpreadBps) {
            uint256 payout = remainingBond();
            require(payout > 0, "Bond already depleted");
            require(usdc.transfer(buyerRecipient, payout), "USDC slash transfer failed");
            emit BondSlashed(hashLockH, buyerRecipient, payout, actualBps, claimedSpreadBps);
            return true;
        }
        return false;
    }
}
