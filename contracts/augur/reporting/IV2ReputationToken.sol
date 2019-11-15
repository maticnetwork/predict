pragma solidity 0.5.10;

import '../libraries/token/IStandardToken.sol';
import '../reporting/IReputationToken.sol';


contract IV2ReputationToken is IReputationToken, IStandardToken {
    function burnForMarket(uint256 _amountToBurn) public returns (bool);
    function mintForWarpSync(uint256 _amountToMint, address _target) public returns (bool);
}
