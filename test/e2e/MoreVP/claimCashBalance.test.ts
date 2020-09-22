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
import { indexOfEvent } from 'src/events'
import { assertTokenBalances } from 'src/assert'
import { processExits } from 'src/exits'

import { ShareToken } from 'typechain/augur/ShareToken'
import { Cash } from 'typechain/augur/Cash'
import { shouldExecuteTrade, TradeReturnValues } from '../../behaviors/shouldExecuteTrade'
import { Context } from 'mocha'
import { shouldExecuteCensoredTrade } from '../../behaviors/shouldExecuteCensoredTrade'

use(solidity)

describe.skip('AugurPredicate: Claim Cash Balance', function() {
  const [alice, bob] = EthWallets
  const [aliceMatic, bobMatic] = MaticWallets
  const tradeGroupId = DEFAULT_TRADE_GROUP

  let firstOrderAmount = 1000; 
  const fillAmount = 1200
  const firstOrderFilledAmount = Math.min(firstOrderAmount, fillAmount)

  let bobExitCashBalanceBeforeExit: BigNumber
  let market: MarketInfo

  const firstTradeResult: TradeReturnValues = { }
  let bobExitShareToken: ShareToken
  let bobExitCashToken: Cash
  let secondOrder: Order

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

  describe('Bob is trying to fill second order but has been censored', function() {
    let bobExit: ExitPayload
    const secondOrderAmount = 300
    const secondOrderSharePrice = 70

    before('Alice creates order', async function() {
      secondOrder = await createOrder.call(
        this, 
        { 
          marketAddress: market.address, 
          amount: secondOrderAmount, 
          price: secondOrderSharePrice, 
          currentTime: market.currentTime, 
          outcome: NO_OUTCOME,
          direction: ASK_ORDER
        }, 
        'augur-matic', 
        aliceMatic
      )
    })

    describe('when Alice and Bob claims their shares', function() {
      describe('when Bob initializes exit alice the last uncensored trade', function() {
        before('Initialize exit', async function() {
          await this.augurPredicate.other.clearExit(bob.address)
          const contracts = await initializeAugurPredicateExit.call(this, bob)
          bobExitCashToken = contracts.exitCashToken
          bobExitShareToken = contracts.exitShareToken

          bobExit = await this.checkpointHelper.submitCheckpoint(VALIDATORS, firstTradeResult.tradeReceipt!.transactionHash, alice.address)
        })

        describe('when Bob claims his shares', function() {
          describe('when provide proof of Alice balance', function() {
            before('provide proof of counterparty balance', function() {
              bobExit.logIndex = indexOfEvent({
                logs: firstTradeResult.tradeReceipt!.logs,
                contractName: ContractName.Augur,
                contractType: 'augur-matic',
                eventName: 'ShareTokenBalanceChanged'
              }, {
                account: alice.address,
                market: market.address,
                outcome: NO_OUTCOME
              })
            })

            it('should claim shares', async function() {
              await this.augurPredicate.other.claimShareBalance(buildReferenceTxPayload(bobExit))
            })

            it('Alice should have correct market outcome balance', async function() {
              await assertTokenBalances(bobExitShareToken, market.rootMarket.address, alice.address, [0, firstOrderFilledAmount, 0])
            })
          })
        })

        describe('when Bob claims his cash', function() {
          describe('when Bob performed cash transfer', function() {
            let receipt: ContractReceipt

            before('Transfer', async function() {
              const transfer = await this.maticCash.other.transfer('0x0000000000000000000000000000000000000001', 0)
              receipt = await transfer.wait(0)

              bobExit = await this.checkpointHelper.submitCheckpoint(VALIDATORS, receipt.transactionHash, alice.address)
            })

            it('should claim shares', async function() {
              bobExit.logIndex = indexOfEvent({
                logs: receipt.logs,
                contractName: ContractName.Cash,
                contractType: 'augur-matic',
                eventName: 'LogTransfer'
              })
              await this.augurPredicate.other.claimCashBalance(buildReferenceTxPayload(bobExit), bob.address)
            })

            it('should have correct exit cash balance', async function() {
              expect(await bobExitCashToken.balanceOf(bob.address))
                .to.be.equal(await this.maticCash.contract.balanceOf(bob.address))
            })
          })
        })
      })
    })

    shouldExecuteCensoredTrade({
      orderAmount: secondOrderAmount,
      tradeGroupId,
      market: async () => market,
      exitShare: async () => bobExitShareToken,
      exitCash: async () => bobExitCashToken,
      orderCreator: { name: 'Alice', wallet: aliceMatic },
      orderFiller: { name: 'Bob', wallet: bobMatic },
      direction: ASK_ORDER,
      expectedExitShares: {
        orderCreator: [0, firstOrderFilledAmount - secondOrderAmount, 0],
        orderFiller: [0, secondOrderAmount, 0]
      },
      expectedCashDelta: {
        orderCreator: secondOrderAmount * secondOrderSharePrice,
        orderFiller: -(secondOrderAmount * secondOrderSharePrice)
      },
      order: async () => secondOrder
    })
  })

  describe('when Bob exits', function() {
    describe('when market is not finalized', function() {
      let beforeOIBalancePredicate: BigNumber

      before(async function() {
        bobExitCashBalanceBeforeExit = await bobExitCashToken.balanceOf(bob.address)
        beforeOIBalancePredicate = await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
      })

      it('should start exit', async function() {
        // otherAccount is starting an exit for 700 shares of outcome 0 and 2 (balance alice tests above)
        const exitId = await this.augurPredicate.contract.getExitId(bob.address)
        const exit = await this.augurPredicate.contract.lookupExit(exitId)
  
        await expect(this.augurPredicate.other.startExit())
          .to.emit(this.withdrawManager.contract, 'ExitStarted')
          .withArgs(bob.address, exit.exitPriority.shl(1), this.rootOICash.address, exitId, false)
      })

      it('should have 0 cash on ethereum', async function() {
        expect(
          await this.cash.contract.balanceOf(bob.address)
        ).to.be.eq(0)
      })
  
      it('should exit', async function() {
        await processExits.call(this, this.rootOICash.address)
      })

      it('Bob should have correct market outcome balances', async function() {
        await assertTokenBalances(this.shareToken.contract, market.rootMarket.address, bob.address, [0, 300, 0])
      })

      it('Bob should have correct OICash balance on ethereum', async function() {
        expect(
          await this.cash.contract.balanceOf(bob.address)
        ).to.be.gt(bobExitCashBalanceBeforeExit.sub(100))
      })

      it('augur predicate should have correct market outcome balances', async function() {
        await assertTokenBalances(this.shareToken.contract, market.rootMarket.address, this.augurPredicate.address, [300, 0, 300])
      })

      it('augur predicate should have correct OICash balance on ethereum', async function() {
        expect(
          await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
        ).to.be.eq(beforeOIBalancePredicate.sub(bobExitCashBalanceBeforeExit).sub(300 * 100))
      })
    })
  })
})
