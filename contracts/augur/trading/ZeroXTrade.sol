pragma solidity 0.5.10;
pragma experimental ABIEncoderV2;

import "../external/IExchange.sol";
import "./FillOrder.sol";
import "./IZeroXTradeToken.sol";
import "./IZeroXTrade.sol";
import "../reporting/IMarket.sol";
import "../libraries/math/SafeMathUint256.sol";


contract ZeroXTrade is IZeroXTrade {
    using SafeMathUint256 for uint256;

    IExchange exchange;
    FillOrder fillOrder;

    /**
     * Perform Augur Trades using 0x signed orders
     *
     * @param  _requestedFillAmount  Share amount to fill
     * @param  _affiliateAddress     Address of affiliate to be paid fees if any
     * @param  _tradeGroupId         Random id to correlate these fills as one trade action
     * @param  _orders               Array of encoded Order struct data
     * @param  _signatures           Array of signature data
     * @return                       The amount the taker still wants
     */
    function trade(
        uint256 _requestedFillAmount,
        address _affiliateAddress,
        bytes32 _tradeGroupId,
        IExchange.Order[] memory _orders,
        bytes[] memory _signatures,
        address _taker
    )
        public
        returns (uint256)
    {
        uint256 _fillAmountRemaining = _requestedFillAmount;
        // Do the actual asset exchanges
        for (uint256 i = 0; i < _orders.length && _fillAmountRemaining != 0; i++) {
            IExchange.Order memory _order = _orders[i];

            // Update 0x. This will also validate signatures and order state for us.
            IExchange.FillResults memory totalFillResults = exchange.fillOrderInternal(
                _order,
                _fillAmountRemaining,
                _signatures[i]
            );
            if (totalFillResults.takerAssetFilledAmount == 0) {
                continue;
            }

            uint256 _amountTraded = doTrade(_order, totalFillResults.takerAssetFilledAmount, _affiliateAddress, _tradeGroupId, _taker);
            _fillAmountRemaining = _fillAmountRemaining.sub(_amountTraded);
        }
        return _fillAmountRemaining;
    }

    function doTrade(IExchange.Order memory _order, uint256 _amount, address _affiliateAddress, bytes32 _tradeGroupId, address _taker) private returns (uint256) {
        // parseOrderData will validate that the token being traded is the leigitmate one for the market
        AugurOrderData memory _augurOrderData = parseOrderData(_order);
        // If the maker is also the taker we also just skip the trade
        if (_order.makerAddress == _taker) {
            return 0;
        }
        fillOrder.fillZeroXOrder(IMarket(_augurOrderData.marketAddress), _augurOrderData.outcome, IERC20(_augurOrderData.kycToken), _augurOrderData.price, Order.Types(_augurOrderData.orderType), _amount, _order.makerAddress, _tradeGroupId, _affiliateAddress, _taker);
        return _amount;
    }

    function parseOrderData(IExchange.Order memory _order) public view returns (AugurOrderData memory _data) {
        (bytes4 _assetProxyId, address _tokenAddress, uint256[] memory _tokenIds, uint256[] memory _tokenValues, bytes memory _callbackData, address _kycToken) = decodeAssetData(_order.makerAssetData);
        (uint256 _price, uint8 _outcome, uint8 _type) = unpackTokenId(_tokenIds[0]);
        _data.marketAddress = IZeroXTradeToken(_tokenAddress).getMarket();
        require(IMarket(_data.marketAddress).getZeroXTradeToken() == IZeroXTradeToken(_tokenAddress));
        _data.price = _price;
        _data.orderType = _type;
        _data.outcome = _outcome;
        _data.kycToken = _kycToken;
    }

    function decodeAssetData(bytes memory _assetData)
        public
        pure
        returns (
            bytes4 _assetProxyId,
            address _tokenAddress,
            uint256[] memory _tokenIds,
            uint256[] memory _tokenValues,
            bytes memory _callbackData,
            address _kycToken
        )
    {
        assembly {
            // Skip selector and length to get to the first parameter:
            _assetData := add(_assetData, 36)
            // Read the value of the first parameter:
            _tokenAddress := mload(_assetData)
            // Point to the next parameter's data:
            _tokenIds := add(_assetData, mload(add(_assetData, 32)))
            // Point to the next parameter's data:
            _tokenValues := add(_assetData, mload(add(_assetData, 64)))
            // Point to the next parameter's data:
            _callbackData := add(_assetData, mload(add(_assetData, 96)))
            // Point to the next parameter's data:
            _kycToken := mload(add(_assetData, 128))
        }

        return (
            _assetProxyId,
            _tokenAddress,
            _tokenIds,
            _tokenValues,
            _callbackData,
            _kycToken
        );
    }
}
