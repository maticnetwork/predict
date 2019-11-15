pragma solidity 0.5.10;

import '../reporting/IUniverse.sol';
import '../libraries/token/IERC20.sol';


contract IOICash is IERC20 {
    function initialize(IAugur _augur, IUniverse _universe, address _erc1820RegistryAddress) external;
}
