pragma solidity 0.5.10;

// interface Registry {
//     function childToRootMarket(address _childMarket) external view returns (address _rootMarket, uint256 _numOutcomes, uint256 _numTicks);
//     function zeroXTrade() external view returns (address);
// }

contract Registry {
    struct Market {
        address rootMarket;
        uint256 numOutcomes;
        uint256 numTicks;
    }

    mapping(address => Market) public childToRootMarket;
    address public zeroXTrade;
    address public zeroXExchange;


    function mapMarket(address childMarket, address rootMarket, uint256 numOutcomes, uint256 numTicks) public /* @todo onlyOwner */ {
        childToRootMarket[childMarket] = Market(rootMarket, numOutcomes, numTicks);
    }

    function setZeroXTrade(address _zeroXTrade) public /* @todo onlyOwner */ {
        zeroXTrade = _zeroXTrade;
    }

    function setZeroXExchange(address _zeroXTrade) public /* @todo onlyOwner */ {
        zeroXExchange = _zeroXTrade;
    }
}
