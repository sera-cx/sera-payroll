// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TestStablecoin} from "../src/TestStablecoin.sol";

contract TestStablecoinTest is Test {
    TestStablecoin t;
    address u = makeAddr("u");

    function setUp() public {
        t = new TestStablecoin("Test MYRT", "tMYRT", 6, 1_000e6, 1 days);
    }

    function test_decimalsAndFaucetCooldown() public {
        assertEq(t.decimals(), 6);
        vm.prank(u);
        t.faucet();
        assertEq(t.balanceOf(u), 1_000e6);
        vm.prank(u);
        vm.expectRevert(abi.encodeWithSelector(TestStablecoin.FaucetCooldown.selector, block.timestamp + 1 days));
        t.faucet();
        vm.warp(block.timestamp + 1 days);
        vm.prank(u);
        t.faucet();
        assertEq(t.balanceOf(u), 2_000e6);
    }

    function test_onlyOwnerMints() public {
        t.mint(u, 5);
        assertEq(t.balanceOf(u), 5);
        vm.prank(u);
        vm.expectRevert();
        t.mint(u, 5);
    }
}
