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
import { processExits } from '../../shared/exits'

import { Market } from 'typechain/augur/Market'
import { ShareToken } from 'typechain/augur/ShareToken'
import { Cash } from 'typechain/augur/Cash'

use(solidity)

describe.only('AugurPredicate: Claim Share Balance', function() {
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
      let bobExitCashBalanceBeforeInFlightTx: BigNumber

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

            // describe('when provide proof of his own balance', function() {
            //   before('provide proof of the own balance', function() {
            //     bobExit.logIndex = indexOfEvent({
            //       logs: tradeReceipt.logs,
            //       contractName: ContractName.Augur,
            //       contractType: 'augur-matic',
            //       eventName: 'ShareTokenBalanceChanged'
            //     }, {
            //       account: otherFrom.address,
            //       market: childMarketAddress,
            //       outcome: 0
            //     })
            //   })
  
            //   it('should claim shares', async function() {
            //     await this.augurPredicate.other.claimShareBalance(buildReferenceTxPayload(bobExit))
            //   })
  
            //   it('Bob should have correct market outcome balance', async function() {
            //     expect(
            //       await bobExitShareToken.balanceOfMarketOutcome(rootMarket.address, 0, otherFrom.address)
            //     ).to.be.equal(filledAmount)
            //   })
            // })
          })

          describe('when Bob claims his cash', function() {
            describe('when Bob performed cash transfer', function() {
              let receipt: ContractReceipt

              before('', async function() {
                const transfer = await this.maticCash.other.transfer('0x0000000000000000000000000000000000000001', 0)
                receipt = await transfer.wait(0)
  
                bobExit = await this.checkpointHelper.submitCheckpoint(validatorWallets, receipt.transactionHash, from.address)
              })

              it('should claim shares', async function() {
                bobExit.logIndex = indexOfEvent({
                  logs: receipt.logs,
                  contractName: ContractName.Cash,
                  contractType: 'augur-matic',
                  eventName: 'LogTransfer'
                })
                await this.augurPredicate.other.claimCashBalance(buildReferenceTxPayload(bobExit), otherFrom.address)
              })

              it('should have correct exit cash balance', async function() {
                expect(await bobExitCashToken.balanceOf(otherFrom.address))
                  .to.be.equal(await this.maticCash.contract.balanceOf(otherFrom.address))
              })
            })
          })
        })
      })

      describe('when Bob executes censored trade', function() {
        before(async function() {
          bobExitCashBalanceBeforeInFlightTx = await bobExitCashToken.balanceOf(otherFrom.address)
        })

        after(async function() {
          bobExitCashBalanceBeforeExit = await bobExitCashToken.balanceOf(otherFrom.address)
        })

        it('should trade', async function() {
          await this.augurPredicate.other.executeInFlightTransaction(inFlightTrade, { value: AUGUR_FEE })
        })

        it('Alice should have correct market balance outcome', async function() {
          await assertTokenBalances(bobExitShareToken, rootMarket.address, from.address, [0, filledAmount - orderAmount, 0])
        })

        it('Alice should have correct cash balance', async function() {
          expect(
            await bobExitCashToken.balanceOf(from.address)
          ).to.be.gt(20000)
        })

        it('Bob should have correct market balance outcome', async function() {
          await assertTokenBalances(bobExitShareToken, rootMarket.address, otherFrom.address, [0, orderAmount, 0])
        })

        it('Bob should have correct cash balance', async function() {
          expect(
            await bobExitCashToken.balanceOf(otherFrom.address)
          ).to.be.eq(bobExitCashBalanceBeforeInFlightTx.sub(orderAmount * sharePrice))
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

      it('should have 0 cash on ethereum', async function() {
        expect(
          await this.cash.contract.balanceOf(otherFrom.address)
        ).to.be.eq(0)
      })
  
      it('should exit', async function() {
        beforeOIBalancePredicate = await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
    
        await processExits.call(this, this.rootOICash.address)
      })

      it('Bob should have correct market outcome balances', async function() {
        await assertTokenBalances(this.shareToken.contract, rootMarket.address, otherFrom.address, [0, 300, 0])
      })

      it('Bob should have correct OICash balance on ethereum', async function() {
        expect(
          await this.cash.contract.balanceOf(otherFrom.address)
        ).to.be.gt(bobExitCashBalanceBeforeExit.sub(100))
      })

      it('augur predicate should have correct market outcome balances', async function() {
        await assertTokenBalances(this.shareToken.contract, rootMarket.address, this.augurPredicate.address, [300, 0, 300])
      })

      it('augur predicate should have correct OICash balance on ethereum', async function() {
        expect(
          await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
        ).to.be.eq(beforeOIBalancePredicate.sub(bobExitCashBalanceBeforeExit).sub(300 * 100))
      })
    })
  })
})
