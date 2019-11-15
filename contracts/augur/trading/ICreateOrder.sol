pragma solidity 0.5.10;


import '../trading/Order.sol';
import '../reporting/IMarket.sol';
import '../libraries/token/IERC20.sol';


contract ICreateOrder {
    function publicCreateOrder(Order.Types, uint256, uint256, IMarket, uint256, bytes32, bytes32, bytes32, IERC20) external returns (bytes32);
    function createOrder(address, Order.Types, uint256, uint256, IMarket, uint256, bytes32, bytes32, bytes32, IERC20) external returns (bytes32);
}
