// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayslipRegistry} from "../src/PayslipRegistry.sol";

contract PayslipRegistryTest is Test {
    PayslipRegistry r;
    uint256 employerKey = 0xA11CE;
    address employer;
    bytes32 runId = keccak256("run-2026-11");
    bytes32 personId = keccak256("p1");
    uint64 payday = 1_795_824_000; // 2026-11-28T00:00:00Z

    // Shared vector: test/vectors/payslip.json (also checked from packages/chain).
    bytes32 constant ROOT = 0x6a6943e272b7e38bc6f1ee5c59a7528224b446abceb06e05e4f3c69bbb9e5080;
    bytes32 constant DOC = 0x35e8d0ff0e52ced59804de88a2ec336b2bc6aaa70a6ad7adbaa85de773db938a;
    bytes32 constant NET_SALT = 0x922d46ffd89f0bcd18beaf805dfa7c046d6bcdff28d5ddeb305c6601be66b002;
    bytes32 constant NET_LEAF = 0xb04b7c946fe4dc98e4c1201c387942af6aec6616ce4ef297070b80a7c16522dd;

    function setUp() public {
        r = new PayslipRegistry();
        employer = vm.addr(employerKey);
    }

    function _proof() internal pure returns (bytes32[] memory p) {
        p = new bytes32[](5);
        p[0] = 0x026f1153e0eefa65d04ed070c79ec37a3ffa3ff239996710f4d9d2ff00463312;
        p[1] = 0x5de456cd0f760a650a9e6d94629b48463011e3b6e6d6accc1eb6c8badefdbc5a;
        p[2] = 0xf35aacaed5ad9de07e9d7d802812650d45f2fcbf13390aef08c0550282fbfe3d;
        p[3] = 0xb40af9a38324cb47baf5706104147ccf5976c5796d42046183d849d6c52156fe;
        p[4] = 0xa22db4b8b9152c49ffd055c703f50b504243efdf4800ad4815e5ba51d60374b4;
    }

    function _sign(uint256 key, bytes32 root, bytes32 doc, uint64 pd) internal view returns (bytes memory) {
        bytes32 digest = r.payslipDigest(runId, personId, pd, root, doc);
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(rr, s, v);
    }

    function test_anchorRecoversEmployerAndAnyoneCanSubmit() public {
        bytes memory sig = _sign(employerKey, ROOT, DOC, payday);
        address relayer = makeAddr("relayer");
        vm.prank(relayer);
        vm.expectEmit(true, true, true, true);
        emit PayslipRegistry.PayslipAnchored(r.anchorId(runId, personId), runId, personId, employer, payday, ROOT, DOC);
        bytes32 id = r.anchor(runId, personId, payday, ROOT, DOC, sig);
        PayslipRegistry.Anchor memory a = r.getAnchor(id);
        assertEq(a.employer, employer);
        assertEq(a.root, ROOT);
        assertEq(a.docHash, DOC);
        assertEq(a.payday, payday);
        assertEq(a.version, 1);
    }

    function test_merkleVectorMatchesCore() public {
        r.anchor(runId, personId, payday, ROOT, DOC, _sign(employerKey, ROOT, DOC, payday));
        bytes32 id = r.anchorId(runId, personId);
        assertEq(r.leafHash("net", "8500.00", NET_SALT), NET_LEAF, "leaf hash scheme matches core");
        assertTrue(r.verifyField(id, NET_LEAF, _proof()), "proof verifies against anchored root");
        assertFalse(r.verifyField(id, r.leafHash("net", "9999.00", NET_SALT), _proof()), "tampered value fails");
        assertFalse(r.verifyField(keccak256("missing"), NET_LEAF, _proof()), "unknown anchor fails");
    }

    function test_reanchorRules() public {
        r.anchor(runId, personId, payday, ROOT, DOC, _sign(employerKey, ROOT, DOC, payday));
        bytes32 id = r.anchorId(runId, personId);
        bytes32 root2 = keccak256("root2");
        // signatures are computed up front so expectRevert targets the anchor call itself
        bytes memory sameSig = _sign(employerKey, ROOT, DOC, payday);
        bytes memory bobSig = _sign(0xB0B, root2, DOC, payday);
        bytes memory laterSig = _sign(employerKey, root2, DOC, payday + 1);
        bytes memory fixSig = _sign(employerKey, root2, DOC, payday);
        // same root again reverts
        vm.expectRevert(abi.encodeWithSelector(PayslipRegistry.SameRoot.selector, id));
        r.anchor(runId, personId, payday, ROOT, DOC, sameSig);
        // another employer cannot overwrite
        vm.expectRevert(abi.encodeWithSelector(PayslipRegistry.NotEmployer.selector, id, employer, vm.addr(0xB0B)));
        r.anchor(runId, personId, payday, root2, DOC, bobSig);
        // different payday rejected
        vm.expectRevert(abi.encodeWithSelector(PayslipRegistry.PaydayMismatch.selector, id, payday, payday + 1));
        r.anchor(runId, personId, payday + 1, root2, DOC, laterSig);
        // a correction by the same employer with the same payday goes through
        vm.expectEmit(true, true, false, true);
        emit PayslipRegistry.PayslipCorrected(id, employer, 2, ROOT, root2, DOC);
        r.anchor(runId, personId, payday, root2, DOC, fixSig);
        assertEq(r.getAnchor(id).version, 2);
        assertEq(r.getAnchor(id).root, root2);
    }

    function test_zeroRootReverts() public {
        vm.expectRevert(PayslipRegistry.ZeroRoot.selector);
        r.anchor(runId, personId, payday, bytes32(0), DOC, hex"");
    }
}
