import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber, ContractReceipt, utils } from 'ethers'

import { ContractName } from 'src/types'
import { EthWallets, MaticWallets } from 'src/wallets'

import { ASK_ORDER, AUGUR_FEE, BID_ORDER, DEFAULT_GAS, DEFAULT_TRADE_GROUP, MATIC_CHAIN_ID, VALIDATORS } from 'src/constants'
import { createOrder, Order } from 'src/orders'
import { buildReferenceTxPayload, ExitPayload, buildChallengeData } from '@maticnetwork/plasma'
import { deployAndPrepareTrading, approveAllForCashAndShareTokens, initializeAugurPredicateExit, MarketInfo } from 'src/setup'
import { createMarket } from 'src/setup'
import { findEvents, indexOfEvent } from 'src/events'
import { assertTokenBalances } from 'src/assert'
import { processExits, finalizeMarket } from 'src/exits'
import { Market } from 'typechain/augur/Market'
import { ShareToken } from 'typechain/augur/ShareToken'
import { Cash } from 'typechain/augur/Cash'

import { shouldExecuteTrade, TradeReturnValues } from './behaviors/shouldExecuteTrade'
import { shouldExecuteCensoredTrade } from './behaviors/shouldExecuteCensoredTrade'
import { Context } from 'mocha'
import { MaticProvider } from 'src/providers'

use(solidity)

describe.only('AugurPredicate: Deprecation', function() {
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

    await approveAllForCashAndShareTokens('augur-matic')
  })

  shouldExecuteTrade({
    orderAmount: 1000,
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
          amount: 1000, 
          price: 60, 
          currentTime: market.currentTime, 
          outcome: 1,
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
    before('Alice creates order', async function() {
      secondOrder = await createOrder.call(
        this, 
        { 
          marketAddress: market.address, 
          amount: 300, 
          price: 70, 
          currentTime: market.currentTime, 
          outcome: 1,
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
          await this.augurPredicate.other.claimShareBalanceFaucet(bob.address, market.address, 2, firstOrderFilledAmount)
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
                outcome: 1
              })
            })
  
            it('should claim shares', async function() {
              // TODO makes no sense for Bob to claim shares for Alice
              await this.augurPredicate.other.claimShareBalance(buildReferenceTxPayload(bobExit))
            })
  
            it('Alice should have correct market outcome balance', async function() {
              expect(
                await bobExitShareToken.balanceOfMarketOutcome(market.rootMarket.address, 1, alice.address)
              ).to.be.equal(firstOrderFilledAmount)
            })
          })
  
          describe('when Bob claims his cash', function() {
            describe('when Bob performed cash transfer', function() {
              let receipt: ContractReceipt
  
              before('', async function() {
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
      orderAmount: 300,
      sharePrice: 70,
      tradeGroupId,
      market: async () => market,
      exitShare: async () => bobExitShareToken,
      exitCash: async () => bobExitCashToken,
      orderCreator: { name: 'Alice', wallet: aliceMatic },
      orderFiller: { name: 'Bob', wallet: bobMatic },
      outcome: 1,
      direction: ASK_ORDER,
      expectedExitShares: {
        orderCreator: [0, firstOrderFilledAmount - 300, 0],
        orderFiller: [0, 300, firstOrderFilledAmount] // test wrong shares for outcome 2
      },
      order: async () => secondOrder
    })
  })

  describe('when Alice exits', function() {
    let exitShareToken: ShareToken

    it('should initialize augur predicate exit', async function() {
      ({ exitShareToken } = await initializeAugurPredicateExit.call(this, alice))
      await this.augurPredicate.from.claimShareBalanceFaucet(alice.address, market.address, 1, 700)
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
        .withArgs(alice.address, aliceExitId, this.rootOICash.address, exitId, false)
    })
  })

  describe('when Bob exits', function() {
    it('should start exit', async function() {
      const exitId = await this.augurPredicate.contract.getExitId(bob.address)
      const exit = await this.augurPredicate.contract.lookupExit(exitId)
      bobExitId = exit.exitPriority.shl(1)

      await expect(this.augurPredicate.other.startExit())
        .to.emit(this.withdrawManager.contract, 'ExitStarted')
        .withArgs(bob.address, bobExitId, this.rootOICash.address, exitId, false)
    })
  })

  describe('when Bob executes trades 1 more time', function() {
    let challengedExit: ExitPayload

    before('Bob trades 1 more time', async function() {
      // use raw transaction creation, due to ganache using default chainId 1337
      const txObj = {
        gasLimit: 5000000,
        gasPrice: 0,
        to: this.maticZeroXTrade.contract.address,
        value: AUGUR_FEE,
        chainId: MATIC_CHAIN_ID,
        nonce: await bobMatic.getTransactionCount(),
        data: this.maticZeroXTrade.contract.interface.encodeFunctionData('trade', 
          [100, secondOrder.affiliateAddress, tradeGroupId, secondOrder.orders, secondOrder.signatures]
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
