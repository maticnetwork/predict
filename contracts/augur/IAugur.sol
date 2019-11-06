pragma solidity 0.5.10;


contract IAugur {
    function lookup(bytes32 _key) public view returns (address);
}
