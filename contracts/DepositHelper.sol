pragma solidity 0.5.10;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { DepositManager } from "matic-protocol/contracts/root/depositManager/DepositManager.sol";

import { IOICash } from "./predict/trading/IOICash.sol";

contract DepositHelper {
  IERC20 public dai;
  DepositManager public depositManager;
  IOICash public oICash;

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
}
