import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber, Wallet } from 'ethers'

import { ContractName } from 'src/types'
import { EthWallets, MaticWallets } from 'src/wallets'

import { DEFAULT_TRADE_GROUP, BID_ORDER, VALIDATORS, NO_OUTCOME, DEFAULT_RECOMMENDED_TRADE_INTERVAL } from 'src/constants'
import { createOrder } from 'src/orders'
import { buildReferenceTxPayload, ExitPayload } from '@maticnetwork/plasma'
import { deployAndPrepareTrading, MarketInfo, createMarket } from 'src/setup'

import { findEvents, indexOfEvent } from 'src/events'
import { processExits } from 'src/exits'

import { shouldExecuteTrade, TradeReturnValues } from '../behaviors/shouldExecuteTrade'
import { Context } from 'mocha'

use(solidity)

function shouldExitWithBurntCash(wallet: Wallet, maticWallet: Wallet, name: string) {
  describe(`when ${name} exits with burnt tokens`, function() {
    describe('partial burn', function() {
      let exitPayload: ExitPayload
      let cashBalanceBeforeExit: BigNumber
      let exitAmount: BigNumber
      let burnAmount: BigNumber
      let amountExpectedOnMatic: BigNumber
      let maticCashBalanceBeforeExit: BigNumber

      before('Burn cash', async function() {
        cashBalanceBeforeExit = await this.cash.contract.balanceOf(wallet.address)
        maticCashBalanceBeforeExit = await this.maticCash.contract.balanceOf(wallet.address)

        burnAmount = maticCashBalanceBeforeExit.div(4)
        amountExpectedOnMatic = maticCashBalanceBeforeExit.sub(burnAmount)
        exitAmount = cashBalanceBeforeExit.add(burnAmount)

        const tx = await this.maticCash.contract.connect(maticWallet).withdraw(burnAmount)
        const receipt = await tx.wait(0)

        exitPayload = await this.checkpointHelper.submitCheckpoint(VALIDATORS, tx.hash, wallet.address)
        exitPayload.logIndex = indexOfEvent({
          logs: receipt.logs,
          contractName: ContractName.TradingCash,
          contractType: 'augur-matic',
          eventName: 'Withdraw'
        })
      })

      it('must start exit', async function() {
        const promise = this.augurPredicate.contract.connect(wallet).startExitWithBurntTokens(buildReferenceTxPayload(exitPayload))
        await expect(promise)
          .to.emit(this.withdrawManager.contract, 'ExitStarted')
      })

      it('must process exits', async function() {
        await expect(processExits.call(this, this.oiCash.address))
          .to.emit(this.withdrawManager.contract, 'Withdraw')
          .to.emit(this.augurPredicate.contract, 'ExitFinalized')
      })

      it('cash balance must be reflected on ethereum', async function() {
        expect(
          await this.cash.contract.balanceOf(wallet.address)
        ).to.be.lte(exitAmount)
      })

      it('must have correct cash balance on matic', async function() {
        expect(
          await this.maticCash.contract.balanceOf(wallet.address)
        ).to.be.eq(amountExpectedOnMatic)
      })
    })
  })
}

describe('Exit with burnt cash', function() {
  const [alice, bob] = EthWallets
  const [aliceMatic, bobMatic] = MaticWallets
  const tradeGroupId = DEFAULT_TRADE_GROUP

  const firstOrderAmount = BigNumber.from(1000).mul(DEFAULT_RECOMMENDED_TRADE_INTERVAL)
  const fillAmount = BigNumber.from(1200).mul(DEFAULT_RECOMMENDED_TRADE_INTERVAL)
  const firstOrderFilledAmount = firstOrderAmount

  const firstTradeResult: TradeReturnValues = { }
  let market: MarketInfo

  before(deployAndPrepareTrading)
  before('Prepare trading', async function() {
    market = await createMarket.call(this)
  })

  shouldExecuteTrade({
    orderAmount: firstOrderAmount,
    sharePrice: 60,
    fillAmount,
    returnValues: firstTradeResult,
    orderCreator: { name: 'Alice', wallet: alice, maticWallet: aliceMatic },
    orderFiller: { name: 'Bob', wallet: bob, maticWallet: bobMatic },
    tradeGroupId,
    direction: BID_ORDER,
    market: async() => market,
    order: async function(this: Context) {
      return createOrder.call(
        this,
        {
          marketAddress: market.address,
          amount: firstOrderAmount,
          price: 60,
          currentTime: market.currentTime,
          outcome: NO_OUTCOME,
          direction: BID_ORDER
        },
        'augur-matic',
        aliceMatic
      )
    },
    expectedShares: {
      orderCreator: [0, firstOrderFilledAmount, 0],
      orderFiller: [firstOrderFilledAmount, 0, firstOrderFilledAmount]
    }
  })

  shouldExitWithBurntCash(alice, aliceMatic, 'Alice')
  shouldExitWithBurntCash(bob, bobMatic, 'Bob')
})
