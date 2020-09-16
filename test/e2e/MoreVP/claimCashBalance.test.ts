import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { toBuffer } from 'ethereumjs-util'
import { BigNumber, utils } from 'ethers'

import { ContractName } from 'src/types'
import { EthWallets, MaticWallets } from '../../shared/wallets'

import { AUGUR_FEE, MATIC_CHAIN_ID } from 'src/constants'
import { createOrder } from '../../shared/orders'
import { buildReferenceTxPayload } from '@maticnetwork/plasma'
import { deployAndPrepareTrading, approveAllForCashAndShareTokens, initializeAugurPredicateExit } from './setup'
import { createMarket } from '../../shared/setup'
import { indexOfEvent } from '../../shared/events'
import { assertTokenBalances } from '../../shared/assert'
import { processExits } from '../../shared/exits'
import { Market } from 'typechain/augur/Market'

use(solidity)

describe('AugurPredicate: Claim Share Balance', function() {
  const [from, otherFrom] = EthWallets
  const [maticFrom, maticOtherFrom] = MaticWallets
  const tradeGroupId = utils.hexZeroPad(utils.hexValue(42), 32)
  const validatorWallets = EthWallets.map(x => {
    return { address: x.address, privateKey: toBuffer(x.privateKey) }
  })

  let exitCashBalance: BigNumber
  let rootMarket: Market

  before(deployAndPrepareTrading)

  describe('should trade', function() {
    it('trade', async function() {
      const { currentTime, numTicks, address: marketAddress, rootMarket: _rootMarket } = await createMarket.call(this)
      rootMarket = _rootMarket

      let orderAmount = 1000; 
      let sharePrice = 60
      const fillAmount = 1200

      const creatorCost = orderAmount * sharePrice
      const fillerCost = fillAmount * (numTicks - sharePrice)

      const fromBalance = await this.maticCash.contract.balanceOf(maticFrom.address)
      const otherBalance = await this.maticCash.contract.balanceOf(maticOtherFrom.address)

      expect(fromBalance).to.be.gte(creatorCost, 'Creator has insufficient balance')
      expect(otherBalance).to.be.gte(fillerCost, 'Filler has insufficient balance')

      await approveAllForCashAndShareTokens('augur-matic')

      let { orders, signatures, affiliateAddress } = await createOrder.call(
        this, 
        { 
          marketAddress, 
          amount: orderAmount, 
          price: sharePrice, 
          currentTime, 
          outcome: 1 /* Yes */, 
          direction: 0 /* Bid */ 
        }, 
        'augur-matic', 
        maticFrom
      )

      let amountRemaining = await this.maticZeroXTrade.other.callStatic.trade(fillAmount, affiliateAddress, tradeGroupId, orders, signatures, { value: AUGUR_FEE })
      expect(amountRemaining).to.be.equal(fillAmount - orderAmount)
      const tradeTx = await this.maticZeroXTrade.other.trade(fillAmount, affiliateAddress, tradeGroupId, orders, signatures, { value: AUGUR_FEE })
      const tradeReceipt = await tradeTx.wait(0)

      // outcome shares balances should be correct
      const filledAmount = Math.min(orderAmount, fillAmount)
      expect(
        await this.maticShareToken.contract.balanceOfMarketOutcome(marketAddress, 1, maticFrom.address)
      ).to.be.equal(filledAmount)

      expect(
        await this.maticShareToken.contract.balanceOfMarketOutcome(marketAddress, 0, maticOtherFrom.address)
      ).to.be.equal(filledAmount)

      expect(
        await this.maticCash.contract.balanceOf(maticFrom.address)
      ).to.be.equal(fromBalance.sub(filledAmount * sharePrice))

      expect(
        await this.maticCash.contract.balanceOf(maticOtherFrom.address)
      ).to.be.equal(otherBalance.sub(filledAmount * (numTicks - sharePrice)))

      // sell shares
      orderAmount = 300, sharePrice = 70
      const _orders = []; 
      const _signatures = []
      ;(
        { orders, signatures, affiliateAddress } = await createOrder.call(
          this,
          { 
            marketAddress, 
            amount: orderAmount, 
            price: sharePrice, 
            currentTime, 
            outcome: 1 /* Yes */, 
            direction: 1 /* Ask */ 
          },
          'augur-matic',
          maticFrom
        )
      )
      _orders.push(orders[0])
      _signatures.push(signatures[0])

      // The following trade was created, however the filler was being censored, so they seek consolation from the predicate
      const txObj = {
        gasLimit: 5000000,
        gasPrice: 1,
        to: this.maticZeroXTrade.address,
        value: AUGUR_FEE,
        chainId: MATIC_CHAIN_ID,
        nonce: await maticOtherFrom.getTransactionCount(),
        data: this.maticZeroXTrade.contract.interface.encodeFunctionData('trade', [orderAmount, affiliateAddress, tradeGroupId, _orders, _signatures])
      }

      this.inFlightTrade = await otherFrom.signTransaction(txObj)

      // // 1. Initialize exit
      await this.augurPredicate.other.clearExit(otherFrom.address)
      const { exitShareToken, exitCashToken } = await initializeAugurPredicateExit.call(this, otherFrom)

      // 2. Provide proof of self and counterparty share balance
      let input = await this.checkpointHelper.submitCheckpoint(validatorWallets, tradeReceipt.transactionHash, from.address)
      // Proof of balance of counterparty having shares of outcome 1
      input.logIndex = indexOfEvent({
        logs: tradeReceipt.logs,
        contractName: ContractName.Augur,
        contractType: 'augur-matic',
        eventName: 'ShareTokenBalanceChanged'
      }, {
        account: from.address,
        market: marketAddress,
        outcome: 1
      })
      await this.augurPredicate.other.claimShareBalance(buildReferenceTxPayload(input))

      expect(
        await exitShareToken.balanceOfMarketOutcome(rootMarket.address, 1, from.address)
      ).to.be.equal(filledAmount)
      // 3. Proof of exitor's cash balance
      const transfer = await this.maticCash.other.transfer('0x0000000000000000000000000000000000000001', 0)
      const receipt = await transfer.wait(0)
      input = await this.checkpointHelper.submitCheckpoint(validatorWallets, receipt.transactionHash, from.address)
      input.logIndex = indexOfEvent({
        logs: receipt.logs,
        contractName: ContractName.Cash,
        contractType: 'augur-matic',
        eventName: 'LogTransfer'
      })
      await this.augurPredicate.other.claimCashBalance(buildReferenceTxPayload(input), otherFrom.address)

      const previousExitCashBalance = await exitCashToken.balanceOf(otherFrom.address)
      expect(previousExitCashBalance)
        .to.be.equal(await this.maticCash.contract.balanceOf(otherFrom.address))

      await this.augurPredicate.other.executeInFlightTransaction(this.inFlightTrade, { value: AUGUR_FEE })
      // assert that balances were reflected on chain
      await assertTokenBalances(exitShareToken, rootMarket.address, from.address, [0, filledAmount - orderAmount, 0])
      await assertTokenBalances(exitShareToken, rootMarket.address, otherFrom.address, [0, orderAmount, 0])

      exitCashBalance = await exitCashToken.balanceOf(otherFrom.address)

      expect(exitCashBalance).to.be.eq(previousExitCashBalance.sub(orderAmount * sharePrice))
    })

    it('startExit (otherAccount)', async function() {
      // otherAccount is starting an exit for 700 shares of outcome 0 and 2 (balance from tests above)
      const exitId = await this.augurPredicate.contract.getExitId(otherFrom.address)
      const exit = await this.augurPredicate.contract.lookupExit(exitId)
      await expect(this.augurPredicate.other.startExit())
        .to.emit(this.withdrawManager.contract, 'ExitStarted')
        .withArgs(otherFrom.address, exit.exitPriority.shl(1), this.rootOICash.address, exitId, false)
    })

    it('onFinalizeExit (calls processExitForMarket)', async function() {
      const beforeOIBalancePredicate = await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
      expect(
        await this.cash.contract.balanceOf(otherFrom.address)
      ).to.be.eq(0)

      await processExits.call(this, this.rootOICash.address)
        
      await assertTokenBalances(this.shareToken.contract, rootMarket.address, otherFrom.address, [0, 300, 0])
      await assertTokenBalances(this.shareToken.contract, rootMarket.address, this.augurPredicate.address, [300, 0, 300])

      // predicate bought 300 complete sets
      expect(
        await this.rootOICash.contract.balanceOf(this.augurPredicate.address)
      ).to.be.eq(beforeOIBalancePredicate.sub(exitCashBalance).sub(300 * 100))

      expect(
        await this.cash.contract.balanceOf(otherFrom.address)
      ).to.be.gt(exitCashBalance.sub(100))
    })
  })
})
