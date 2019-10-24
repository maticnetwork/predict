pragma solidity 0.5.10;

import { IMarket } from "./augur/reporting/IMarket.sol";
import { IAccountManager } from "./IAccountManager.sol";

contract AccountManager is IAccountManager {

  struct Balance {
    uint256 priority;
    uint256 balance;
  }

  // exitId => owner => market => outcome => Balance
  mapping(uint256 => mapping(address => mapping(address => mapping(uint256 => Balance)))) public balances;
  mapping(uint256 => mapping(address => Balance)) public oICashBalances;
  mapping(uint256 => bool) public exitIds;

  /**
   * @dev Provide proof of shares in a Matic market
   * @param data RLP encoded data of the proof-of-shares of exitor (calling it reference tx) that encodes the following fields
      * headerNumber Header block number of which the reference tx was a part of
      * blockProof Proof that the block header (in the child chain) is a leaf in the submitted merkle root
      * blockNumber Block number of which the reference tx is a part of
      * blockTime Reference tx block time
      * blocktxRoot Transactions root of block
      * blockReceiptsRoot Receipts root of block
      * receipt Receipt of the reference transaction
      * receiptProof Merkle proof of the reference receipt
      * branchMask Merkle proof branchMask for the receipt
      * logIndex Log Index of the "event TokenBalanceChanged" in the receipt
   */
  function claimShares(uint256 exitId, bytes calldata data) external {
    require(!exitIds[exitId], "Exit Id is taken");
    // Parse the receipt and process log at position logIndex to determine the share balance in a market
    // (address owner, address market, uint256 outcome, uint256 balance) = parseLogReceipt(data);

    // Get the exit "priority" of this token balance, this is required for plasma safety
    // uint256 exitPriority = withdrawManager.verifyInclusion(data);

    // Credit the balance
    // balances[exitId][owner][market][outcome] = Balance(exitPriority, balance);
  }

  /**
   * @dev Provide proof of OICash balance on Matic
   * @param data RLP encoded data of the proof-of-shares of exitor (calling it reference tx) that encodes the following fields
      * headerNumber Header block number of which the reference tx was a part of
      * blockProof Proof that the block header (in the child chain) is a leaf in the submitted merkle root
      * blockNumber Block number of which the reference tx is a part of
      * blockTime Reference tx block time
      * blocktxRoot Transactions root of block
      * blockReceiptsRoot Receipts root of block
      * receipt Receipt of the reference transaction
      * receiptProof Merkle proof of the reference receipt
      * branchMask Merkle proof branchMask for the receipt
      * logIndex Log Index of the "event TokenBalanceChanged" in the receipt
   */
  function claimOICashBalance(uint256 exitId, bytes calldata data) external {
    require(!exitIds[exitId], "Exit Id is taken");
    // Parse the receipt and process log at position logIndex to determine the OICash balance
    // (address owner, uint256 balance) = parseLogReceipt(data);

    // Get the exit "priority" of this token balance, this is required for plasma safety
    // uint256 exitPriority = withdrawManager.verifyInclusion(data);

    // Will use ERC20Predicate.interpretStateUpdate() to do the above

    // Credit the balance
    // oICashBalances[exitId][owner] = Balance(exitPriority, balance);
  }

  function balanceOf(uint256 exitId, address owner, address market, uint256 outcome) external view returns (uint256) {
    return balances[exitId][owner][market].balance;
  }

  function balanceAndPriority(uint256 exitId, address owner, address market, uint256 outcome) external view returns (uint256) {
    return (balances[exitId][owner][market].balance;
  }

  // balanceOf OICash
  function balanceOf(uint256 exitId, address owner) external view returns (uint256) {
    return oICashBalances[exitId][_from].owner;
  }

  function trustedFillOrderTransfer(address _source, address _destination, address market, uint256 outcome, uint256 _attotokens) external returns (bool) {
    balances[_source][market].balance = balances[_source][market].balance.sub(_attotokens);
    balances[_destination][market].balance = balances[_destination][market].balance.add(_attotokens);

    // exit priority of overall balance now is atleast the exit priority of where these tokens came from
    // balances[_destination][market].priority = Max(balances[_source][market].priority, balances[_destination][market].priority);

    // emit an event
    return true;
  }

  // Transfer OICash
  function trustedTransfer(address _from, address _to, uint256 _amount) external returns (bool) {
    oICashBalances[_from].balance = oICashBalances[_from].balance.sub(_amount);
    oICashBalances[_to].balance = oICashBalances[_to].balance.add(_amount);

    // exit priority of overall balance now is atleast the exit priority of where these tokens came from
    // oICashBalances[_to].priority = Max(oICashBalances[_to].priority, oICashBalances[_from].priority);
  }

  function jointSellCompleteSets(IMarket _maticMarket, uint256 _amount, address _shortParticipant, address _longParticipant, uint256 _shortOutcome, address _shortRecipient, address _longRecipient, uint256 _price, address _affiliateAddress) external returns (uint256 _creatorFee, uint256 _reportingFee) {
    IMarket _market = _getMainChainMarket(address(_maticMarket));

    uint256 _payout = _amount.mul(_market.getNumTicks());
    // @todo calculate creatorFee, reporteFee and subtract from payout

    uint256 exitId; // @todo Pass exitId as arg to jointSellCompleteSets

    // _market.getShareToken(_shortOutcome).destroyShares(_shortParticipant, _amount);
    _destroyShares(exitId, _shortParticipant, address(_maticMarket), _shortOutcome, _amount);
    for (uint256 _outcome = 0; _outcome < _market.getNumberOfOutcomes(); ++_outcome) {
      if (_outcome == _shortOutcome) {
          continue;
      }
      // _market.getShareToken(_outcome).destroyShares(_longParticipant, _amount);
      _destroyShares(exitId, _longParticipant, address(_maticMarket), _outcome, _amount);
    }

    // @todo distribute creator fee and reporter fee

    // distribute payout
    uint256 _shortPayout = _payout.mul(_price) / _market.getNumTicks();
    oICashBalances[exitId][_shortRecipient] += _shortPayout;
    oICashBalances[exitId][_longRecipient] += _payout.sub(_shortPayout);
  }

  function _destroyShares(uint256 exitId, address owner, address market, uint256 outcome, uint256 amount) internal {
    balances[exitId][owner][market][outcome].balance -= amount;
  }

  function _createShares(uint256 exitId, address owner, address market, uint256 outcome, uint256 amount) internal {
    balances[exitId][owner][market][outcome].balance += amount;
  }

  function _getMainChainMarket(address childMarket) internal returns (IMarket market) {
    // @todo get main market address from registry where matic market was initialized
  }

  function jointBuyCompleteSets(IMarket _maticMarket, uint256 _amount, address _longParticipant, address _shortParticipant, uint256 _longOutcome, address _longRecipient, address _shortRecipient, uint256 _price) external {
    IMarket _market = _getMainChainMarket(address(_maticMarket));

    uint256 _cost = _amount.mul(_market.getNumTicks());
    uint256 _longCost = _amount.mul(_price);
    uint256 _shortCost = _cost.sub(_longCost);

    uint256 exitId; // @todo Pass exitId as arg
    // Transfer cost from both participants
    oICashBalances[exitId][_longParticipant].balance -= _longCost;
    oICashBalances[exitId][_shortParticipant].balance -= _shortCost;

    // _market.getShareToken(_longOutcome).createShares(_longRecipient, _amount);
    _createShares(exitId, _longRecipient, address(_maticMarket), _longOutcome, _amount);
    for (uint256 _outcome = 0; _outcome < _market.getNumberOfOutcomes(); ++_outcome) {
      if (_longOutcome == _outcome) {
          continue;
      }
      // _market.getShareToken(_outcome).createShares(_shortRecipient, _amount);
      _createShares(exitId, _shortRecipient, address(_maticMarket), _outcome, _amount);
    }
  }

  function sellCompleteSets(address _sender, IMarket _maticMarket, uint256 _amount, address _affiliateAddress) external {
    IMarket _market = _getMainChainMarket(address(_maticMarket));

    uint256 _numOutcomes = _market.getNumberOfOutcomes();
    uint256 _payout = _amount.mul(_market.getNumTicks());
    // @todo calculate creatorFee, reporteFee and subtract from payout

    uint256 exitId; // @todo Pass exitId as arg

    // Takes shares away from participant and decreases the amount issued in the market since we're exchanging complete sets
    for (uint256 _outcome = 0; _outcome < _numOutcomes; ++_outcome) {
      // _market.getShareToken(_outcome).destroyShares(_sender, _amount);
      _destroyShares(exitId, _sender, address(_maticMarket), _outcome, _amount);
    }

    oICashBalances[exitId][_sender] += _payout;
  }
}
