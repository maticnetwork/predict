import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber, ContractReceipt } from 'ethers'

import { ContractName } from 'src/types'
import { EthWallets, MaticWallets } from 'src/wallets'

import { DEFAULT_TRADE_GROUP, BID_ORDER, ASK_ORDER, VALIDATORS, NO_OUTCOME, DEFAULT_RECOMMENDED_TRADE_INTERVAL, DEFAULT_GAS, MATIC_CHAIN_ID, AUGUR_FEE, EMPTY_BYTES, NULL_ADDRESS } from 'src/constants'
import { createOrder, Order } from 'src/orders'
import { buildReferenceTxPayload, ExitPayload } from '@maticnetwork/plasma'
import { deployAndPrepareTrading, initializeAugurPredicateExit, MarketInfo, createMarket } from 'src/setup'

import { indexOfEvent } from 'src/events'
import { assertTokenBalances } from 'src/assert'
import { processExits, ShareAndCashExitType, startInFlightSharesAndCashExit } from 'src/exits'

import { shouldExecuteTrade, TradeReturnValues } from '../../behaviors/shouldExecuteTrade'
import { Context } from 'mocha'
import { revertToSnapShot, takeSnapshot } from 'src/time'
import { zeroAddress } from 'ethereumjs-util'
import { createContract, getAddress, getDeployed } from 'src/deployedContracts'
import { ParaUniverse } from 'typechain/augur/ParaUniverse'

use(solidity)

describe.only('AugurPredicate: In-flight cash and shares exit', function() {
  const [alice, bob] = EthWallets
  const [aliceMatic, bobMatic] = MaticWallets
  const tradeGroupId = DEFAULT_TRADE_GROUP

  const firstOrderAmount = BigNumber.from(1000).mul(DEFAULT_RECOMMENDED_TRADE_INTERVAL)
  const fillAmount = BigNumber.from(1200).mul(DEFAULT_RECOMMENDED_TRADE_INTERVAL)
  const firstOrderFilledAmount = firstOrderAmount

  let market: MarketInfo

  const firstTradeResult: TradeReturnValues = { }
  let self: Context

  before(deployAndPrepareTrading)
  before('Prepare trading', async function() {
    market = await createMarket.call(this)
    self = this
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

  describe('Running scenarios', function() {
    let snapshotIds: [any, any]

    async function resetSnapshot(): Promise<void> {
      await revertToSnapShot(snapshotIds)
      snapshotIds = await takeSnapshot()
      self.checkpointHelper.rollbackState()
    }

    before('Save blockchain state', async function() {
      snapshotIds = await takeSnapshot()
      this.checkpointHelper.saveState()
    })

    describe('Alice is trying to transfer cash to Bob but has been censored', function() {
      const transferAmount = BigNumber.from(10e6)
      let exitPayload: ExitPayload
      let inFlightTransfer: string
      let transferReceipt: ContractReceipt
      let feeDivisor:BigNumber

      after(resetSnapshot)

      before('last checkpoint', async function() {
        const u = await getDeployed(ContractName.ParaUniverse, 'augur-main') as ParaUniverse
        feeDivisor = await u.callStatic.getOrCacheReportingFeeDivisor()

        const transfer = await this.maticCash.contract.connect(aliceMatic).transfer('0x0000000000000000000000000000000000000001', 0)
        transferReceipt = await transfer.wait(0)

        exitPayload = await this.checkpointHelper.submitCheckpoint(VALIDATORS, transferReceipt.transactionHash, alice.address)

        const txObj = {
          gasLimit: DEFAULT_GAS,
          gasPrice: 0,
          to: NULL_ADDRESS,
          value: 0,
          chainId: MATIC_CHAIN_ID,
          nonce: await aliceMatic.getTransactionCount(),
          data: this.maticCash.contract.interface.encodeFunctionData('transfer', [
            bob.address,
            transferAmount
          ])
        }

        inFlightTransfer = await aliceMatic.signTransaction(txObj)
      })

      describe('when Alice exits with in-flight cash', function() {
        it('should start exit', async function() {
          await expect(
            startInFlightSharesAndCashExit.call(
              this,
              exitPayload,
              transferReceipt.logs,
              alice,
              market.rootMarket,
              EMPTY_BYTES,
              inFlightTransfer,
              ShareAndCashExitType.OnlyCash
            )
          ).to.emit(this.withdrawManager.contract, 'ExitStarted')
        })
      })

      describe('when somebody processes the exit', function() {
        let predicateBeforeOIBalanceDeposit: BigNumber

        let bobBeforeCashBalance: BigNumber
        let bobExitCashBalanceBeforeExit: BigNumber

        let aliceBeforeCashBalance: BigNumber
        let aliceExitCashBalanceBeforeExit: BigNumber

        before(async function() {
          bobExitCashBalanceBeforeExit = await this.exitCash.contract.balanceOf(bob.address)
          bobBeforeCashBalance = await this.cash.contract.balanceOf(bob.address)

          aliceExitCashBalanceBeforeExit = await this.exitCash.contract.balanceOf(alice.address)
          aliceBeforeCashBalance = await this.cash.contract.balanceOf(alice.address)

          predicateBeforeOIBalanceDeposit = await this.oiCash.contract.balanceOf(this.augurPredicate.address)
        })

        it('should exit', async function() {
          await expect(
            processExits.call(this, this.oiCash.address)
          ).to.emit(
            createContract(
              await getAddress(ContractName.AugurPredicateMain, 'augur-main'),
              ContractName.AugurPredicateMain,
              'augur-main'
            ),
            'ExitFinalized'
          )
        })

        it('Bob should have correct cash balance on ethereum', async function() {
          expect(
            await this.cash.contract.balanceOf(bob.address)
          ).to.be.eq(bobBeforeCashBalance.add(bobExitCashBalanceBeforeExit.sub(bobExitCashBalanceBeforeExit.div(feeDivisor))))
        })

        it('Alice should have correct cash balance on ethereum', async function() {
          expect(
            await this.cash.contract.balanceOf(alice.address)
          ).to.be.eq(aliceBeforeCashBalance.add(aliceExitCashBalanceBeforeExit.sub(aliceExitCashBalanceBeforeExit.div(feeDivisor))))
        })

        it('Alice should have correct shares on ethereum', async function() {
          await assertTokenBalances(this.shareToken.contract, market.address, alice.address, [0, 0, 0])
        })

        it('augur predicate should have correct shares on ethereum', async function() {
          await assertTokenBalances(this.shareToken.contract, market.address, this.augurPredicate.address, [0, 0, 0])
        })

        it('augur predicate should have correct OICash balance on ethereum', async function() {
          expect(
            await this.oiCash.contract.balanceOf(this.augurPredicate.address)
          ).to.be.eq(
            predicateBeforeOIBalanceDeposit
              .sub(bobExitCashBalanceBeforeExit)
              .sub(aliceExitCashBalanceBeforeExit)
          )
        })
      })
    })
  })
})
