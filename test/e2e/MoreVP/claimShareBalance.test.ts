import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber, utils } from 'ethers'

import { ContractName } from 'src/types'
import { EthWallets, MaticWallets } from 'src/wallets'

import { ASK_ORDER, BID_ORDER, INVALID_OUTCOME, MAX_FEE, NO_OUTCOME, VALIDATORS, YES_OUTCOME, DEFAULT_RECOMMENDED_TRADE_INTERVAL, DEFAULT_NUM_TICKS } from 'src/constants'
import { createOrder, Order } from 'src/orders'
import { buildReferenceTxPayload, ExitPayload } from '@maticnetwork/plasma'
import { deployAndPrepareTrading, initializeAugurPredicateExit, MarketInfo, createMarket } from 'src/setup'

import { findEvents, indexOfEvent } from 'src/events'
import { assertTokenBalances } from 'src/assert'
import { processExits, finalizeMarket } from 'src/exits'
import { ShareToken } from 'typechain/augur/ShareToken'
import { Cash } from 'typechain/augur/Cash'
import { shouldExecuteTrade, TradeReturnValues } from '../../behaviors/shouldExecuteTrade'
import { Context } from 'mocha'
import { shouldExecuteCensoredTrade } from '../../behaviors/shouldExecuteCensoredTrade'
import { getDeployed } from 'src/deployedContracts'
import { ParaUniverse } from 'typechain/augur/ParaUniverse'

use(solidity)

