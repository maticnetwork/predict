import assert from 'assert'
import { buildReferenceTxPayload } from './test/helpers/checkpointUtils'
import * as utils from './test/helpers/utils'
import { deployAll } from './test/shared/deployment/deployer'
import { processExits, initializeExit } from './src/exits'
import { createMarket } from './src/setup'
import StatefulUtils from './test/helpers/StatefulUtils'

const { artifacts, web3, childWeb3, otherAccount, from, gas } = utils

let augurPredicate
let rootChain

function filterShareTokenBalanceChangedEvent(logs, account, market, outcome) {
  const indexes = []
  account = account.slice(2).toLowerCase()
  market = market.slice(2).toLowerCase()
  logs.filter((log, i) => {
    if (
      log.topics[0].toLowerCase() === '0x350ea32dc29530b9557420816d743c436f8397086f98c96292138edd69e01cb3' && // ShareTokenBalanceChanged
            log.topics[2].slice(26).toLowerCase() === account &&
            log.topics[3].slice(26).toLowerCase() === market &&
            web3.utils.toBN(log.data.slice(2, 66), 16).eq(web3.utils.toBN(outcome))
    ) {
      indexes.push(i)
      return true
    }
    return false
  })
  assert.equal(indexes.length, 1)
  return indexes[0]
}

async function assertTokenBalances(shareToken, market, account, balances) {
  for (let i = 0; i < balances.length; i++) {
    assert.equal(
      await shareToken.methods.balanceOfMarketOutcome(market, i, account).call(),
      balances[i]
    )
  }
}

