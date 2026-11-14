// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TestStablecoin
/// @notice A DEMO stablecoin for a self-hosted testnet of Sera.cx Payroll. Anyone can call `faucet()`
///         once per cooldown. The public demo prefers Sera.cx's own Sepolia test stablecoins so swaps work;
///         this contract exists so a fork can run with no outside dependency. Never deploy to mainnet.
contract TestStablecoin is ERC20, Ownable {
    uint8 private immutable _decimals;
    uint256 public immutable faucetAmount;
    uint256 public immutable faucetCooldown;
    mapping(address => uint256) public lastFaucetAt;

    error FaucetCooldown(uint256 availableAt);

    event Faucet(address indexed to, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 faucetAmount_,
        uint256 faucetCooldown_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _decimals = decimals_;
        faucetAmount = faucetAmount_;
        faucetCooldown = faucetCooldown_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint `faucetAmount` to the caller, once per `faucetCooldown`.
    function faucet() external {
        uint256 availableAt = lastFaucetAt[msg.sender] + faucetCooldown;
        if (lastFaucetAt[msg.sender] != 0 && block.timestamp < availableAt) revert FaucetCooldown(availableAt);
        lastFaucetAt[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
        emit Faucet(msg.sender, faucetAmount);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
