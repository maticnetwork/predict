import { use, expect } from 'chai'
import { deployContract, solidity } from 'ethereum-waffle'
import { BigNumber, BigNumberish, ContractReceipt, Wallet } from 'ethers'

import { ContractName } from 'src/types'
import { EthWallets, MaticWallets } from 'src/wallets'

import { DEFAULT_TRADE_GROUP, BID_ORDER, VALIDATORS, NO_OUTCOME, DEFAULT_GAS } from 'src/constants'
import { createOrder } from 'src/orders'
import { buildReferenceTxPayload, ExitPayload } from '@maticnetwork/plasma'
import { deployAndPrepareTrading, MarketInfo, createMarket } from 'src/setup'

import { findEvents, indexOfEvent } from 'src/events'
import { processExits } from 'src/exits'

import { shouldExecuteTrade, TradeReturnValues } from '../behaviors/shouldExecuteTrade'
import { Context } from 'mocha'
import { FeePotPredicate } from 'typechain/augur/FeePotPredicate'
import { ConnectedContract, connectedContract, getAddress, getDeployed } from 'src/deployedContracts'
import { TradingCash } from 'typechain/augur/TradingCash'
import { Cash } from 'typechain/augur/Cash'

use(solidity)

describe.only('Exit for augur fee pot', function() {
  const initialFeesAccumulated = 1e6
  const exitFee = 100 // 10%
  const EthAlice = EthWallets[1] // use 2nd wallet, first wallet is childChain for the test
  const MaticAlice = MaticWallets[1] // use 2nd wallet, first wallet is childChain for the test
  let exitTx: ContractReceipt
  let exitPayload: ExitPayload
  let feePotPredicate: ConnectedContract<FeePotPredicate>
  let maticCash:TradingCash
  let cash:Cash

  before(deployAndPrepareTrading)
  before('Put some trading cash into Augur predicate', async function() {
    maticCash = this.maticCash.contract.connect(MaticAlice)
    cash = this.cash.contract.connect(EthAlice)

    // switch child chain caller for the test
    await this.maticCash.from.changeChildChain(MaticAlice.address)
    // deposit fees to matic augur registry
    await maticCash.deposit(this.augurRegistry.address, initialFeesAccumulated)
    // and to augur predicate
    await cash.faucet(initialFeesAccumulated)

    await cash.approve(this.augurPredicate.address, initialFeesAccumulated)
    await this.augurPredicate.contract.connect(EthAlice).deposit(initialFeesAccumulated)

    feePotPredicate = await connectedContract(ContractName.FeePotPredicate, 'augur-main')
    await feePotPredicate.from.setExitorFee(exitFee)
  })

  describe('when Alice exits with 100% of fees accumulated', function() {
    describe('burns fees on matic', function() {
      it('must withdraw', async function() {
        const p = this.augurRegistry.contract.connect(MaticAlice).withdrawFees(initialFeesAccumulated)
        await expect(p)
          .to.emit(this.maticCash.contract, 'Withdraw')
          .withArgs(this.oiCash.address, this.augurRegistry.address, initialFeesAccumulated, initialFeesAccumulated, 0)

        exitTx = await (await p).wait(0)
      })

      it('augur registry should have 0 balance', async function() {
        expect(
          await this.maticCash.contract.balanceOf(this.augurRegistry.address)
        ).to.be.eq(0)
      })
    })

    describe('exits on ethereum', function() {
      // let cashBalanceBeforeExit: BigNumber

      before(async function() {
        exitPayload = await this.checkpointHelper.submitCheckpoint(VALIDATORS, exitTx.transactionHash, EthAlice.address)
        exitPayload.logIndex = indexOfEvent({
          logs: exitTx.logs,
          contractType: 'augur-matic',
          contractName: ContractName.TradingCash,
          eventName: 'Withdraw'
        })
        // cashBalanceBeforeExit = await this.cash.contract.balanceOf(EthAlice.address)
      })

      it('must start exit', async function() {
        await expect(feePotPredicate.contract.connect(EthAlice).startExitWithBurntFees(buildReferenceTxPayload(exitPayload)))
          .to.emit(this.withdrawManager.contract, 'ExitStarted')
      })

      it('must process exits', async function() {
        await expect(processExits.call(this, this.oiCash.address))
          .to.emit(this.withdrawManager.contract, 'Withdraw')
          .to.emit(feePotPredicate.contract, 'ExitFinalized')
      })

      it('Alice must have correct Cash balance', async function() {
        const newBalance = await this.cash.contract.balanceOf(EthAlice.address)
        // const feePrecision = await feePotPredicate.contract.FEE_PRECISION()
        // const reward = BigNumber.from(initialFeesAccumulated).mul(exitFee).div(feePrecision)

        expect(newBalance).to.be.eq(99990) // reward - reporting fee
      })

      it('FeePot must have correct Cash balance', async function() {
        expect(
          await this.cash.contract.balanceOf(
            await getAddress(ContractName.FeePot, 'augur-main')
          )
        ).to.be.eq(900010)
      })
    })
  })
})
