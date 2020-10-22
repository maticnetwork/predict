import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber, ContractReceipt } from 'ethers'

import { ContractName } from 'src/types'
import { EthWallets, MaticWallets } from 'src/wallets'

import { ASK_ORDER, AUGUR_FEE, BID_ORDER, DEFAULT_GAS, DEFAULT_TRADE_GROUP, MATIC_CHAIN_ID, VALIDATORS, NO_OUTCOME, INVALID_OUTCOME } from 'src/constants'
import { createOrder, Order } from 'src/orders'
import { buildReferenceTxPayload, ExitPayload, buildChallengeData } from '@maticnetwork/plasma'
import { deployAndPrepareTrading, initializeAugurPredicateExit, MarketInfo, createMarket } from 'src/setup'

import { indexOfEvent } from 'src/events'
import { assertTokenBalances } from 'src/assert'
import { ShareToken } from 'typechain/augur/ShareToken'
import { Cash } from 'typechain/augur/Cash'

import { shouldExecuteTrade, TradeReturnValues } from '../../behaviors/shouldExecuteTrade'
import { shouldExecuteCensoredTrade } from '../../behaviors/shouldExecuteCensoredTrade'
import { Context } from 'mocha'
import { MaticProvider } from 'src/providers'

use(solidity)

describe('AugurPredicate: Deprecation', function() {
  const [alice, bob] = EthWallets
  const [aliceMatic, bobMatic] = MaticWallets
  const tradeGroupId = DEFAULT_TRADE_GROUP
  let secondOrder: Order

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
    const secondOrderAmount = 300
    const secondOrderSharePrice = 30

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
      let bobExit: ExitPayload

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
              // TODO makes no sense for Bob to claim shares for Alice
              await this.augurPredicate.other.claimShareBalance(buildReferenceTxPayload(bobExit))
            })

            it('Alice should have correct market outcome balance', async function() {
              await assertTokenBalances(bobExitShareToken, market.rootMarket.address, alice.address, [0, firstOrderFilledAmount, 0])
            })
          })

          describe('when Bob claims his cash', function() {
            describe('when Bob performed cash transfer', function() {
              let receipt: ContractReceipt

              before('Transfer', async function() {
                // dummy transfer to build a proof of funds
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
        orderCreator: [0, firstOrderFilledAmount - secondOrderAmount, 0],
        orderFiller: [firstOrderFilledAmount, secondOrderAmount, 0]
      },
      expectedCashDelta: {
        orderCreator: secondOrderAmount * secondOrderSharePrice,
        // must use market.numTicks but in this case it is always 100
        // read https://augur.gitbook.io/augur/contracts/overview#creation-parameters Num Ticks (Scalar Only)
        orderFiller: -(secondOrderAmount * (100 - secondOrderSharePrice))
      },
      order: async() => secondOrder
    })
  })

  describe('when Alice exits', function() {
    let exitShareToken: ShareToken

    it('should initialize augur predicate exit', async function() {
      ({ exitShareToken } = await initializeAugurPredicateExit.call(this, alice))
      await this.augurPredicate.from.claimShareBalanceFaucet(alice.address, market.address, NO_OUTCOME, 700)
      await assertTokenBalances(exitShareToken, market.rootMarket.address, alice.address, [0, 700, 0])

      // obtain exit id here, because it changes with each claim
      const exitId = await this.augurPredicate.contract.getExitId(alice.address)
      const exit = await this.augurPredicate.contract.lookupExit(exitId)
      aliceExitId = exit.exitPriority.shl(1)
    })

    it('should start exit', async function() {
      const exitId = await this.augurPredicate.contract.getExitId(alice.address)

      await expect(this.augurPredicate.from.startExit())
        .to.emit(this.withdrawManager.contract, 'ExitStarted')
        .withArgs(alice.address, aliceExitId, this.oiCash.address, exitId, false)
    })
  })

  describe('when Bob exits', function() {
    it('should start exit', async function() {
      const exitId = await this.augurPredicate.contract.getExitId(bob.address)
      const exit = await this.augurPredicate.contract.lookupExit(exitId)
      bobExitId = exit.exitPriority.shl(1)

      await expect(this.augurPredicate.other.startExit())
        .to.emit(this.withdrawManager.contract, 'ExitStarted')
        .withArgs(bob.address, bobExitId, this.oiCash.address, exitId, false)
    })
  })

  describe('when Bob executes trades 1 more time', function() {
    let challengedExit: ExitPayload

    before('Bob trades 1 more time', async function() {
      // use raw transaction creation, due to ganache using default chainId 1337
      const txObj = {
        gasLimit: DEFAULT_GAS,
        gasPrice: 0,
        to: this.maticZeroXTrade.contract.address,
        value: AUGUR_FEE,
        chainId: MATIC_CHAIN_ID,
        nonce: await bobMatic.getTransactionCount(),
        data: this.maticZeroXTrade.contract.interface.encodeFunctionData('trade',
          [100, '0x0', tradeGroupId, 0, 100, secondOrder.orders, secondOrder.signatures]
        )
      }

      const tx = await bobMatic.signTransaction(txObj)
      const receipt = await (await MaticProvider.sendTransaction(tx)).wait(0)
      challengedExit = await this.checkpointHelper.submitCheckpoint(VALIDATORS, receipt.transactionHash, alice.address)
      challengedExit.logIndex = 0 // this is the index of the order signed by the exitor whose exit is being challenged
    })

    it('Alice should challenge Bob\'s exit', async function() {
      const challengeData = buildChallengeData(challengedExit)
      await expect(
        this.withdrawManager.from.challengeExit(bobExitId, 0, challengeData, this.augurPredicate.address)
      )
        .to.emit(this.withdrawManager.contract, 'ExitCancelled')
        .withArgs(bobExitId)
    })

    it('Alice should challenge own exit', async function() {
      const challengeData = buildChallengeData(challengedExit)
      await expect(
        this.withdrawManager.from.challengeExit(aliceExitId, 0, challengeData, this.augurPredicate.address)
      )
        .to.emit(this.withdrawManager.contract, 'ExitCancelled')
        .withArgs(aliceExitId)
    })
  })
})
