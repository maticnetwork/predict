pragma solidity 0.5.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Initializable} from "./augur/Initializable.sol";
import "./augur/IOICash.sol";
import "./matic/IDepositManager.sol";

contract AugurPredicate is Initializable {
    IOICash public oICash;
    IERC20 public augurCash;
    address public mainAugur;

    IDepositManager public depositManager;

    function initializeForMatic(
        IOICash _oICash,
        address _mainAugur,
        IERC20 _augurCash,
        IDepositManager _depositManager
    ) public beforeInitialized {
        oICash = _oICash;
        mainAugur = _mainAugur;
        augurCash = _augurCash;
        depositManager = _depositManager;
    }

    function deposit(uint256 amount) public {
        depositForUser(amount, msg.sender);
    }

    function depositForUser(uint amount, address user) public {
        address from = msg.sender;
        require(
            augurCash.transferFrom(from, address(this), amount),
            "Cash transfer failed"
        );
        require(
            augurCash.approve(mainAugur, amount),
            "Cash approval to Augur failed"
        );
        require(
            oICash.deposit(amount),
            "OICash deposit failed"
        );
        require(
            oICash.approve(address(depositManager), amount),
            "OICash approval to Matic depositManager failed"
        );
        depositManager.depositERC20ForUser(address(oICash), user, amount);
    }
}