describe.only('AugurPredicate: Claim Shares Balance', function() {
  const [alice, bob] = EthWallets
  const [aliceMatic, bobMatic] = MaticWallets
  const tradeGroupId = utils.hexZeroPad(utils.hexValue(42), 32)

  const firstOrderAmount = BigNumber.from(1000).mul(DEFAULT_RECOMMENDED_TRADE_INTERVAL)
  const fillAmount = BigNumber.from(1200).mul(DEFAULT_RECOMMENDED_TRADE_INTERVAL)
  const firstOrderFilledAmount = firstOrderAmount
  const secondOrderAmount = BigNumber.from(300).mul(DEFAULT_RECOMMENDED_TRADE_INTERVAL)
  const finalSharesBalance = firstOrderFilledAmount.sub(secondOrderAmount)

  let bobExitCashBalanceBeforeExit: BigNumber
  let market: MarketInfo

  const firstTradeResult: TradeReturnValues = { }
  let bobExitShareToken: ShareToken
  let bobExitCashToken: Cash
  let secondOrder: Order
  let aliceInitialOICashBalance:BigNumber
  let feeDivisor:BigNumber

  before(deployAndPrepareTrading)
  before('Prepare trading', async function() {
    market = await createMarket.call(this)

    const u = await getDeployed(ContractName.ParaUniverse, 'augur-main') as ParaUniverse
    feeDivisor = await u.callStatic.getOrCacheReportingFeeDivisor()

    aliceInitialOICashBalance = await this.cash.contract.balanceOf(alice.address)
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

  describe('Bob is trying to fill second order but has been censored', function() {
    let bobExit: ExitPayload
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

        describe('when Bob claims his shares', function() {
          describe('when provided proof of Alice balance for outcome NO', function() {
            before('provide proof of counterparty balance', function() {
              bobExit.logIndex = indexOfEvent({
                logs: firstTradeResult.tradeReceipt!.logs,
                contractName: ContractName.SideChainAugur,
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
                outcome: INVALID_OUTCOME
              })
            })

            it('should claim shares', async function() {
              await this.augurPredicate.other.claimShareBalance(buildReferenceTxPayload(bobExit))
            })

            it('should faucet shares', async function() {
              await this.augurPredicate.other.claimShareBalanceFaucet(bob.address, market.address, YES_OUTCOME, firstOrderFilledAmount)
            })

            it('Bob should have correct market outcome balance', async function() {
              await assertTokenBalances(bobExitShareToken, market.address, bob.address, [firstOrderFilledAmount, 0, firstOrderFilledAmount])
            })
          })
        })
      })
    })

    shouldExecuteCensoredTrade({
      orderAmount: secondOrderAmount,
      tradeGroupId,
      market: async() => market,
      exitShare: async() => bobExitShareToken,
      exitCash: async() => bobExitCashToken,
      orderCreator: { name: 'Alice', wallet: aliceMatic },
      orderFiller: { name: 'Bob', wallet: bobMatic },
      direction: ASK_ORDER,
      expectedExitShares: {
        orderCreator: [0, finalSharesBalance, 0],
        orderFiller: [finalSharesBalance, 0, finalSharesBalance]
      },
      expectedCashDelta: {
        orderCreator: secondOrderAmount.mul(secondOrderSharePrice).mul(100 - MAX_FEE).div(100),
        orderFiller: secondOrderAmount.mul(secondOrderSharePrice).mul(100 - MAX_FEE).div(100)
      },
      order: async() => secondOrder
    })
  })

  describe('when Bob exits', function() {
    describe('when market is not finalized', function() {
      let beforeOIBalanceDeposit: BigNumber
      let plasmaExitId:BigNumber
      let predicateExitId:BigNumber
      let beforeCashBalance: BigNumber

      before(async function() {
        bobExitCashBalanceBeforeExit = await bobExitCashToken.balanceOf(bob.address)
        beforeCashBalance = await this.cash.contract.balanceOf(bob.address)
      })

      it('should start exit', async function() {
        predicateExitId = await this.augurPredicate.contract.getExitId(bob.address)
        const exit = await this.augurPredicate.contract.lookupExit(predicateExitId)

        plasmaExitId = exit.exitPriority.shl(1)

        await expect(this.augurPredicate.other.startExit())
          .to.emit(this.withdrawManager.contract, 'ExitStarted')
          .withArgs(bob.address, plasmaExitId, this.oiCash.address, predicateExitId, false)
      })

      it('should exit', async function() {
        beforeOIBalanceDeposit = await this.oiCash.contract.balanceOf(this.augurPredicate.address)
        await expect(
          processExits.call(this, this.oiCash.address)
        ).to.emit(this.augurPredicate.contract, 'ExitFinalized')
      })

      it('should have correct shares on ethereum', async function() {
        await assertTokenBalances(this.shareToken.contract, market.address, bob.address, [finalSharesBalance, 0, finalSharesBalance])
      })

      it('should have correct cash balance on ethereum', async function() {
        expect(
          await this.cash.contract.balanceOf(bob.address)
        ).to.be.eq(beforeCashBalance.add(bobExitCashBalanceBeforeExit.sub(bobExitCashBalanceBeforeExit.div(feeDivisor))))
      })

      it('should have correct shares on ethereum', async function() {
        await assertTokenBalances(this.shareToken.contract, market.address, bob.address, [finalSharesBalance, 0, finalSharesBalance])
      })

      it('augur predicate should have correct shares on ethereum', async function() {
        await assertTokenBalances(this.shareToken.contract, market.address, this.augurPredicate.address, [0, finalSharesBalance, 0])
      })

      it('augur predicate should have correct OICash balance on ethereum', async function() {
        expect(
          await this.oiCash.contract.balanceOf(this.augurPredicate.address)
        ).to.be.eq(beforeOIBalanceDeposit.sub(bobExitCashBalanceBeforeExit).sub(finalSharesBalance.mul(DEFAULT_NUM_TICKS)))
      })
    })
  })

  describe('when Alice exits', function() {
    let aliceExitId: BigNumber
    let aliceExitCashBalanceBeforeExit:BigNumber

    describe('when market is not finalized', function() {
      it('should have correct shares on ethereum', async function() {
        await assertTokenBalances(this.shareToken.contract, market.address, alice.address, [0, 0, 0])
      })

      it('should have correct cash on ethereum', async function() {
        expect(
          await this.cash.contract.balanceOf(alice.address)
        ).to.be.eq(aliceInitialOICashBalance)
      })

      it('should start exit', async function() {
        const { exitShareToken, exitCashToken } = await initializeAugurPredicateExit.call(this, alice)
        aliceExitCashBalanceBeforeExit = await exitCashToken.balanceOf(alice.address)

        await this.augurPredicate.from.claimShareBalanceFaucet(alice.address, market.address, 1, finalSharesBalance)
        await assertTokenBalances(exitShareToken, market.address, alice.address, [0, finalSharesBalance, 0])

        const exitId = await this.augurPredicate.contract.getExitId(alice.address)
        const exit = await this.augurPredicate.contract.lookupExit(exitId)
        aliceExitId = exitId

        await expect(this.augurPredicate.from.startExit())
          .to.emit(this.withdrawManager.contract, 'ExitStarted')
          .withArgs(alice.address, exit.exitPriority.shl(1), this.oiCash.address, exitId, false)
      })
    })

    describe('when market is finalized', function() {
      let beforeOIBalanceDeposit: BigNumber

      before('Finalize market and process exits', async function() {
        // Note that OICash balance for predicate will not be affected
        // Predicate will redeem the winning shares, have it deposited directly to OICash and then withdraw that OICash
        await finalizeMarket.call(this, market.rootMarket.connect(alice), NO_OUTCOME)

        await assertTokenBalances(this.shareToken.contract, market.address, alice.address, [0, 0, 0])

        beforeOIBalanceDeposit = await this.oiCash.contract.balanceOf(this.augurPredicate.address)

        await processExits.call(this, this.oiCash.address)
      })

      it('exit should be finalized', async function() {
        const exit = await this.augurPredicate.contract.lookupExit(aliceExitId)
        expect(
          exit.status
        ).to.be.eq(4) // ExitStatus.Finalized
      })

      it('Alice should have 0 shares for all outcomes on ethereum', async function() {
        await assertTokenBalances(this.shareToken.contract, market.address, alice.address, [0, 0, 0])
      })

      it('augur predicate should have 0 shares for all outcomes on ethereum', async function() {
        await assertTokenBalances(this.shareToken.contract, market.address, this.augurPredicate.address, [0, 0, 0])
      })

      it('Alice should have correct cash balance on ethereum', async function() {
        let exitCashExited = BigNumber.from(0)
        if (aliceExitCashBalanceBeforeExit.gt(0)) {
          exitCashExited = aliceExitCashBalanceBeforeExit.sub(aliceExitCashBalanceBeforeExit.div(feeDivisor))
        }

        expect(
          await this.cash.contract.balanceOf(alice.address)
        ).to.be.eq(aliceInitialOICashBalance.add(exitCashExited).add(finalSharesBalance.sub(finalSharesBalance.div(feeDivisor)).mul(DEFAULT_NUM_TICKS)))
      })

      it('augur predicate OICash balance must stay unchanged', async function() {
        expect(
          await this.oiCash.contract.balanceOf(this.augurPredicate.address)
        ).to.be.eq(beforeOIBalanceDeposit)
      })
    })
  })
})
