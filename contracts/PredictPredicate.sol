pragma solidity 0.5.10;
pragma experimental ABIEncoderV2;

import { RLPReader } from "solidity-rlp/contracts/RLPReader.sol";
import { BytesLib } from "./lib/BytesLib.sol";

import { Registry } from "./Registry.sol";
import { DepositAndWithdrawHelper } from "./DepositAndWithdrawHelper.sol";
import { IAccountManager } from "./IAccountManager.sol";

import { IMarket } from "./augur/reporting/IMarket.sol";
import "./augur/external/IExchange.sol";
import "./augur/trading/ZeroXTrade.sol";
import "./augur/trading/IClaimTradingProceeds.sol";
import { IOICash } from "./augur/trading/IOICash.sol";

contract PredictPredicate {
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;

    Registry public registry;
    DepositAndWithdrawHelper public withdraw;
    IAccountManager public accounts;

    ZeroXTrade public zeroXTrade;
    IClaimTradingProceeds public claimTradingProceeds;
    IERC20 public cash;
    IOICash public oICash;

    // @todo
    constructor() public {}

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
        address _taker,
        uint256 exitId
    )
        public
    {
        // @todo Handle case where the exitor is exiting with a trade filled by someone else (exitor had a signed order)
        require(
            _taker == msg.sender,
            "Exitor is not the order taker"
        );
        accounts.notifyStartExit(exitId);
        zeroXTrade.trade(_requestedFillAmount, _affiliateAddress, _tradeGroupId, _orders, _signatures, _taker);
        // The trade is valid, @todo start an exit
        accounts.notifyEndExit();
    }
}
