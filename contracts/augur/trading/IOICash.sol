pragma solidity 0.5.10;

interface IOICash {
  function deposit(uint256 _amount) external returns (bool);
}