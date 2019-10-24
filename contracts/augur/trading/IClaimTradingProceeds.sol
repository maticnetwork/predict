pragma solidity 0.5.10;

import '../reporting/IMarket.sol';

contract IClaimTradingProceeds {
  function claimTradingProceeds(IMarket _market, address _shareHolder, address _affiliateAddress) external returns(bool);
}
