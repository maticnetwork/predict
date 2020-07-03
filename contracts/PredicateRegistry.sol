pragma solidity 0.5.10;


contract PredicateRegistry {
    struct Market {
        address rootMarket;
        uint256 numOutcomes;
        uint256 numTicks;
    }

    mapping(address => Market) public childToRootMarket;
    mapping(address => address) public zeroXExchange;

    // matic contracts
    address public zeroXTrade;
    address public defaultExchange;
    address public maticCash;
    address public maticShareToken;

    // predicate contracts
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

    function setZeroXExchange(address childExchange, address rootExchange, bool isDefaultExchange) public /* @todo onlyOwner */ {
        zeroXExchange[childExchange] = rootExchange;
        if (isDefaultExchange) {
            defaultExchange = childExchange;
        }
    }

    function setMaticCash(address _maticCash) public /* @todo onlyOwner */ {
        maticCash = _maticCash;
    }

    function setShareToken(address _maticShareToken) public /* @todo onlyOwner */ {
        maticShareToken = _maticShareToken;
    }

    function belongsToStateDeprecationContractSet(address _address) public view returns(bool) {
        address[2] memory maticContracts = [zeroXTrade, defaultExchange];
        for (uint8 i = 0; i < maticContracts.length; i++) {
            if (_address == maticContracts[i]) return true;
        }
        return false;
    }
}
