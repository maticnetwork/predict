pragma solidity 0.5.10;

interface IDepositManager {
    function depositERC20ForUser(address _token, address _user, uint256 _amount) external;
}

interface IERC20Predicate {
    function interpretStateUpdate(bytes calldata state) external view returns (bytes memory);
}

interface IWithdrawManager {
    function addExitToQueue(
        address exitor,
        address childToken,
        address rootToken,
        uint256 exitAmountOrTokenId,
        bytes32 txHash,
        bool isRegularExit,
        uint256 priority
    ) external;
}
