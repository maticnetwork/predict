pragma solidity 0.5.10;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { DepositManager } from "matic-protocol/contracts/root/depositManager/DepositManager.sol";

import { IOICash } from "./augurInterfaces/IOICash.sol";

contract Deposits {
  IERC20 public dai;
  DepositManager public depositManager;
  IOICash public oICash;
  address augur;

  constructor(address _dai, address _oICash, address payable _depositManager, address _augur) public {
    dai = IERC20(_dai);
    depositManager = DepositManager(_depositManager);
    oICash = IOICash(_oICash);
    augur = _augur;
  }

  function deposit(uint256 amount) public {
    require(
      dai.transferFrom(msg.sender, address(this), amount),
      "Cash transfer failed"
    );
    require(
      dai.approve(augur, amount),
      "Cash approval to Augur failed"
    );
    require(
      oICash.deposit(amount),
      "OICash deposit failed"
    );
    require(
        oICash.approve(address(depositManager), amount),
        "OICash approval to deposit manager failed"
    );
    depositManager.depositERC20ForUser(address(oICash), msg.sender, amount);
  }
}
