// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title PayslipRegistry
/// @notice On-chain payslip anchors. The chain holds only hashes: a salted Merkle root over the payslip's
///         fields, the hash of the canonical document, the payday and the employer who signed. No amounts,
///         no names. Anyone (the operator's relayer) may submit an anchor; the employer is the recovered
///         EIP-712 signer. A third party holding one disclosed field, its salt and a Merkle proof can call
///         `verifyField` to check it against the anchor.
contract PayslipRegistry is EIP712 {
    struct Anchor {
        address employer;
        uint64 payday;
        bytes32 root;
        bytes32 docHash;
        uint64 anchoredAt;
        uint32 version;
    }

    bytes32 public constant PAYSLIP_TYPEHASH =
        keccak256("Payslip(bytes32 runId,bytes32 personId,uint64 payday,bytes32 root,bytes32 docHash)");

    mapping(bytes32 => Anchor) private _anchors;

    event PayslipAnchored(
        bytes32 indexed anchorId,
        bytes32 indexed runId,
        bytes32 indexed personId,
        address employer,
        uint64 payday,
        bytes32 root,
        bytes32 docHash
    );
    event PayslipCorrected(
        bytes32 indexed anchorId,
        address indexed employer,
        uint32 version,
        bytes32 oldRoot,
        bytes32 newRoot,
        bytes32 newDocHash
    );

    error AlreadyAnchored(bytes32 anchorId);
    error NotEmployer(bytes32 anchorId, address expected, address got);
    error PaydayMismatch(bytes32 anchorId, uint64 expected, uint64 got);
    error SameRoot(bytes32 anchorId);
    error ZeroRoot();

    constructor() EIP712("Sera.cx Payroll Payslips", "1") {}

    function anchorId(bytes32 runId, bytes32 personId) public pure returns (bytes32) {
        return keccak256(abi.encode(runId, personId));
    }

    function getAnchor(bytes32 id) external view returns (Anchor memory) {
        return _anchors[id];
    }

    function payslipDigest(bytes32 runId, bytes32 personId, uint64 payday, bytes32 root, bytes32 docHash)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(PAYSLIP_TYPEHASH, runId, personId, payday, root, docHash)));
    }

    /// @notice Anchor a payslip. First anchor for (runId, personId): anyone may submit, employer = signer.
    ///         Re-anchoring reverts unless the same employer signs a correction with the same payday and a
    ///         different root; then the anchor is replaced and `version` increments.
    function anchor(
        bytes32 runId,
        bytes32 personId,
        uint64 payday,
        bytes32 root,
        bytes32 docHash,
        bytes calldata employerSignature
    ) external returns (bytes32 id) {
        if (root == bytes32(0)) revert ZeroRoot();
        id = anchorId(runId, personId);
        address employer = ECDSA.recover(payslipDigest(runId, personId, payday, root, docHash), employerSignature);
        Anchor storage a = _anchors[id];
        if (a.employer == address(0)) {
            _anchors[id] = Anchor({
                employer: employer,
                payday: payday,
                root: root,
                docHash: docHash,
                anchoredAt: uint64(block.timestamp),
                version: 1
            });
            emit PayslipAnchored(id, runId, personId, employer, payday, root, docHash);
            return id;
        }
        if (a.employer != employer) revert NotEmployer(id, a.employer, employer);
        if (a.payday != payday) revert PaydayMismatch(id, a.payday, payday);
        if (a.root == root) revert SameRoot(id);
        bytes32 oldRoot = a.root;
        a.root = root;
        a.docHash = docHash;
        a.anchoredAt = uint64(block.timestamp);
        a.version += 1;
        emit PayslipCorrected(id, employer, a.version, oldRoot, root, docHash);
    }

    /// @notice Leaf hash as @sera-payroll/core computes it: keccak256(abi.encode(string name, string value, bytes32 salt)).
    function leafHash(string calldata name, string calldata value, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(name, value, salt));
    }

    /// @notice Sorted-pair Merkle verification, identical to core's `verifyProof`.
    function verifyField(bytes32 id, bytes32 leaf, bytes32[] calldata proof) external view returns (bool) {
        Anchor storage a = _anchors[id];
        if (a.employer == address(0)) return false;
        return processProof(leaf, proof) == a.root;
    }

    function processProof(bytes32 leaf, bytes32[] calldata proof) public pure returns (bytes32 h) {
        h = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 p = proof[i];
            h = h < p ? keccak256(abi.encode(h, p)) : keccak256(abi.encode(p, h));
        }
    }
}
