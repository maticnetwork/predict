import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber } from 'ethers'

import { ContractName } from 'src/types'
import { EthWallets, MaticWallets } from 'src/wallets'

import { BID_ORDER, MAX_FEE, VALIDATORS, YES_OUTCOME, DEFAULT_RECOMMENDED_TRADE_INTERVAL, DEFAULT_NUM_TICKS, EMPTY_BYTES, ASK_ORDER, NO_OUTCOME, TRADE_GROUP_ID } from 'src/constants'
import { createOrder, Order } from 'src/orders'
import { buildChallengeData, ExitPayload } from '@maticnetwork/plasma'
import { MarketInfo } from 'src/setup'

import { findEvents } from 'src/events'
import { assertTokenBalances } from 'src/assert'
import { processExits, prepareInFlightTradeExit, startInFlightSharesAndCashExit } from 'src/exits'
import { shouldExecuteTrade, TradeReturnValues } from '../../behaviors/shouldExecuteTrade'
import { shouldExecuteCensoredTrade } from '../../behaviors/shouldExecuteCensoredTrade'
import { createContract, getAddress, getDeployed } from 'src/deployedContracts'
import { ParaUniverse } from 'typechain/augur/ParaUniverse'

use(solidity)

export function deprecation(firstTradeResultGetter: ()=>TradeReturnValues, marketGetter: ()=>MarketInfo, afterAllCall: ()=>Promise<void>): void {
  describe('Deprecation', function() {
    const [alice, bob] = EthWallets
    const [aliceMatic, bobMatic] = MaticWallets

    const firstOrderAmount = BigNumber.from(1000).mul(DEFAULT_RECOMMENDED_TRADE_INTERVAL)
    const firstOrderFilledAmount = firstOrderAmount

    const secondOrderAmount = BigNumber.from(300).mul(DEFAULT_RECOMMENDED_TRADE_INTERVAL)
    const finalSharesBalance = firstOrderFilledAmount.sub(secondOrderAmount)

    let secondOrder: Order
    let feeDivisor:BigNumber

    let firstTradeResult: TradeReturnValues
    const deprecationTradeResult: TradeReturnValues = {}
    let market: MarketInfo

    before(async function() {
      firstTradeResult = firstTradeResultGetter()
      market = marketGetter()

      const u = await getDeployed(ContractName.ParaUniverse, 'augur-main') as ParaUniverse
      feeDivisor = await u.callStatic.getOrCacheReportingFeeDivisor()
    })

    // after(afterAllCall)

    describe('Bob is trying to fill second order but has been censored', function() {
      let bobExit: ExitPayload
      const secondOrderSharePrice = 1

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

      describe('when market is not finalized', function() {
        describe('when Bob starts in-flight trade exit', function() {
          before(async function() {
            bobExit = await this.checkpointHelper.submitCheckpoint(VALIDATORS, firstTradeResult.tradeReceipt!.transactionHash, alice.address)
          })

          it('should prepare exit by claiming his own shares', async function() {
            await prepareInFlightTradeExit.call(
              this,
              bobExit,
              firstTradeResult.tradeReceipt!.logs,
              bob,
              market.rootMarket
            )
          })

          it('Bob should have correct market outcome balance', async function() {
            await assertTokenBalances(this.exitShareToken.contract, market.address, bob.address, [firstOrderFilledAmount, 0, firstOrderFilledAmount])
          })

          describe('when Bob start exit by claiming Alice shares and cash, and executing in-flight trade', async function() {
            shouldExecuteCensoredTrade({
              orderAmount: secondOrderAmount,
              tradeGroupId: TRADE_GROUP_ID,
              market: async() => market,
              orderCreator: { name: 'Alice', wallet: alice, maticWallet: aliceMatic },
              orderFiller: { name: 'Bob', wallet: bob, maticWallet: bobMatic },
              direction: ASK_ORDER,
              expectedExitShares: {
                orderCreator: [0, finalSharesBalance, 0],
                orderFiller: [finalSharesBalance, 0, finalSharesBalance]
              },
              expectedCashDelta: {
                orderCreator: secondOrderAmount.mul(secondOrderSharePrice).mul(100 - MAX_FEE).div(100),
                orderFiller: secondOrderAmount.mul(secondOrderSharePrice).mul(100 - MAX_FEE).div(100)
              },
              order: async() => secondOrder,
              exitPayload: () => bobExit,
              logs: () => firstTradeResult.tradeReceipt!.logs
            })

            describe('after exit started', function() {
              it('Alice should have correct market outcome balance', async function() {
                await assertTokenBalances(this.exitShareToken.contract, market.address, alice.address, [0, firstOrderFilledAmount.sub(secondOrderAmount), 0])
              })

              it('Alice should not be able to exit with her shares', async function() {
                await expect(
                  startInFlightSharesAndCashExit.call(
                    this,
                    bobExit,
                    firstTradeResult.tradeReceipt!.logs,
                    alice,
                    market.rootMarket,
                    EMPTY_BYTES,
                    EMPTY_BYTES
                  )
                ).to.be.reverted
              })
            })
          })
        })

        shouldExecuteTrade({
          orderAmount: secondOrderAmount,
          sharePrice: secondOrderSharePrice,
          fillAmount: secondOrderAmount,
          returnValues: deprecationTradeResult,
          orderCreator: { name: 'Alice', wallet: alice, maticWallet: aliceMatic },
          orderFiller: { name: 'Bob', wallet: bob, maticWallet: bobMatic },
          tradeGroupId: TRADE_GROUP_ID,
          direction: ASK_ORDER,
          market: async() => market,
          order: async() => secondOrder,
          expectedShares: {
            orderCreator: [0, firstOrderFilledAmount.sub(secondOrderAmount), 0],
            orderFiller: [firstOrderFilledAmount.sub(secondOrderAmount), 0, firstOrderFilledAmount.sub(secondOrderAmount)]
          }
        })

        describe('when somebody challenges Bob\'s exit', function() {
          let challengedExit: ExitPayload
          let bobExitId: BigNumber

          before('deprecated trade is checkpointed', async function() {
            challengedExit = await this.checkpointHelper.submitCheckpoint(
              VALIDATORS, 
              deprecationTradeResult.tradeReceipt!.transactionHash,
              alice.address
            )
            challengedExit.logIndex = 0

            const exitId = await this.augurPredicate.contract.getExitId(bob.address)
            const exit = await this.augurPredicateMain.contract.lookupExit(exitId)
            bobExitId = exit.exitPriority.shl(1)
          })

          it('should challenge exit', async function() {
            const challengeData = buildChallengeData(challengedExit)
            await expect(
              this.withdrawManager.from.challengeExit(bobExitId, 0, challengeData, this.augurPredicate.address)
            )
              .to.emit(this.withdrawManager.contract, 'ExitCancelled')
              .withArgs(bobExitId)
          })
        })

        // describe('when somebody processes the exit', function() {
        //   let predicateBeforeOIBalanceDeposit: BigNumber

        //   let bobBeforeCashBalance: BigNumber
        //   let bobExitCashBalanceBeforeExit: BigNumber

        //   let aliceBeforeCashBalance: BigNumber
        //   let aliceExitCashBalanceBeforeExit: BigNumber

        //   before(async function() {
        //     bobExitCashBalanceBeforeExit = await this.exitCash.contract.balanceOf(bob.address)
        //     bobBeforeCashBalance = await this.cash.contract.balanceOf(bob.address)

        //     aliceExitCashBalanceBeforeExit = await this.exitCash.contract.balanceOf(alice.address)
        //     aliceBeforeCashBalance = await this.cash.contract.balanceOf(alice.address)
        //   })

        //   it('should exit', async function() {
        //     predicateBeforeOIBalanceDeposit = await this.oiCash.contract.balanceOf(this.augurPredicate.address)
        //     const r = processExits.call(this, this.oiCash.address)
        //     const p = await (await r).wait(0)
        //     console.log(JSON.stringify(findEvents({
        //       logs: p.logs,
        //       contractName: ContractName.AugurPredicateMain,
        //       contractType: 'augur-main',
        //       eventName: 'Test'
        //     }), null, 2))
        //     await expect(
        //       r
        //     ).to.emit(
        //       createContract(
        //         await getAddress(ContractName.AugurPredicateMain, 'augur-main'),
        //         ContractName.AugurPredicateMain,
        //         'augur-main'
        //       ),
        //       'ExitFinalized'
        //     )
        //   })

        //   it('Bob should have correct cash balance on ethereum', async function() {
        //     expect(
        //       await this.cash.contract.balanceOf(bob.address)
        //     ).to.be.eq(bobBeforeCashBalance.add(bobExitCashBalanceBeforeExit.sub(bobExitCashBalanceBeforeExit.div(feeDivisor))))
        //   })

        //   it('Alice should have correct cash balance on ethereum', async function() {
        //     expect(
        //       await this.cash.contract.balanceOf(alice.address)
        //     ).to.be.eq(aliceBeforeCashBalance.add(aliceExitCashBalanceBeforeExit.sub(aliceExitCashBalanceBeforeExit.div(feeDivisor))))
        //   })

        //   it('Bob should have correct shares on ethereum', async function() {
        //     await assertTokenBalances(this.shareToken.contract, market.address, bob.address, [finalSharesBalance, 0, finalSharesBalance])
        //   })

        //   it('Alice should have correct shares on ethereum', async function() {
        //     await assertTokenBalances(this.shareToken.contract, market.address, alice.address, [0, finalSharesBalance, 0])
        //   })

        //   it('augur predicate should have correct shares on ethereum', async function() {
        //     await assertTokenBalances(this.shareToken.contract, market.address, this.augurPredicate.address, [0, 0, 0])
        //   })

        //   it('augur predicate should have correct OICash balance on ethereum', async function() {
        //     expect(
        //       await this.oiCash.contract.balanceOf(this.augurPredicate.address)
        //     ).to.be.eq(
        //       predicateBeforeOIBalanceDeposit
        //         .sub(bobExitCashBalanceBeforeExit)
        //         .sub(aliceExitCashBalanceBeforeExit)
        //         .sub(finalSharesBalance.mul(DEFAULT_NUM_TICKS))
        //     )
        //   })
        // })
      })
    })
  })
}
