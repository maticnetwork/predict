pragma solidity 0.5.10;

contract Registry {
  mapping(address => address) public childToRootMarket;
}
