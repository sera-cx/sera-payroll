// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PayrollDisburser
/// @notice Non-custodial batched payroll payouts. The treasury approves this contract, then calls
///         `disburse`; every leg is a `transferFrom(treasury, employee, amount)`. The contract never holds
///         funds, has no owner and no admin functions. A (runId, payoutId) pair can be paid once, so a retry
///         of a run never pays anyone twice.
/// @dev    Also serves as the `verifyingContract` of the app's EIP-712 `PayRunApproval` domain. The app
///         verifies that signature off chain; `payRunApprovalTypehash()` is published for reference.
contract PayrollDisburser is ReentrancyGuard {
    struct Leg {
        bytes32 payoutId;
        address token;
        address to;
        uint256 amount;
    }

    bytes32 public constant PAY_RUN_APPROVAL_TYPEHASH = keccak256(
        "PayRunApproval(bytes32 runId,bytes32 clientId,string fundingAsset,uint256 totalMinor,uint32 payoutCount,bytes32 payoutsRoot,uint64 ratesLockedAt)"
    );

    /// @notice keccak256(runId, payoutId) => paid
    mapping(bytes32 => bool) public paid;

    event RunDisbursed(bytes32 indexed runId, address indexed payer, uint256 legCount, uint256 okCount);
    event LegPaid(bytes32 indexed runId, bytes32 indexed payoutId, address token, address to, uint256 amount);
    event LegFailed(
        bytes32 indexed runId, bytes32 indexed payoutId, address token, address to, uint256 amount, bytes reason
    );
    event LegSkipped(bytes32 indexed runId, bytes32 indexed payoutId, address token, address to, uint256 amount);

    error EmptyBatch();
    error BadLeg(uint256 index);
    error LegTransferFailed(uint256 index, bytes reason);

    function payRunApprovalTypehash() external pure returns (bytes32) {
        return PAY_RUN_APPROVAL_TYPEHASH;
    }

    function legKey(bytes32 runId, bytes32 payoutId) public pure returns (bytes32) {
        return keccak256(abi.encode(runId, payoutId));
    }

    /// @notice Pay every leg from msg.sender. With `allowPartial == false` any failed transfer reverts the
    ///         whole batch. With `allowPartial == true` failed legs emit `LegFailed` and the rest go through.
    ///         A leg whose (runId, payoutId) was already paid is skipped with `LegSkipped`, never paid again.
    /// @return okCount Number of legs paid in this call.
    function disburse(bytes32 runId, Leg[] calldata legs, bool allowPartial)
        external
        nonReentrant
        returns (uint256 okCount)
    {
        uint256 n = legs.length;
        if (n == 0) revert EmptyBatch();
        for (uint256 i = 0; i < n; i++) {
            Leg calldata l = legs[i];
            if (l.to == address(0) || l.token == address(0) || l.amount == 0) revert BadLeg(i);
            bytes32 key = legKey(runId, l.payoutId);
            if (paid[key]) {
                emit LegSkipped(runId, l.payoutId, l.token, l.to, l.amount);
                continue;
            }
            (bool ok, bytes memory reason) = _pull(l.token, msg.sender, l.to, l.amount);
            if (ok) {
                paid[key] = true;
                okCount++;
                emit LegPaid(runId, l.payoutId, l.token, l.to, l.amount);
            } else if (allowPartial) {
                emit LegFailed(runId, l.payoutId, l.token, l.to, l.amount, reason);
            } else {
                revert LegTransferFailed(i, reason);
            }
        }
        emit RunDisbursed(runId, msg.sender, n, okCount);
    }

    /// @dev transferFrom that tolerates non-standard tokens (no return value) and reports a failure instead of reverting.
    function _pull(address token, address from, address to, uint256 amount) private returns (bool, bytes memory) {
        if (token.code.length == 0) return (false, bytes("not a contract"));
        (bool success, bytes memory data) = token.call(abi.encodeCall(IERC20.transferFrom, (from, to, amount)));
        if (!success) return (false, data);
        if (data.length != 0 && !abi.decode(data, (bool))) return (false, bytes("transferFrom returned false"));
        return (true, "");
    }
}
