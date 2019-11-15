pragma solidity 0.5.10;

import '../IAugur.sol';
import '../reporting/IOICash.sol';


contract IOICashFactory {
    function createOICash(IAugur _augur) public returns (IOICash);
}
