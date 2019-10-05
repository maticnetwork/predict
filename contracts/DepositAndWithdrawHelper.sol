pragma solidity 0.5.10;

import { Registry } from "./Registry.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { DepositManager } from "matic-protocol/contracts/root/depositManager/DepositManager.sol";

import { IOICash } from "./augur/trading/IOICash.sol";

contract DepositAndWithdrawHelper {
  Registry public registry;
  IERC20 public dai;
  DepositManager public depositManager;
  IOICash public oICash;

  struct Exit {
    address owner;
    address market;
    uint256[] balances; // indexed by outcome id
  }

  mapping(uint256 => Exit) public exits;
  uint256 public exitId;

  constructor(address _dai, address _oICash, address payable _depositManager) public {
    dai = IERC20(_dai);
    depositManager = DepositManager(_depositManager);
    oICash = IOICash(_oICash);
  }

  function deposit(uint256 amount) public {
    require(
      dai.transferFrom(msg.sender, address(this), amount),
      "DAI_TRANSFER_FAILED"
    );
    require(
      oICash.deposit(amount),
      "OICash_DEPOSIT_FAILED"
    );
    depositManager.depositERC20ForUser(address(dai), msg.sender, amount);
  }

  function process(address owner, address market, uint256[] calldata balances)
    external
    /* onlyPredicate */
  {
    address _market = registry.childToRootMarket(market);
    // market interaction to buy shares using OICash
    exits[exitId++] = Exit(owner, _market, balances);
  }
}
