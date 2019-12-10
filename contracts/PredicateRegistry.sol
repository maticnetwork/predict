pragma solidity 0.5.10;


contract PredicateRegistry {
    struct Market {
        address rootMarket;
        uint256 numOutcomes;
        uint256 numTicks;
    }

    mapping(address => Market) public childToRootMarket;
    mapping(address => address) public zeroXExchange;
    address public zeroXTrade;
    address public rootZeroXTrade;


    function mapMarket(address childMarket, address rootMarket, uint256 numOutcomes, uint256 numTicks) public /* @todo onlyOwner */ {
        childToRootMarket[childMarket] = Market(rootMarket, numOutcomes, numTicks);
    }

    function setZeroXTrade(address _zeroXTrade) public /* @todo onlyOwner */ {
        zeroXTrade = _zeroXTrade;
    }

    function setRootZeroXTrade(address _zeroXTrade) public /* @todo onlyOwner */ {
        rootZeroXTrade = _zeroXTrade;
    }

    function setZeroXExchange(address childExchange, address rootExchange) public /* @todo onlyOwner */ {
        zeroXExchange[childExchange] = rootExchange;
    }
}
