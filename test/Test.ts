import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'

import { AugurPredicate } from 'typechain/AugurPredicate'
import { RootChain } from 'typechain/core/RootChain'
import { Cash } from 'typechain/augur/Cash'
import { Augur } from 'typechain/augur/Augur'
import { TimeControlled } from 'typechain/augur/TimeControlled'
import { deployAll } from './shared/deployment/deployer'
import { getDeployed } from './shared/deployment/deployedContracts'
import { ContractName, toBN } from 'src/types'
import { EthWallets } from './shared/wallets'
import { EthProvider, BorProvider } from 'src/providers'
import { RootchainAdapter } from './shared/rootChainAdapter'
import { connectedContract } from 'src/connectedContract'

import { EthersAdapter } from '@maticnetwork/plasma'
import { CheckpointHelper } from '@maticnetwork/plasma-test-utils'
import { OiCash } from 'typechain/augur/OiCash'

import { shouldDepositCash } from './behaviors/shouldDepositCash'

import { createMarket } from './shared/setup'

use(solidity)

describe('AugurPredicate', function() {
  const [from, otherFrom] = EthWallets
  const amount = 100000

  before(async function() {
    await deployAll()

    this.from = from.address
    this.otherFrom = otherFrom.address

    this.augurPredicate = await connectedContract(await getDeployed(ContractName.AugurPredicate, 'predicate') as AugurPredicate, 'predicate')
    this.rootChain = await getDeployed(ContractName.RootChain, 'plasma') as RootChain
    this.rootOICash = await connectedContract(await getDeployed(ContractName.OICash, 'augur-main') as OiCash, 'augur-main')

    this.checkpointHelper = new CheckpointHelper(new EthersAdapter(EthProvider), new RootchainAdapter(this.rootChain.connect(from)))
    this.cash = await connectedContract(await getDeployed(ContractName.Cash, 'augur-main') as Cash, 'augur-main')
    this.maticCash = await connectedContract(await getDeployed(ContractName.Cash, 'augur-matic') as Cash, 'augur-matic')

    this.time = await connectedContract(await getDeployed(ContractName.Time, 'augur-main') as TimeControlled, 'augur-main')
    this.maticTime = await connectedContract(await getDeployed(ContractName.Time, 'augur-matic') as TimeControlled, 'augur-main')

    this.augur = await connectedContract(await getDeployed(ContractName.Augur, 'augur-main') as Augur, 'augur-main')
    this.maticAugur = await connectedContract(await getDeployed(ContractName.Augur, 'augur-matic') as Augur, 'augur-main')

    await this.cash.from.joinBurn(this.from, await this.cash.contract.balanceOf(this.from))
    await this.cash.other.joinBurn(this.otherFrom, await this.cash.contract.balanceOf(this.otherFrom))
    await this.maticCash.from.joinBurn(this.from, await this.maticCash.contract.balanceOf(this.from))
    await this.maticCash.other.joinBurn(this.otherFrom, await this.maticCash.contract.balanceOf(this.otherFrom))
  })

  shouldDepositCash(amount)

  describe('should trade', function() {
    it('trade', async function() {
      const { currentTime, numTicks, address: marketAddress, rootMarket } = await createMarket.call(this)

      // this.rootMarket = rootMarket
      // this.childMarketAddress = marketAddress

      // const zeroXTrade = utils.artifacts.matic.ZeroXTrade
      // const cash = utils.artifacts.matic.Cash.methods
      // const shareToken = utils.artifacts.matic.ShareToken

      // // do trades on child chain
      // // Make an order for 1000 attoShares
      // let amount = 1000; let price = 60
      // let { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder } = await utils.createOrder(
      //   { marketAddress, amount, price, currentTime, outcome: 1 /* Yes */, direction: 0 /* Bid */ },
      //   'matic',
      //   from
      // )
      // const fillAmount = 1200

      // const creatorCost = amount * price
      // const fillerCost = fillAmount * (numTicks - price)
      // const fromBalance = await cash.balanceOf(from).call()
      // console.log('fromBalance', fromBalance)
      // const otherBalance = await cash.balanceOf(otherAccount).call()
      // assert.ok(fromBalance >= creatorCost, 'Creator has insufficient balance')
      // assert.ok(otherBalance >= fillerCost, 'Filler has insufficient balance')

      // await utils.approvals('matic')

      // console.log('Filling Zero X Order')
      // let trade = zeroXTrade.methods.trade(fillAmount, affiliateAddress, tradeGroupId, orders, signatures)
      // const amountRemaining = await trade.call({ from: otherAccount, gas: 2000000, value: web3.utils.toWei('.01') })
      // console.log(`Amount remaining from fill: ${amountRemaining}`)
      // assert.equal(amountRemaining, fillAmount - amount)
      // const tradeTx = await trade.send({ from: otherAccount, gas: 5000000, value: web3.utils.toWei('.01') })
      // const tradeReceipt = await utils.networks.matic.web3.eth.getTransactionReceipt(tradeTx.transactionHash)

      // const filledAmount = Math.min(amount, fillAmount)
      // assert.equal(
      //   await shareToken.methods.balanceOfMarketOutcome(marketAddress, 1, from).call(),
      //   filledAmount
      // )
      // assert.equal(
      //   await shareToken.methods.balanceOfMarketOutcome(marketAddress, 0, otherAccount).call(),
      //   filledAmount
      // )
      // // console.log(await cash.balanceOf(from).call(), fromBalance - filledAmount * price)
      // assert.equal(await cash.balanceOf(from).call(), fromBalance - filledAmount * price)
      // assert.equal(await cash.balanceOf(otherAccount).call(), otherBalance - filledAmount * (numTicks - price))

      // // sell shares
      // amount = 300, price = 70
      // const _orders = []; const _signatures = []
      // ;(
      //   { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder } = await utils.createOrder(
      //     { marketAddress, amount, price, currentTime, outcome: 1 /* Yes */, direction: 1 /* Ask */ },
      //     'matic',
      //     from
      //   )
      // )
      // _orders.push(orders[0])
      // _signatures.push(signatures[0])

      // // The following trade was created, however the filler was being censored, so they seek consolation from the predicate
      // const txObj = {
      //   gas: 5000000,
      //   gasPrice: 1,
      //   to: zeroXTrade.options.address,
      //   value: web3.utils.toWei('.01'),
      //   chainId: 15001,
      //   nonce: await utils.networks.matic.web3.eth.getTransactionCount(otherAccount),
      //   data: zeroXTrade.methods.trade(amount, affiliateAddress, tradeGroupId, _orders, _signatures).encodeABI()
      // }
      // // private key corresponding to 0xbd355a7e5a7adb23b51f54027e624bfe0e238df6
      // this.inFlightTrade = await utils.networks.matic.web3.eth.accounts.signTransaction(txObj, '0x48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712')
      // this.inFlightTrade = this.inFlightTrade.rawTransaction

      // // // 1. Initialize exit
      // await augurPredicate.methods.clearExit(otherAccount).send({ from: otherAccount, gas })
      // const { exitShareToken, exitCashToken } = await initializeExit(otherAccount)
      // const exitId = await augurPredicate.methods.getExitId(otherAccount).call()

      // // 2. Provide proof of self and counterparty share balance
      // let input = await this.statefulUtils.submitCheckpoint(rootChain, tradeReceipt.transactionHash, from)
      // // Proof of balance of counterparty having shares of outcome 1
      // console.log('// Proof of balance of counterparty having shares of outcome 1')
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
