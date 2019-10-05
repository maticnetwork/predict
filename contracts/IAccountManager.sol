pragma solidity 0.5.10;

import { IMarket } from "./augur/reporting/IMarket.sol";

interface IAccountManager {
  function balanceOf(address owner, address market, uint256 outcome) external view returns (uint256);
  function trustedFillOrderTransfer(address _source, address _destination, address market, uint256 outcome, uint256 _attotokens) external returns (bool);
  // Transfer OICash
  function trustedTransfer(address _from, address _to, uint256 _amount) external returns (bool);

  function jointSellCompleteSets(IMarket _market, uint256 _amount, address _shortParticipant, address _longParticipant, uint256 _shortOutcome, address _shortRecipient, address _longRecipient, uint256 _price, address _affiliateAddress) external returns (uint256 _creatorFee, uint256 _reportingFee);
  function jointBuyCompleteSets(IMarket _market, uint256 _amount, address _longParticipant, address _shortParticipant, uint256 _longOutcome, address _longRecipient, address _shortRecipient, uint256 _price) external;
  function sellCompleteSets(address _sender, IMarket _market, uint256 _amount, address _affiliateAddress) external;
}