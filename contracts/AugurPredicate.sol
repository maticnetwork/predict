pragma solidity 0.5.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Initializable} from "./augur/Initializable.sol";
import "./augur/IOICash.sol";
import "./matic/IMatic.sol";

contract AugurPredicate is Initializable {
    // Main Augur
    IOICash public oICash;
    address public mainAugur;
    IERC20 public augurCash;

    // Matic chain
    address public childAugurCash;

    // Matic Predicates
    IDepositManager public depositManager;
    IWithdrawManager public withdrawManager;
    IERC20Predicate public erc20Predicate;

    event ExitFinalized(uint256 indexed exitId,  address indexed exitor);

    modifier onlyWithdrawManager() {
        require(
            msg.sender == address(withdrawManager),
            "ONLY_WITHDRAW_MANAGER"
        );
        _;
    }

    function initialize(
        IOICash _oICash,
        address _mainAugur,
        IERC20 _augurCash,
        address _childAugurCash,
        IDepositManager _depositManager,
        IWithdrawManager _withdrawManager,
        IERC20Predicate _erc20Predicate
    ) public beforeInitialized {
        oICash = _oICash;
        mainAugur = _mainAugur;
        augurCash = _augurCash;
        childAugurCash = _childAugurCash;
        depositManager = _depositManager;
        withdrawManager = _withdrawManager;
        erc20Predicate = _erc20Predicate;
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

    function startExitWithBurntTokens(bytes calldata data) external {
        bytes memory _preState = erc20Predicate.interpretStateUpdate(abi.encode(data, msg.sender, true /* verifyInclusionInCheckpoint */, false /* isChallenge */));
        (uint256 exitAmount, uint256 age, address childToken, address rootToken) = abi.decode(_preState, (uint256, uint256, address, address));
        withdrawManager.addExitToQueue(
            msg.sender,
            childToken,
            rootToken,
            exitAmount,
            bytes32(0x0),
            true, /* isRegularExit */
            age << 1
        );
    }

    function onFinalizeExit(bytes calldata data) external onlyWithdrawManager {
        // this encoded data is compatible with rest of the matic predicates
        (uint256 exitId,,address exitor,uint256 payout) = abi.decode(data, (uint256, address, address, uint256));
        require(
            // Note that this causes fee to be deducted again. Will be fixed when we have the remaining predicate code
            oICash.withdraw(payout),
            "OICash.Withdraw failed"
        );
        require(
            augurCash.transfer(exitor, payout),
            "Cash transfer failed"
        );
        emit ExitFinalized(exitId, exitor);
    }
}
