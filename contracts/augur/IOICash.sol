pragma solidity 0.5.17;

interface IOICash {
    function deposit(uint256 _amount) external returns (bool);
    function approve(address _spender, uint256 _amount) external returns (bool);
    function withdraw(uint256 _payout) external returns (bool);
}
