// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {PayrollDisburser} from "../src/PayrollDisburser.sol";
import {TestStablecoin} from "../src/TestStablecoin.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// A token whose transferFrom re-enters the disburser.
contract ReentrantToken is ERC20 {
    PayrollDisburser public d;
    bytes32 public runId;
    PayrollDisburser.Leg[] public legs;
    bool public armed;

    constructor() ERC20("Evil", "EVL") {
        _mint(msg.sender, 1e24);
    }

    function arm(PayrollDisburser d_, bytes32 runId_, PayrollDisburser.Leg memory leg) external {
        d = d_;
        runId = runId_;
        delete legs;
        legs.push(leg);
        armed = true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (armed) {
            armed = false;
            d.disburse(runId, legs, false); // must revert with ReentrancyGuardReentrantCall
        }
        return super.transferFrom(from, to, amount);
    }
}

contract PayrollDisburserTest is Test {
    PayrollDisburser d;
    TestStablecoin usdt;
    TestStablecoin myrt;
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    bytes32 runId = keccak256("run-1");

    function setUp() public {
        d = new PayrollDisburser();
        usdt = new TestStablecoin("Test USDT", "tUSDT", 6, 1_000e6, 1 days);
        myrt = new TestStablecoin("Test MYRT", "tMYRT", 6, 1_000e6, 1 days);
        usdt.mint(treasury, 10_000e6);
        myrt.mint(treasury, 10_000e6);
        vm.startPrank(treasury);
        usdt.approve(address(d), type(uint256).max);
        myrt.approve(address(d), type(uint256).max);
        vm.stopPrank();
    }

    function _legs() internal view returns (PayrollDisburser.Leg[] memory legs) {
        legs = new PayrollDisburser.Leg[](2);
        legs[0] = PayrollDisburser.Leg(keccak256("p-alice"), address(usdt), alice, 1_000e6);
        legs[1] = PayrollDisburser.Leg(keccak256("p-bob"), address(myrt), bob, 4_200e6);
    }

    function test_happyPath() public {
        vm.prank(treasury);
        vm.expectEmit(true, true, false, true);
        emit PayrollDisburser.LegPaid(runId, keccak256("p-alice"), address(usdt), alice, 1_000e6);
        uint256 ok = d.disburse(runId, _legs(), false);
        assertEq(ok, 2);
        assertEq(usdt.balanceOf(alice), 1_000e6);
        assertEq(myrt.balanceOf(bob), 4_200e6);
        assertEq(usdt.balanceOf(address(d)), 0, "holds nothing");
        assertTrue(d.paid(d.legKey(runId, keccak256("p-alice"))));
    }

    function test_idempotentSkip() public {
        vm.startPrank(treasury);
        d.disburse(runId, _legs(), false);
        vm.expectEmit(true, true, false, true);
        emit PayrollDisburser.LegSkipped(runId, keccak256("p-alice"), address(usdt), alice, 1_000e6);
        uint256 ok = d.disburse(runId, _legs(), false);
        vm.stopPrank();
        assertEq(ok, 0, "nothing paid twice");
        assertEq(usdt.balanceOf(alice), 1_000e6);
        assertEq(myrt.balanceOf(bob), 4_200e6);
    }

    function test_samePayoutIdDifferentRunPays() public {
        vm.startPrank(treasury);
        d.disburse(runId, _legs(), false);
        d.disburse(keccak256("run-2"), _legs(), false);
        vm.stopPrank();
        assertEq(usdt.balanceOf(alice), 2_000e6);
    }

    function test_partialFailureStrictReverts() public {
        PayrollDisburser.Leg[] memory legs = _legs();
        legs[1].amount = 1_000_000e6; // more than treasury has
        vm.prank(treasury);
        vm.expectRevert();
        d.disburse(runId, legs, false);
        assertEq(usdt.balanceOf(alice), 0, "whole batch reverted");
    }

    function test_partialFailureAllowed() public {
        PayrollDisburser.Leg[] memory legs = _legs();
        legs[1].amount = 1_000_000e6;
        vm.prank(treasury);
        vm.recordLogs();
        uint256 ok = d.disburse(runId, legs, true);
        assertEq(ok, 1);
        assertEq(usdt.balanceOf(alice), 1_000e6);
        assertEq(myrt.balanceOf(bob), 0);
        assertFalse(d.paid(d.legKey(runId, keccak256("p-bob"))), "failed leg stays unpaid and retryable");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool sawFailed;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == PayrollDisburser.LegFailed.selector) sawFailed = true;
        }
        assertTrue(sawFailed);
        // retry only the failed leg once the treasury is topped up
        myrt.mint(treasury, 1_000_000e6);
        vm.prank(treasury);
        uint256 ok2 = d.disburse(runId, legs, true);
        assertEq(ok2, 1);
        assertEq(myrt.balanceOf(bob), 1_000_000e6);
        assertEq(usdt.balanceOf(alice), 1_000e6, "alice not paid twice");
    }

    function test_badLegReverts() public {
        PayrollDisburser.Leg[] memory legs = _legs();
        legs[0].to = address(0);
        vm.prank(treasury);
        vm.expectRevert(abi.encodeWithSelector(PayrollDisburser.BadLeg.selector, 0));
        d.disburse(runId, legs, true);
        vm.prank(treasury);
        vm.expectRevert(PayrollDisburser.EmptyBatch.selector);
        d.disburse(runId, new PayrollDisburser.Leg[](0), true);
    }

    function test_reentrancyBlocked() public {
        ReentrantToken evil = new ReentrantToken();
        evil.transfer(treasury, 100e18);
        vm.prank(treasury);
        evil.approve(address(d), type(uint256).max);
        PayrollDisburser.Leg memory leg = PayrollDisburser.Leg(keccak256("p-evil"), address(evil), alice, 1e18);
        evil.arm(d, runId, leg);
        PayrollDisburser.Leg[] memory legs = new PayrollDisburser.Leg[](1);
        legs[0] = leg;
        vm.prank(treasury);
        vm.expectRevert();
        d.disburse(runId, legs, false);
        // with allowPartial the re-entrant call fails inside transferFrom, so the leg is reported failed, not paid
        evil.arm(d, runId, leg);
        vm.prank(treasury);
        uint256 ok = d.disburse(runId, legs, true);
        assertEq(ok, 0);
        assertEq(evil.balanceOf(alice), 0);
    }

    function test_typehash() public view {
        assertEq(
            d.payRunApprovalTypehash(),
            keccak256(
                "PayRunApproval(bytes32 runId,bytes32 clientId,string fundingAsset,uint256 totalMinor,uint32 payoutCount,bytes32 payoutsRoot,uint64 ratesLockedAt)"
            )
        );
    }
}
