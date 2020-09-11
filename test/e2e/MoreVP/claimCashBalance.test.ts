import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'

import { AugurPredicate } from 'typechain/AugurPredicate'
import { RootChain } from 'typechain/core/RootChain'
import { Cash } from 'typechain/augur/Cash'
import { Augur } from 'typechain/augur/Augur'
import { TimeControlled } from 'typechain/augur/TimeControlled'

import { deployAll } from '../../shared/deployment/deployer'
import { getDeployed, connectedContract } from 'src/deployedContracts'
import { ContractName, toBN } from 'src/types'
import { EthWallets, MaticWallets } from '../../shared/wallets'
import { EthProvider, MaticProvider } from 'src/providers'
import { RootchainAdapter } from '../../shared/rootChainAdapter'

import { AUGUR_FEE, MATIC_CHAIN_ID } from 'src/constants'
import { createOrder } from '../../shared/orders'
import { utils } from 'ethers'

import { deployAndPrepareTrading, approveAllForCashAndShareTokens, initializeAugurPredicateExit } from './setup'

import { createMarket } from '../../shared/setup'
import { toBuffer } from 'ethereumjs-util'

use(solidity)

describe('AugurPredicate', function() {
  const [from, otherFrom] = EthWallets
  const [maticFrom, maticOtherFrom] = MaticWallets
  const tradeGroupId = utils.hexZeroPad(utils.hexValue(42), 32)
  const validatorWallets = EthWallets.map(x => {
    return { address: x.address, privateKey: toBuffer(x.privateKey) }
  })

  before(deployAndPrepareTrading)

  describe('should trade', function() {
    it('trade', async function() {
      const { currentTime, numTicks, address: marketAddress, rootMarket } = await createMarket.call(this)

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
            currentTime, outcome: 1 /* Yes */, 
            direction: 1 /* Ask */ 
          },
          'matic',
          from
        )
      )
      _orders.push(orders[0])
      _signatures.push(signatures[0])

      // The following trade was created, however the filler was being censored, so they seek consolation from the predicate
      const txObj = {
        gas: 5000000,
        gasPrice: 1,
        to: this.maticZeroXTrade.contract.address,
        value: AUGUR_FEE,
        chainId: MATIC_CHAIN_ID,
        nonce: await maticOtherFrom.getTransactionCount(),
        data: this.maticZeroXTrade.contract.interface.encodeFunctionData('trade', [orderAmount, affiliateAddress, tradeGroupId, _orders, _signatures])
      }

      this.inFlightTrade = await otherFrom.signTransaction(txObj)

      // // 1. Initialize exit
      // await augurPredicate.methods.clearExit(otherAccount).send({ from: otherAccount, gas })
      const { exitShareToken, exitCashToken } = await initializeAugurPredicateExit.call(this, otherFrom)
      const exitId = await this.augurPredicate.contract.getExitId(otherFrom.address)

      // 2. Provide proof of self and counterparty share balance
      let input = await this.checkpointHelper.submitCheckpoint(validatorWallets, tradeReceipt.transactionHash, from.address)
      // Proof of balance of counterparty having shares of outcome 1
      console.log('// Proof of balance of counterparty having shares of outcome 1')
      // input.logIndex = filterShareTokenBalanceChangedEvent(tradeReceipt.logs, from, marketAddress, 1)
      // await augurPredicate.methods.claimShareBalance(buildReferenceTxPayload(input)).send({ from: otherAccount, gas })
      // assert.equal(
      //   await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 1, from).call(),
      //   filledAmount
      // )
      // console.log('// 3. Proof of exitor\'s cash balance')
      // // 3. Proof of exitor's cash balance
      // const transfer = await this.maticCash.methods.transfer('0x0000000000000000000000000000000000000001', 0).send({ from: otherAccount, gas })
      // const receipt = await utils.networks.matic.web3.eth.getTransactionReceipt(transfer.transactionHash)
      // input = await this.statefulUtils.submitCheckpoint(rootChain, receipt.transactionHash, from)
      // input.logIndex = 1 // LogTransfer
      // console.log('claimCashBalance')
      // await augurPredicate.methods.claimCashBalance(buildReferenceTxPayload(input), otherAccount).send({ from: otherAccount, gas })
      // const exitCashBalance = parseInt(await exitCashToken.methods.balanceOf(otherAccount).call())
      // assert.equal(exitCashBalance, await this.maticCash.methods.balanceOf(otherAccount).call())

      // // // Alternatively, can also use the predicate faucet
      // // // const cashFaucetAmount = amount * price
      // // // await augurPredicate.methods.claimCashBalanceFaucet(cashFaucetAmount, otherAccount).send({ from: otherAccount, gas })

      // console.log('executeInFlightTransaction', augurPredicate.options.address)
      // trade = await augurPredicate.methods
      //   .executeInFlightTransaction(this.inFlightTrade)
      //   .send({ from: otherAccount, gas, value: web3.utils.toWei('.01') /* protocol fee */ })
      // // assert that balances were reflected on chain
      // await assertTokenBalances(exitShareToken, this.rootMarket.options.address, from, [0, filledAmount - amount, 0])
      // await assertTokenBalances(exitShareToken, this.rootMarket.options.address, otherAccount, [0, amount, 0])
      // this.exitCashBalance = await exitCashToken.methods.balanceOf(otherAccount).call()
      // assert.equal(this.exitCashBalance, exitCashBalance - amount * price)
    })
  })
})
