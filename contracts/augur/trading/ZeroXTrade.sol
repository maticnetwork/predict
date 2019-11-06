pragma solidity 0.5.10;
pragma experimental ABIEncoderV2;

import "../libraries/math/SafeMathUint256.sol";
// import "ROOT/libraries/ContractExists.sol";
// import "ROOT/libraries/token/IERC20.sol";
import "../external/IExchange.sol";
import "../trading/IFillOrder.sol";
// import "ROOT/ICash.sol";
// import "ROOT/trading/Order.sol";
import "../reporting/IShareToken.sol";
import "../trading/IZeroXTrade.sol";
import "../trading/IAugurTrading.sol";
import '../libraries/Initializable.sol';
import "../IAugur.sol";
// import 'ROOT/libraries/token/IERC1155.sol';


contract ZeroXTrade is Initializable, IZeroXTrade /*, IERC1155 */ {
    using SafeMathUint256 for uint256;

    IFillOrder public fillOrder;
    IShareToken public shareToken;

    function initialize(IAugur _augur, IAugurTrading _augurTrading) public beforeInitialized {
        endInitialization();
        shareToken = IShareToken(_augur.lookup("ShareToken"));
        fillOrder = IFillOrder(_augurTrading.lookup("FillOrder"));
    }

    // @Discuss Not sure why zeroXTrade requires another ERC1155. How is it different from ShareToken?
    // Removing these for now

    // Trade functions

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
        payable
        returns (uint256)
    {
        uint256 _fillAmountRemaining = _requestedFillAmount;

        // transferFromAllowed = true;

        // uint256 _protocolFee = 150000 * tx.gasprice;

        // Do the actual asset exchanges
        for (uint256 i = 0; i < _orders.length && _fillAmountRemaining != 0; i++) {
            IExchange.Order memory _order = _orders[i];
            // @discuss not sure what validations are required for orders that were signed for Matic and how to retrieve _exchange
            // validateOrder(_order);

            // @discuss How to get _exchange address from makerAssetData for an order that was created on Matic
            IExchange _exchange /* = getExchangeFromAssetData(_order.makerAssetData) */;

            // Update 0x and pay protocol fee. This will also validate signatures and order state for us.
            // IExchange.FillResults memory totalFillResults = _exchange.fillOrderNoThrow.value(_protocolFee)(
            IExchange.FillResults memory totalFillResults = _exchange.fillOrderInternal(
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

        // transferFromAllowed = false;

        // @discuss This contract somehow gets ETH during trading execution? Check what needs to be done here, if at all
        // if (address(this).balance > 0) {
        //     msg.sender.transfer(address(this).balance);
        // }

        return _fillAmountRemaining;
    }

    // @discuss Being called in .trade(). Not sure if it is required.
    // function validateOrder(IExchange.Order memory _order) internal view {
    //     (IERC1155 _zeroXTradeToken, uint256 _tokenId) = getZeroXTradeTokenData(_order.makerAssetData);
    //     (IERC1155 _zeroXTradeTokenTaker, uint256 _tokenIdTaker) = getZeroXTradeTokenData(_order.takerAssetData);
    //     require(_zeroXTradeToken == _zeroXTradeTokenTaker);
    //     require(_tokenId == _tokenIdTaker);
    //     require(_zeroXTradeToken == this);
    // }

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

    // function getTokenId(address _market, uint256 _price, uint8 _outcome, uint8 _type) public pure returns (uint256 _tokenId) {
    //     // NOTE: we're assuming no one needs a full uint256 for the price value here and cutting to uint80 so we can pack this in a uint256.
    //     bytes memory _tokenIdBytes = abi.encodePacked(_market, uint80(_price), _outcome, _type);
    //     assembly {
    //         _tokenId := mload(add(_tokenIdBytes, add(0x20, 0)))
    //     }
    // }

    function unpackTokenId(uint256 _tokenId) public pure returns (address _market, uint256 _price, uint8 _outcome, uint8 _type) {
        assembly {
            _market := shr(96, and(_tokenId, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF000000000000000000000000))
            _price := shr(16,  and(_tokenId, 0x0000000000000000000000000000000000000000FFFFFFFFFFFFFFFFFFFF0000))
            _outcome := shr(8, and(_tokenId, 0x000000000000000000000000000000000000000000000000000000000000FF00))
            _type :=           and(_tokenId, 0x00000000000000000000000000000000000000000000000000000000000000FF)
        }
    }

    /// @dev Decode ERC-1155 asset data from the format described in the AssetProxy contract specification.
    /// @param _assetData AssetProxy-compliant asset data describing an ERC-1155 set of assets.
    /// @return The ERC-1155 AssetProxy identifier, the address of the ERC-1155
    /// contract hosting the assets, an array of the identifiers of the
    /// assets to be traded, an array of asset amounts to be traded, and
    /// callback data.  Each element of the arrays corresponds to the
    /// same-indexed element of the other array.  Return values specified as
    /// `memory` are returned as pointers to locations within the memory of
    /// the input parameter `assetData`.
    function decodeAssetData(bytes memory _assetData)
        public
        pure
        returns (
            bytes4 _assetProxyId,
            address _tokenAddress,
            uint256[] memory _tokenIds,
            uint256[] memory _tokenValues,
            bytes memory _callbackData,
            address _kycToken,
            IExchange _exchange
        )
    {
        assembly {
            // Skip selector and length to get to the first parameter:
            _assetData := add(_assetData, 36)
            // Read the value of the first parameter:
            _tokenAddress := mload(_assetData)
            _tokenIds := add(_assetData, mload(add(_assetData, 32)))
            _tokenValues := add(_assetData, mload(add(_assetData, 64)))
            _callbackData := add(_assetData, mload(add(_assetData, 96)))
            _kycToken := mload(add(_assetData, 128))
            _exchange := mload(add(_assetData, 160))
        }

        return (
            _assetProxyId,
            _tokenAddress,
            _tokenIds,
            _tokenValues,
            _callbackData,
            _kycToken,
            _exchange
        );
    }

    // function getExchangeFromAssetData(bytes memory _assetData) public pure returns (IExchange _exchange) {
    //     assembly {
    //         _assetData := add(_assetData, 36)
    //         _exchange := mload(add(_assetData, 160))
    //     }
    // }

    function parseOrderData(IExchange.Order memory _order) public view returns (AugurOrderData memory _data) {
        (bytes4 _assetProxyId, address _tokenAddress, uint256[] memory _tokenIds, uint256[] memory _tokenValues, bytes memory _callbackData, address _kycToken, IExchange _exchange) = decodeAssetData(_order.makerAssetData);
        (address _market, uint256 _price, uint8 _outcome, uint8 _type) = unpackTokenId(_tokenIds[0]);
        _data.marketAddress = _market;
        _data.price = _price;
        _data.orderType = _type;
        _data.outcome = _outcome;
        _data.kycToken = _kycToken;
    }

    // function getZeroXTradeTokenData(bytes memory _assetData) public pure returns (IERC1155 _token, uint256 _tokenId) {
    //     (bytes4 _assetProxyId, address _tokenAddress, uint256[] memory _tokenIds, uint256[] memory _tokenValues, bytes memory _callbackData, address _kycToken, IExchange _exchange) = decodeAssetData(_assetData);
    //     _token = IERC1155(_tokenAddress);
    // }

    // function getTokenIdFromOrder(IExchange.Order memory _order) public pure returns (uint256 _tokenId) {
    //     (bytes4 _assetProxyId, address _tokenAddress, uint256[] memory _tokenIds, uint256[] memory _tokenValues, bytes memory _callbackData, address _kycToken, IExchange _exchange) = decodeAssetData(_order.makerAssetData);
    //     _tokenId = _tokenIds[0];
    // }

    // function createZeroXOrder(uint8 _type, uint256 _attoshares, uint256 _price, address _market, uint8 _outcome, address _kycToken, uint256 _expirationTimeSeconds, IExchange _exchange, uint256 _salt) public view returns (IExchange.Order memory _zeroXOrder, bytes32 _orderHash) {
    //     bytes memory _assetData = encodeAssetData(IMarket(_market), _price, _outcome, _type, IERC20(_kycToken), _exchange);
    //     _zeroXOrder.makerAddress = msg.sender;
    //     _zeroXOrder.takerAddress = address(0);
    //     _zeroXOrder.feeRecipientAddress = address(0);
    //     _zeroXOrder.senderAddress = address(0);
    //     _zeroXOrder.makerAssetAmount = _attoshares;
    //     _zeroXOrder.takerAssetAmount = _attoshares;
    //     _zeroXOrder.makerFee = 0;
    //     _zeroXOrder.takerFee = 0;
    //     _zeroXOrder.expirationTimeSeconds = _expirationTimeSeconds;
    //     _zeroXOrder.salt = _salt;
    //     _zeroXOrder.makerAssetData = _assetData;
    //     _zeroXOrder.takerAssetData = _assetData;
    //     _orderHash = _exchange.getOrderInfo(_zeroXOrder).orderHash;
    // }
}
