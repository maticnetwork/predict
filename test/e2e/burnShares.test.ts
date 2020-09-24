import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber, ContractReceipt } from 'ethers'

import { ContractName } from 'src/types'
import { EthWallets, MaticWallets } from 'src/wallets'

import { DEFAULT_TRADE_GROUP, BID_ORDER, ASK_ORDER, VALIDATORS, NO_OUTCOME } from 'src/constants'
import { createOrder, Order } from 'src/orders'
import { buildReferenceTxPayload, ExitPayload } from '@maticnetwork/plasma'
import { deployAndPrepareTrading, approveAllForCashAndShareTokens, initializeAugurPredicateExit, MarketInfo } from 'src/setup'
import { createMarket } from 'src/setup'
import { findEvents, indexOfEvent } from 'src/events'
import { assertTokenBalances } from 'src/assert'
import { processExits } from 'src/exits'

import { ShareToken } from 'typechain/augur/ShareToken'
import { Cash } from 'typechain/augur/Cash'
import { shouldExecuteTrade, TradeReturnValues } from '../behaviors/shouldExecuteTrade'
import { Context } from 'mocha'
import { shouldExecuteCensoredTrade } from '../behaviors/shouldExecuteCensoredTrade'

use(solidity)

describe.only('Exit with burnt shares', function() {
  const [alice, bob] = EthWallets
  const [aliceMatic, bobMatic] = MaticWallets
  const tradeGroupId = DEFAULT_TRADE_GROUP

  const firstOrderAmount = 1000
  const fillAmount = 1200
  const firstOrderFilledAmount = Math.min(firstOrderAmount, fillAmount)

  const firstTradeResult: TradeReturnValues = { }
  let market: MarketInfo
  let bobExitShareToken: ShareToken
  let bobExitCashToken: Cash
  let bobExitId: BigNumber
  let aliceExitId: BigNumber

  before(deployAndPrepareTrading)
  before('Prepare trading', async function() {
    market = await createMarket.call(this)

    await approveAllForCashAndShareTokens('augur-matic')
  })

  shouldExecuteTrade({
    orderAmount: firstOrderAmount,
    sharePrice: 60,
    fillAmount,
    returnValues: firstTradeResult,
    orderCreator: { name: 'Alice', wallet: aliceMatic },
    orderFiller: { name: 'Bob', wallet: bobMatic },
    tradeGroupId,
    direction: BID_ORDER,
    market: async () => market,
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

  describe('when Alice exits with burnt tokens', function() {
    describe('partial burn', function() {
      let exitPayload: ExitPayload
      let cashBalanceBeforeExit: BigNumber
      let exitAmount: BigNumber
      let amountExpectedOnMatic: BigNumber
      
      before('Burn cash', async function() {
        cashBalanceBeforeExit = await this.cash.contract.balanceOf(alice.address)

        const currentCashBalance = await this.maticCash.contract.balanceOf(alice.address)
        const burnAmount = currentCashBalance.div(4)

        amountExpectedOnMatic = currentCashBalance.sub(burnAmount)

        exitAmount = burnAmount.sub(burnAmount.div(100)) // 1% fee
        exitAmount = cashBalanceBeforeExit.add(exitAmount)

        const tx = await this.maticCash.from.joinBurn(alice.address, burnAmount)
        const receipt = await tx.wait(0)
        exitPayload = await this.checkpointHelper.submitCheckpoint(VALIDATORS, tx.hash, alice.address)
        exitPayload.logIndex = indexOfEvent({
          logs: receipt.logs,
          contractName: ContractName.Cash,
          contractType: 'augur-matic',
          eventName: 'Withdraw'
        })
      })

      it('must start exit', async function() {
        const promise = this.augurPredicate.from.startExitWithBurntTokens(buildReferenceTxPayload(exitPayload))
        await expect(promise).to.emit(this.withdrawManager.contract, 'ExitStarted')
      })

      it('must process exits', async function() {
        await processExits.call(this, this.cash.address)
      })

      it('cash balance must be reflected on ethereum', async function() {
        expect(
          await this.cash.contract.balanceOf(alice.address)
        ).to.be.eq(exitAmount)
      })

      it('must have correct balance on matic', async function() {
        expect(
          await this.maticCash.contract.balanceOf(alice.address)
        ).to.be.eq(amountExpectedOnMatic)
      })
    })
  })
})
