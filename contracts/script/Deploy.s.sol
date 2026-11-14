// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PayrollDisburser} from "../src/PayrollDisburser.sol";
import {PayslipRegistry} from "../src/PayslipRegistry.sol";
import {TestStablecoin} from "../src/TestStablecoin.sol";

/// Deploys PayrollDisburser, PayslipRegistry and (unless DEPLOY_TEST_TOKENS=false) two demo stablecoins.
/// Env: PRIVATE_KEY (hex, 0x-prefixed), DEPLOY_TEST_TOKENS (default true).
/// Writes deployments/<chainId>.json.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        bool testTokens = vm.envOr("DEPLOY_TEST_TOKENS", true);
        address deployer = vm.addr(pk);
        console.log("Deployer", deployer, "chainId", block.chainid);
        require(block.chainid != 1 || !testTokens, "never deploy TestStablecoin to mainnet");

        vm.startBroadcast(pk);
        PayrollDisburser disburser = new PayrollDisburser();
        PayslipRegistry registry = new PayslipRegistry();
        address tUSDT;
        address tMYRT;
        if (testTokens) {
            tUSDT = address(new TestStablecoin("Test USDT", "tUSDT", 6, 10_000e6, 1 hours));
            tMYRT = address(new TestStablecoin("Test MYRT", "tMYRT", 6, 40_000e6, 1 hours));
        }
        vm.stopBroadcast();

        console.log("PayrollDisburser", address(disburser));
        console.log("PayslipRegistry", address(registry));
        if (testTokens) {
            console.log("tUSDT", tUSDT);
            console.log("tMYRT", tMYRT);
        }

        string memory j = "deployment";
        vm.serializeString(
            j, "network", block.chainid == 11155111 ? "sepolia" : block.chainid == 1 ? "ethereum" : "other"
        );
        vm.serializeUint(j, "chainId", block.chainid);
        vm.serializeUint(j, "deployedAt", block.timestamp);
        vm.serializeAddress(j, "deployer", deployer);
        vm.serializeAddress(j, "PayrollDisburser", address(disburser));
        string memory tokens = "tokens";
        vm.serializeAddress(tokens, "tUSDT", tUSDT);
        string memory tokensJson = vm.serializeAddress(tokens, "tMYRT", tMYRT);
        vm.serializeString(j, "TestStablecoin", tokensJson);
        string memory out = vm.serializeAddress(j, "PayslipRegistry", address(registry));
        vm.writeJson(out, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
