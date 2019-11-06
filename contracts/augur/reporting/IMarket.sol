pragma solidity 0.5.10;


contract IMarket {
    enum MarketType {
        YES_NO,
        CATEGORICAL,
        SCALAR
    }

    function getNumberOfOutcomes() public view returns (uint256);
    function getNumTicks() public view returns (uint256);
    function isFinalized() public view returns (bool);
}
