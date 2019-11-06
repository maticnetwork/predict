pragma solidity 0.5.10;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ICash is IERC20 {
    function joinMint(address usr, uint wad) public returns (bool);
    function joinBurn(address usr, uint wad) public returns (bool);
}
