import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber, utils } from 'ethers'

import { ContractName } from 'src/types'
import { EthWallets, MaticWallets } from 'src/wallets'

import { ASK_ORDER, BID_ORDER, INVALID_OUTCOME, MAX_FEE, NO_OUTCOME, VALIDATORS, YES_OUTCOME } from 'src/constants'
import { createOrder, Order } from 'src/orders'
import { buildReferenceTxPayload, ExitPayload } from '@maticnetwork/plasma'
import { deployAndPrepareTrading, approveAllForCashAndShareTokens, initializeAugurPredicateExit, MarketInfo } from 'src/setup'
import { createMarket } from 'src/setup'
import { indexOfEvent } from 'src/events'
import { assertTokenBalances } from 'src/assert'
import { processExits, finalizeMarket } from 'src/exits'
import { ShareToken } from 'typechain/augur/ShareToken'
import { Cash } from 'typechain/augur/Cash'
import { shouldExecuteTrade, TradeReturnValues } from '../../behaviors/shouldExecuteTrade'
import { Context } from 'mocha'
import { shouldExecuteCensoredTrade } from '../../behaviors/shouldExecuteCensoredTrade'

use(solidity)

describe('AugurPredicate: Claim Share Balance', function() {
  const [alice, bob] = EthWallets
  const [aliceMatic, bobMatic] = MaticWallets
  const tradeGroupId = utils.hexZeroPad(utils.hexValue(42), 32)

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
      describe('when Bob initializes exit from the last uncensored trade', function() {
        before('Initialize exit', async function() {
          await this.augurPredicate.other.clearExit(bob.address)
          const contracts = await initializeAugurPredicateExit.call(this, bob)
          bobExitCashToken = contracts.exitCashToken
          bobExitShareToken = contracts.exitShareToken

          bobExit = await this.checkpointHelper.submitCheckpoint(VALIDATORS, firstTradeResult.tradeReceipt!.transactionHash, alice.address)
        })

        after(async function() {
          // @discuss Do we expect a counterparty to have "Invalid shares" as well - to go short on an outcome...?
          await this.augurPredicate.other.claimShareBalanceFaucet(bob.address, market.address, INVALID_OUTCOME, firstOrderFilledAmount)
        })

        describe('when Bob claims his shares', function() {
          describe('when provided proof of Alice balance for outcome NO', function() {
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

          describe('when provided proof of his own balance for outcome YES', function() {
            before('provide proof of the own balance', function() {
              bobExit.logIndex = indexOfEvent({
                logs: firstTradeResult.tradeReceipt!.logs,
                contractName: ContractName.Augur,
                contractType: 'augur-matic',
                eventName: 'ShareTokenBalanceChanged'
              }, {
                account: bob.address,
                market: market.address,
                outcome: YES_OUTCOME
              })
            })

            it('should claim shares', async function() {
              await this.augurPredicate.other.claimShareBalance(buildReferenceTxPayload(bobExit))
            })

            it('Bob should have correct market outcome balance', async function() {
              await assertTokenBalances(bobExitShareToken, market.rootMarket.address, bob.address, [0, 0, firstOrderFilledAmount])
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
        orderFiller: [firstOrderFilledAmount - secondOrderAmount, 0, firstOrderFilledAmount - secondOrderAmount]
      },
      expectedCashDelta: {
        orderCreator: (secondOrderAmount * secondOrderSharePrice) * (1 - MAX_FEE),
        orderFiller: -(secondOrderAmount * secondOrderSharePrice) * (1-MAX_FEE)
      },
      order: async () => secondOrder
    })
  })

  describe('when Bob exits', function() {
    describe('when market is not finalized', function() {
      let beforeOIBalancePredicate: BigNumber
      before(async function() {
        bobExitCashBalanceBeforeExit = await bobExitCashToken.balanceOf(bob.address)
      })

      it('should start exit', async function() {
        // otherAccount is starting an exit for 700 shares of outcome 0 and 2 (balance from tests above)
        const exitId = await this.augurPredicate.contract.getExitId(bob.address)
        const exit = await this.augurPredicate.contract.lookupExit(exitId)
  
        await expect(this.augurPredicate.other.startExit())
          .to.emit(this.withdrawManager.contract, 'ExitStarted')
          .withArgs(bob.address, exit.exitPriority.shl(1), this.rootOICash.address, exitId, false)
      })
  
      it('should exit', async function() {
        beforeOIBalancePredicate = await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
    
        await processExits.call(this, this.rootOICash.address)
      })

      it('should have correct shares on ethereum',async function() {
        await assertTokenBalances(this.shareToken.contract, market.rootMarket.address, bob.address, [700, 0, 700])
      })

      it('augur predicate should have correct shares on ethereum', async function() {
        await assertTokenBalances(this.shareToken.contract, market.rootMarket.address, this.augurPredicate.address, [0, 700, 0])
      })

      it('augur predicate should have correct OICash balance on ethereum', async function() {
        expect(
          await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
        ).to.be.eq(beforeOIBalancePredicate.sub(bobExitCashBalanceBeforeExit).sub(700 * 100)) // predicate bought 700 complete sets
      })
    })
  })

  describe('when Alice exits', function() {
    let aliceExitId: BigNumber

    describe('when market is not finalized', function() {
      it('should start exit', async function() {
        const { exitShareToken } = await initializeAugurPredicateExit.call(this, alice)
        await this.augurPredicate.from.claimShareBalanceFaucet(alice.address, market.address, 1, 700)
        await assertTokenBalances(exitShareToken, market.rootMarket.address, alice.address, [0, 700, 0])
  
        const exitId = await this.augurPredicate.contract.getExitId(alice.address)
        const exit = await this.augurPredicate.contract.lookupExit(exitId)
        aliceExitId = exitId
  
        await expect(this.augurPredicate.from.startExit())
          .to.emit(this.withdrawManager.contract, 'ExitStarted')
          .withArgs(alice.address, exit.exitPriority.shl(1), this.rootOICash.address, exitId, false)
      })
    })

    describe('when market is finalized', function() {
      let beforeOIBalancePredicate: BigNumber
      let beforeCashBalance: BigNumber

      before('Finalize market and process exits', async function() {
        // Note that OICash balance for predicate will not be affected
        // Predicate will redeem the winning shares, have it deposited directly to OICash and then withdraw that OICash
        await finalizeMarket.call(this, market.rootMarket.connect(alice))

        beforeOIBalancePredicate = await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
        beforeCashBalance = await this.cash.contract.balanceOf(alice.address)

        await processExits.call(this, this.rootOICash.address)
      })

      it('exit should be finalized', async function() {
        const exit = await this.augurPredicate.contract.lookupExit(aliceExitId)
        expect(
          exit.status
        ).to.be.eq(4) // ExitStatus.Finalized
      })

      it('Alice must have 0 shares for all outcomes on ethereum', async function() {
        await assertTokenBalances(this.shareToken.contract, market.rootMarket.address, alice.address, [0, 0, 0])
      })

      it('augur predicate must have 0 shares for all outcomes on ethereum', async function() {
        await assertTokenBalances(this.shareToken.contract, market.rootMarket.address, this.augurPredicate.address, [0, 0, 0])
      })

      it('Alice must have correct cash balance on ethereum',async function() {
        expect(
          await this.cash.contract.balanceOf(alice.address)
        ).to.be.eq(beforeCashBalance.add(700 * 100))
      })

      it('augur predicate ethereum cash balance must stay unchanged', async function() {
        expect(
          await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
        ).to.be.eq(beforeOIBalancePredicate)
      })
    })
  })
})
