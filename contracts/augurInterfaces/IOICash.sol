pragma solidity 0.5.10;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract IOICash is IERC20 {
  function deposit(uint256 _amount) external returns (bool);
}
