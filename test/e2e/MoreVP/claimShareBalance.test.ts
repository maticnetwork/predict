import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { toBuffer } from 'ethereumjs-util'
import { BigNumber, ContractReceipt, utils } from 'ethers'

import { ContractName } from 'src/types'
import { EthWallets, MaticWallets } from '../../shared/wallets'

import { AUGUR_FEE, MATIC_CHAIN_ID } from 'src/constants'
import { createOrder, Order } from '../../shared/orders'
import { buildReferenceTxPayload, ExitPayload } from '@maticnetwork/plasma'
import { deployAndPrepareTrading, approveAllForCashAndShareTokens, initializeAugurPredicateExit } from './setup'
import { createMarket } from '../../shared/setup'
import { indexOfEvent } from '../../shared/events'
import { assertTokenBalances } from '../../shared/assert'
import { processExits, finalizeMarket } from '../../shared/exits'
import { Market } from 'typechain/augur/Market'
import { ShareToken } from 'typechain/augur/ShareToken'
import { Cash } from 'typechain/augur/Cash'

use(solidity)

describe('AugurPredicate: Claim Share Balance', function() {
  const [from, otherFrom] = EthWallets
  const [maticFrom, maticOtherFrom] = MaticWallets
  const tradeGroupId = utils.hexZeroPad(utils.hexValue(42), 32)
  const validatorWallets = EthWallets.map(x => {
    return { address: x.address, privateKey: toBuffer(x.privateKey) }
  })

  let bobExitCashBalanceBeforeExit: BigNumber
  let rootMarket: Market
  let childMarketAddress: string
  let currentTime: number
  let numTicks: number

  let aliceInitialBalance: BigNumber
  let bobInitialBalance: BigNumber

  before(deployAndPrepareTrading)

  describe('Alice and Bob trade', function() {
    let orderAmount = 1000; 
    let sharePrice = 60
    const fillAmount = 1200
    let tradeReceipt: ContractReceipt
    const filledAmount = Math.min(orderAmount, fillAmount)

    before('Prepare trading', async function() {
      const { currentTime: _currentTime, numTicks: _numTicks, address: marketAddress, rootMarket: _rootMarket } = await createMarket.call(this)

      childMarketAddress = marketAddress
      rootMarket = _rootMarket
      currentTime = _currentTime
      numTicks = _numTicks

      aliceInitialBalance = await this.maticCash.contract.balanceOf(maticFrom.address)
      bobInitialBalance = await this.maticCash.contract.balanceOf(maticOtherFrom.address)

      await approveAllForCashAndShareTokens('augur-matic')
    })

    describe('Bob fills the first order', function() {
      let order: Order

      before(async function() {
        order = await createOrder.call(
          this, 
          { 
            marketAddress: childMarketAddress, 
            amount: orderAmount, 
            price: sharePrice, 
            currentTime, 
            outcome: 1 /* Yes */, 
            direction: 0 /* Bid */ 
          }, 
          'augur-matic', 
          maticFrom
        )
      })

      it('should trade', async function() {
        const { affiliateAddress, orders, signatures } = order
        let amountRemaining = await this.maticZeroXTrade.other.callStatic.trade(fillAmount, affiliateAddress, tradeGroupId, orders, signatures, { value: AUGUR_FEE })
        expect(amountRemaining).to.be.equal(fillAmount - orderAmount)

        const tradeTx = await this.maticZeroXTrade.other.trade(fillAmount, affiliateAddress, tradeGroupId, orders, signatures, { value: AUGUR_FEE })
        tradeReceipt = await tradeTx.wait(0)
      })

      it('Alice must have correct market balance outcome', async function() {
        expect(
          await this.maticShareToken.contract.balanceOfMarketOutcome(childMarketAddress, 1, maticFrom.address)
        ).to.be.equal(filledAmount)
      })

      it('Alice must have correct cash balance', async function() {
        expect(
          await this.maticCash.contract.balanceOf(maticFrom.address)
        ).to.be.equal(aliceInitialBalance.sub(filledAmount * sharePrice))
      })

      it('Bob must have correct market balance outcome', async function() {
        expect(
          await this.maticShareToken.contract.balanceOfMarketOutcome(childMarketAddress, 0, maticOtherFrom.address)
        ).to.be.equal(filledAmount)
      })

      it('Bob must have correct cash balance', async function() {
        expect(
          await this.maticCash.contract.balanceOf(maticOtherFrom.address)
        ).to.be.equal(bobInitialBalance.sub(filledAmount * (numTicks - sharePrice)))
      })
    })

    describe('Bob is trying to fill second order but being censored', function() {
      let inFlightTrade: string
      let bobExit: ExitPayload
      let bobExitShareToken: ShareToken
      let bobExitCashToken: Cash

      before('Alice creates order and Bob signs the transaction', async function() {
        orderAmount = 300, sharePrice = 70

        const { affiliateAddress, orders, signatures } = await createOrder.call(
          this,
          { 
            marketAddress: childMarketAddress, 
            amount: orderAmount, 
            price: sharePrice, 
            currentTime, 
            outcome: 1 /* Yes */, 
            direction: 1 /* Ask */ 
          },
          'augur-matic',
          maticFrom
        )

        const txObj = {
          gasLimit: 5000000,
          gasPrice: 1,
          to: this.maticZeroXTrade.contract.address,
          value: AUGUR_FEE,
          chainId: MATIC_CHAIN_ID,
          nonce: await maticOtherFrom.getTransactionCount(),
          data: this.maticZeroXTrade.contract.interface.encodeFunctionData('trade', [orderAmount, affiliateAddress, tradeGroupId, orders, signatures])
        }
  
        inFlightTrade = await otherFrom.signTransaction(txObj)
      })

      describe('when Alice and Bob claims their shares', function() {
        describe('when Bob initializes exit from the last uncensored trade', function() {
          before('Initialize exit', async function() {
            await this.augurPredicate.other.clearExit(otherFrom.address)
            const contracts = await initializeAugurPredicateExit.call(this, otherFrom)
            bobExitCashToken = contracts.exitCashToken
            bobExitShareToken = contracts.exitShareToken
  
            bobExit = await this.checkpointHelper.submitCheckpoint(validatorWallets, tradeReceipt.transactionHash, from.address)
          })

          after(async function() {
            // @discuss Do we expect a counterparty to have "Invalid shares" as well - to go short on an outcome...?
            await this.augurPredicate.other.claimShareBalanceFaucet(otherFrom.address, childMarketAddress, 2, filledAmount)
          })

          describe('when Bob claims his shares', function() {
            describe('when provide proof of Alice balance', function() {
              before('provide proof of counterparty balance', function() {
                bobExit.logIndex = indexOfEvent({
                  logs: tradeReceipt.logs,
                  contractName: ContractName.Augur,
                  contractType: 'augur-matic',
                  eventName: 'ShareTokenBalanceChanged'
                }, {
                  account: from.address,
                  market: childMarketAddress,
                  outcome: 1
                })
              })
  
              it('should claim shares', async function() {
                await this.augurPredicate.other.claimShareBalance(buildReferenceTxPayload(bobExit))
              })
  
              it('Alice should have correct market outcome balance', async function() {
                expect(
                  await bobExitShareToken.balanceOfMarketOutcome(rootMarket.address, 1, from.address)
                ).to.be.equal(filledAmount)
              })
            })

            describe('when provide proof of his own balance', function() {
              before('provide proof of the own balance', function() {
                bobExit.logIndex = indexOfEvent({
                  logs: tradeReceipt.logs,
                  contractName: ContractName.Augur,
                  contractType: 'augur-matic',
                  eventName: 'ShareTokenBalanceChanged'
                }, {
                  account: otherFrom.address,
                  market: childMarketAddress,
                  outcome: 0
                })
              })
  
              it('should claim shares', async function() {
                await this.augurPredicate.other.claimShareBalance(buildReferenceTxPayload(bobExit))
              })
  
              it('Bob should have correct market outcome balance', async function() {
                expect(
                  await bobExitShareToken.balanceOfMarketOutcome(rootMarket.address, 0, otherFrom.address)
                ).to.be.equal(filledAmount)
              })
            })
          })
        })
      })

      describe('when Bob executes censored trade', function() {
        after(async function() {
          bobExitCashBalanceBeforeExit = await bobExitCashToken.balanceOf(otherFrom.address)
        })

        it('should trade', async function() {
          await this.augurPredicate.other.executeInFlightTransaction(inFlightTrade, { value: AUGUR_FEE })
        })

        it('Alice should have correct market balance outcome', async function() {
          expect(
            await bobExitShareToken.balanceOfMarketOutcome(rootMarket.address, 1, from.address),
          ).to.be.eq(filledAmount - orderAmount)
        })

        it('Alice should have correct cash balance', async function() {
          expect(
            await bobExitCashToken.balanceOf(from.address)
          ).to.be.gt(20000)
        })

        it('Bob should have correct market balance outcome', async function() {
          expect(
            await bobExitShareToken.balanceOfMarketOutcome(rootMarket.address, 0, otherFrom.address),
          ).to.be.eq(filledAmount - orderAmount)
        })

        it('Bob should have correct cash balance', async function() {
          expect(
            await bobExitCashToken.balanceOf(otherFrom.address)
          ).to.be.gt(8000)
        })
      })
    })
  })

  describe('when Bob exits', function() {
    describe('when market is not finalized', function() {
      let beforeOIBalancePredicate: BigNumber

      it('should start exit', async function() {
        // otherAccount is starting an exit for 700 shares of outcome 0 and 2 (balance from tests above)
        const exitId = await this.augurPredicate.contract.getExitId(otherFrom.address)
        const exit = await this.augurPredicate.contract.lookupExit(exitId)
  
        await expect(this.augurPredicate.other.startExit())
          .to.emit(this.withdrawManager.contract, 'ExitStarted')
          .withArgs(otherFrom.address, exit.exitPriority.shl(1), this.rootOICash.address, exitId, false)
      })
  
      it('should exit', async function() {
        beforeOIBalancePredicate = await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
    
        await processExits.call(this, this.rootOICash.address)
      })

      it('should have correct shares on ethereum',async function() {
        await assertTokenBalances(this.shareToken.contract, rootMarket.address, otherFrom.address, [700, 0, 700])
      })

      it('augur predicate should have correct shares on ethereum', async function() {
        await assertTokenBalances(this.shareToken.contract, rootMarket.address, this.augurPredicate.address, [0, 700, 0])
      })

      it('augur predicate should have correct OICash balance on ethereum', async function() {
        expect(
          await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
        ).to.be.eq(beforeOIBalancePredicate.sub(bobExitCashBalanceBeforeExit).sub(700 * 100)) // predicate bought 700 complete sets
      })
    })
  })

  describe('when Alice exits', function() {
    describe('when market is not finalized', function() {
      it('should start exit', async function() {
        const { exitShareToken, exitCashToken } = await initializeAugurPredicateExit.call(this, from)
        await this.augurPredicate.from.claimShareBalanceFaucet(from.address, childMarketAddress, 1, 700)
        await assertTokenBalances(exitShareToken, rootMarket.address, from.address, [0, 700, 0])
  
        const exitId = await this.augurPredicate.contract.getExitId(from.address)
        const exit = await this.augurPredicate.contract.lookupExit(exitId)
  
        await expect(this.augurPredicate.from.startExit())
          .to.emit(this.withdrawManager.contract, 'ExitStarted')
          .withArgs(from.address, exit.exitPriority.shl(1), this.rootOICash.address, exitId, false)
      })
    })

    describe('when market is finalized', function() {
      let beforeOIBalancePredicate: BigNumber
      let beforeCashBalance: BigNumber

      before('Finalize market and process exits', async function() {
        // Note that OICash balance for predicate will not be affected
        // Predicate will redeem the winning shares, have it deposited directly to OICash and then withdraw that OICash
        await finalizeMarket.call(this, rootMarket.connect(from))

        beforeOIBalancePredicate = await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
        beforeCashBalance = await this.cash.contract.balanceOf(from.address)

        await processExits.call(this, this.rootOICash.address)
      })

      it('Alice must have 0 shares for all outcomes on ethereum', async function() {
        await assertTokenBalances(this.shareToken.contract, rootMarket.address, from.address, [0, 0, 0])
      })

      it('augur predicate must have 0 shares for all outcomes on ethereum', async function() {
        await assertTokenBalances(this.shareToken.contract, rootMarket.address, this.augurPredicate.address, [0, 0, 0])
      })

      it('Alice must have correct cash balance on ethereum',async function() {
        expect(
          await this.cash.contract.balanceOf(from.address)
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