contract('Predicate - claimShareBalance flow', function() {
  const amount = 100000

  before(async function() {
    await deployAll()

    augurPredicate = artifacts.predicate.AugurPredicate
    rootChain = utils.artifacts.plasma.RootChain

    this.statefulUtils = new StatefulUtils(web3, childWeb3, from, gas)
    this.cash = utils.artifacts.main.Cash
    this.maticCash = utils.artifacts.matic.Cash

    await Promise.all([
      this.cash.methods.joinBurn(from, await this.cash.methods.balanceOf(from).call()).send({ from, gas }),
      this.cash.methods.joinBurn(otherAccount, await this.cash.methods.balanceOf(otherAccount).call()).send({ from: otherAccount, gas }),
      this.maticCash.methods.joinBurn(from, await this.maticCash.methods.balanceOf(from).call()).send({ from, gas }),
      this.maticCash.methods.joinBurn(otherAccount, await this.maticCash.methods.balanceOf(otherAccount).call()).send({ from: otherAccount, gas })
    ])
  })

  it('deposit', async function() {
    // main chain cash (dai)
    const predicate = utils.artifacts.predicate.AugurPredicate
    await Promise.all([
      // need cash on the main chain to be able to deposit
      this.cash.methods.faucet(amount).send({ from, gas }),
      this.cash.methods.faucet(amount).send({ from: otherAccount, gas }),
      this.cash.methods.approve(predicate.options.address, amount).send({ from, gas }),
      this.cash.methods.approve(predicate.options.address, amount).send({ from: otherAccount, gas })
    ])

    const OICash = await utils.getOICashContract('main')
    this.rootOICash = OICash

    console.log('deposit', this.rootOICash.options.address)

    const beforeBalance = await OICash.methods.balanceOf(predicate.options.address).call()

    await Promise.all([
      predicate.methods.deposit(amount).send({ from, gas }),
      predicate.methods.deposit(amount).send({ from: otherAccount, gas })
    ])
    // deposit contract has OI cash balance for the 2 accounts
    assert.equal(
      await OICash.methods.balanceOf(predicate.options.address).call(),
      web3.utils.toBN(beforeBalance).add(web3.utils.toBN(amount).mul(web3.utils.toBN(2)))
    )
  })

  it('deposit on Matic', async function() {
    // This task is otherwise managed by Heimdall (our PoS layer)
    // mocking this step
    await Promise.all([
      this.maticCash.methods.faucet(amount).send({ from, gas }),
      this.maticCash.methods.faucet(amount).send({ from: otherAccount, gas })
    ])
    assert.equal(
      await this.maticCash.methods.balanceOf(from).call(),
      amount
    )
    assert.equal(
      await this.maticCash.methods.balanceOf(otherAccount).call(),
      amount
    )
  })

  it('trade', async function() {
    const { currentTime, numTicks, marketAddress, rootMarket } = await createMarket()

    this.rootMarket = rootMarket
    this.childMarketAddress = marketAddress

    const zeroXTrade = utils.artifacts.matic.ZeroXTrade
    const cash = utils.artifacts.matic.Cash.methods
    const shareToken = utils.artifacts.matic.ShareToken

    // do trades on child chain
    // Make an order for 1000 attoShares
    let amount = 1000; let price = 60
    let { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder } = await utils.createOrder(
      { marketAddress, amount, price, currentTime, outcome: 1 /* Yes */, direction: 0 /* Bid */ },
      'matic',
      from
    )
    const fillAmount = 1200

    const creatorCost = amount * price
    const fillerCost = fillAmount * (numTicks - price)
    const fromBalance = await cash.balanceOf(from).call()
    console.log('fromBalance', fromBalance)
    const otherBalance = await cash.balanceOf(otherAccount).call()
    assert.ok(fromBalance >= creatorCost, 'Creator has insufficient balance')
    assert.ok(otherBalance >= fillerCost, 'Filler has insufficient balance')

    await utils.approvals('matic')

    console.log('Filling Zero X Order', affiliateAddress)
    let trade = zeroXTrade.methods.trade(fillAmount, affiliateAddress, tradeGroupId, orders, signatures)
    const amountRemaining = await trade.call({ from: otherAccount, gas: 2000000, value: web3.utils.toWei('.01') })
    console.log(`Amount remaining from fill: ${amountRemaining}`)
    assert.equal(amountRemaining, fillAmount - amount)
    const tradeTx = await trade.send({ from: otherAccount, gas: 5000000, value: web3.utils.toWei('.01') })
    const tradeReceipt = await utils.networks.matic.web3.eth.getTransactionReceipt(tradeTx.transactionHash)

    const filledAmount = Math.min(amount, fillAmount)
    assert.equal(
      await shareToken.methods.balanceOfMarketOutcome(marketAddress, 1, from).call(),
      filledAmount
    )
    assert.equal(
      await shareToken.methods.balanceOfMarketOutcome(marketAddress, 0, otherAccount).call(),
      filledAmount
    )
    // console.log(await cash.balanceOf(from).call(), fromBalance - filledAmount * price)
    assert.equal(await cash.balanceOf(from).call(), fromBalance - filledAmount * price)
    assert.equal(await cash.balanceOf(otherAccount).call(), otherBalance - filledAmount * (numTicks - price))

    // sell shares
    amount = 300, price = 70
    const _orders = []; const _signatures = []
        ;(
      { orders, signatures, affiliateAddress, tradeGroupId, _zeroXOrder } = await utils.createOrder(
        { marketAddress, amount, price, currentTime, outcome: 1 /* Yes */, direction: 1 /* Ask */ },
        'matic',
        from
      )
    )
    _orders.push(orders[0])
    _signatures.push(signatures[0])

    // The following trade was created, however the filler was being censored, so they seek consolation from the predicate
    console.log('zeroXTrade.options.address', zeroXTrade.options.address)
    const txObj = {
      gas: 5000000,
      gasPrice: 1,
      to: zeroXTrade.options.address,
      value: web3.utils.toWei('.01'),
      chainId: 15001,
      nonce: await utils.networks.matic.web3.eth.getTransactionCount(otherAccount),
      data: zeroXTrade.methods.trade(amount, affiliateAddress, tradeGroupId, _orders, _signatures).encodeABI()
    }
    // private key corresponding to 0xbd355a7e5a7adb23b51f54027e624bfe0e238df6
    this.inFlightTrade = await utils.networks.matic.web3.eth.accounts.signTransaction(txObj, '0x48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712')
    this.inFlightTrade = this.inFlightTrade.rawTransaction

    // 1. Initialize exit
    await augurPredicate.methods.clearExit(otherAccount).send({ from: otherAccount, gas })
    const { exitShareToken, exitCashToken } = await initializeExit(otherAccount)
    console.log('exitShareToken.options.address', exitShareToken.options.address)
    console.log(await augurPredicate.methods.getExitId(otherAccount).call())





    
    // 2. Provide proof of self and counterparty share balance
    console.log('2. Provide proof of self and counterparty share balance')
    // let input = await checkpointUtils.checkpoint(tradeReceipt);
    const input = await this.statefulUtils.submitCheckpoint(rootChain, tradeReceipt.transactionHash, from)
    // Proof of balance of counterparty having shares of outcome 1
    input.logIndex = filterShareTokenBalanceChangedEvent(tradeReceipt.logs, from, marketAddress, 1)
    // console.log("checkpointUtils.buildReferenceTxPayload(input)", checkpointUtils.buildReferenceTxPayload(input))
    let claimShareBalance = await augurPredicate.methods.claimShareBalance(buildReferenceTxPayload(input)).send({ from: otherAccount, gas })
    assert.equal(
      await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 1, from).call(),
      filledAmount
    )

    // Proof of exitor's share balance of outcome 0
    console.log('Proof of exitor\'s share balance of outcome 0')
    input.logIndex = filterShareTokenBalanceChangedEvent(tradeReceipt.logs, otherAccount, marketAddress, 0)
    claimShareBalance = await augurPredicate.methods.claimShareBalance(buildReferenceTxPayload(input)).send({ from: otherAccount, gas })
    assert.equal(
      await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 0, otherAccount).call(),
      filledAmount
    )

    // @discuss Do we expect a counterparty to have "Invalid shares" as well - to go short on an outcome...?
    console.log('Do we expect a counterparty to have Invalid shares as well - to go short on an outcome...?')
    await augurPredicate.methods
      .claimShareBalanceFaucet(otherAccount, marketAddress, 2, filledAmount).send({ from: otherAccount, gas })

    // console.log(await artifacts.predicate.Common.methods.getAddressFromTx(this.inFlightTrade).call())
    console.log('executeInFlightTransaction', augurPredicate.options.address)
    trade = await augurPredicate.methods
      .executeInFlightTransaction(this.inFlightTrade)
      .send({ from: otherAccount, gas, value: web3.utils.toWei('.01') /* protocol fee */ })
    console.log('ZeroXTrade.shareToken', await utils.artifacts.predicate.ZeroXTrade.methods.shareToken().call())
    // assert that balances were reflected on chain
    console.log('assert that balances were reflected on chain')
    assert.equal(
      await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 1, from).call(),
      filledAmount - amount
    )
    assert.equal(
      await exitShareToken.methods.balanceOfMarketOutcome(rootMarket.options.address, 0, otherAccount).call(),
      filledAmount - amount
    )
    // assert.equal(await exitCashToken.methods.balanceOf(from).call(), 20790 /* 300 * 70 - fee */);
    // assert.equal(await exitCashToken.methods.balanceOf(otherAccount).call(), 8910 /* 300 * 30 - fee */);

    assert.ok(parseInt(await exitCashToken.methods.balanceOf(from).call()) > 20000)
    assert.ok(parseInt(await exitCashToken.methods.balanceOf(otherAccount).call()) > 8000)
    this.exitCashBalance = await exitCashToken.methods.balanceOf(otherAccount).call()
  })

  it('startExit (otherAccount)', async function() {
    // otherAccount is starting an exit for 700 shares of outcome 0 and 2 (balance from tests above)
    let startExit = await augurPredicate.methods.startExit().send({ from: otherAccount, gas })
    startExit = await web3.eth.getTransactionReceipt(startExit.transactionHash)
    const exitLog = startExit.logs[1]
    assert.equal(
      exitLog.topics[0],
      '0xaa5303fdad123ab5ecaefaf69137bf8632257839546d43a3b3dd148cc2879d6f' // ExitStarted
    )
    assert.equal(
      exitLog.topics[1].slice(26).toLowerCase(),
      otherAccount.slice(2).toLowerCase() // exitor
    )
  })

  it('onFinalizeExit (calls processExitForMarket)', async function() {
    const beforeOIBalancePredicate = await this.rootOICash.methods.balanceOf(augurPredicate.options.address).call()

    await processExits(this.rootOICash.options.address)
    // console.log(JSON.stringify(processExit, null, 2))

    await assertTokenBalances(artifacts.main.ShareToken, this.rootMarket.options.address, otherAccount, [700, 0, 700])
    await assertTokenBalances(artifacts.main.ShareToken, this.rootMarket.options.address, augurPredicate.options.address, [0, 700, 0])
    assert.equal(
      await this.rootOICash.methods.balanceOf(augurPredicate.options.address).call(),
      beforeOIBalancePredicate - this.exitCashBalance - (700 * 100) // predicate bought 700 complete sets
    )
  })

  it('startExit (for from) (uses claimShareBalanceFaucet)', async function() {
    await augurPredicate.methods.clearExit(from).send({ from, gas })
    const { exitShareToken, exitCashToken } = await initializeExit(from)
    await augurPredicate.methods
      .claimShareBalanceFaucet(from, this.childMarketAddress, 1, 700)
      .send({ from, gas })
    await assertTokenBalances(exitShareToken, this.rootMarket.options.address, from, [0, 700, 0])
    let startExit = await augurPredicate.methods.startExit().send({ from, gas })
    startExit = await web3.eth.getTransactionReceipt(startExit.transactionHash)
    const exitLog = startExit.logs[1]
    assert.equal(
      exitLog.topics[0],
      '0xaa5303fdad123ab5ecaefaf69137bf8632257839546d43a3b3dd148cc2879d6f' // ExitStarted
    )
    assert.equal(
      exitLog.topics[1].slice(26).toLowerCase(),
      from.slice(2).toLowerCase() // exitor
    )
  })

  it('onFinalizeExit (calls processExitForFinalizedMarket)', async function() {
    await utils.finalizeMarket(this.rootMarket)

    // Note that OICash balance for predicate will not be affected
    // Predicate will redeem the winning shares, have it deposited directly to OICash and then withdraw that OICash
    const beforeOIBalancePredicate = await this.rootOICash.methods.balanceOf(augurPredicate.options.address).call()
    const beforeCashBalance = await this.cash.methods.balanceOf(from).call()

    const processExit = await processExits(this.rootOICash.options.address)

    await assertTokenBalances(artifacts.main.ShareToken, this.rootMarket.options.address, augurPredicate.options.address, [0, 0, 0])
    await assertTokenBalances(artifacts.main.ShareToken, this.rootMarket.options.address, from, [0, 0, 0])
    assert.equal(
      await this.rootOICash.methods.balanceOf(augurPredicate.options.address).call(),
      beforeOIBalancePredicate
    )
    assert.equal(
      await this.cash.methods.balanceOf(from).call(),
      parseInt(beforeCashBalance, 10) + (700 * 100) - 7 // fee
    )
  })
})
