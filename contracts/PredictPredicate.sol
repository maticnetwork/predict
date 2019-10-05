pragma solidity 0.5.10;
pragma experimental ABIEncoderV2;

import { RLPReader } from "solidity-rlp/contracts/RLPReader.sol";
import { BytesLib } from "./lib/BytesLib.sol";

import { Registry } from "./Registry.sol";
import { DepositAndWithdrawHelper } from "./DepositAndWithdrawHelper.sol";

import "./augur/external/IExchange.sol";
import "./augur/trading/ZeroXTrade.sol";

contract PredictPredicate {
  using RLPReader for bytes;
  using RLPReader for RLPReader.RLPItem;

  Registry public registry;
  DepositAndWithdrawHelper public withdraw;
  ZeroXTrade public zeroXTrade;

  struct ExitTxData {
    address market;
    uint256 inOutcomeZero;
    uint256 inOutcomeOne;
    uint256 finalOutcomeZero;
    uint256 finalOutcomeOne;
  }

  constructor(address _registry, address _exitProcessor) public {
    registry = Registry(_registry);
    withdraw = DepositAndWithdrawHelper(_exitProcessor);
  }

  function startExitForYesNoMarketShares(bytes calldata outcome1Proof, bytes calldata outcome2Proof, bytes calldata exitTx) external {
    ExitTxData memory exitTxData = processExitTx(exitTx);
    // ExitTxData memory exitTxData = processExitTx(exitTx, withdrawManager.networkId());
    if (outcome1Proof.length > 0) {
      RLPReader.RLPItem[] memory referenceTx = outcome1Proof.toRlpItem().toList();
      uint256 outcomeZeroShares = processReferenceTx(
        referenceTx[6].toBytes(), // receipt
        referenceTx[9].toUint(), // logIndex
        msg.sender,
        exitTxData.market,
        0
      );
      require(outcomeZeroShares >= exitTxData.inOutcomeZero, "Spending more outcome0 tokens than owned");
    }
    if (outcome2Proof.length > 0) {
      RLPReader.RLPItem[] memory referenceTx = outcome2Proof.toRlpItem().toList();
      uint256 outcomeOneShares = processReferenceTx(
        referenceTx[6].toBytes(), // receipt
        referenceTx[9].toUint(), // logIndex
        msg.sender,
        exitTxData.market,
        1
      );
      require(outcomeOneShares >= exitTxData.inOutcomeOne, "Spending more outcome1 tokens than owned");
    }
    uint[] memory balances = new uint[](2);
    balances[0] = exitTxData.finalOutcomeZero;
    balances[1] = exitTxData.finalOutcomeOne;
    withdraw.process(msg.sender, exitTxData.market, balances);
  }

  function processReferenceTx(bytes memory receipt, uint256 logIndex, address owner, address market, uint256 outcome)
    internal
    returns (uint256 balance)
    // returns(ReferenceTxData memory data)
    // returns (address market, address owner, uint256 outcome, uint256 balance)
  {
    // require(logIndex < MAX_LOGS, "Supporting a max of 10 logs");
    RLPReader.RLPItem[] memory inputItems = receipt.toRlpItem().toList();
    inputItems = inputItems[3].toList()[logIndex].toList(); // select log based on given logIndex
    address augurContract = RLPReader.toAddress(inputItems[0]); // "address" (contract address that emitted the log) field in the receipt
    // event TokenBalanceChanged(address indexed universe, address indexed owner, address token, TokenType tokenType, address market, uint256 balance, uint256 outcome);
    bytes memory logData = inputItems[2].toBytes();
    inputItems = inputItems[1].toList(); // topics
    // now, inputItems[i] refers to i-th (0-based) topic in the topics array
    // inputItems[0] is the event signature
    // require(
    //   inputItems[0] is the correct event sig
    // )
    // universe = inputItems[1];
    // assert on owner
    owner = address(inputItems[2].toUint());
    // log data
    // address shareToken = address(BytesLib.toUint(logData, 0));
    // uint8 tokenType = address(BytesLib.slice(logData, 32, 1));

    // assert on market instead
    market = address(BytesLib.toUint(logData, 33));
    balance = BytesLib.toUint(logData, 65);
    // assert on outcome instead
    outcome = BytesLib.toUint(logData, 87);
  }

  function processExitTx(bytes memory exitTx) internal returns (ExitTxData memory) {}

  /**
   * @dev Start exit with a zeroX trade
   * @param _taker Order filler
   */
  function trade(
      uint256 _requestedFillAmount,
      address _affiliateAddress,
      bytes32 _tradeGroupId,
      IExchange.Order[] memory _orders,
      bytes[] memory _signatures,
      address _taker)
    public
  {
    // @todo Handle case where the exitor is exiting with a trade where that was filled by someone else
    require(
      _taker == msg.sender,
      "Exitor is not the order taker"
    );
    zeroXTrade.trade(_requestedFillAmount, _affiliateAddress, _tradeGroupId, _orders, _signatures, _taker);
    // Logic for starting an exit
  }

}
