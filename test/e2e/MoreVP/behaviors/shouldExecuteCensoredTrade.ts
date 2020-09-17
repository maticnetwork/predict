import { expect } from 'chai'
import { AUGUR_FEE, MATIC_CHAIN_ID, ASK_ORDER, DEFAULT_GAS } from 'src/constants'
import { Counterparty } from 'src/types'
import { assertTokenBalances } from 'src/assert'
import { createOrder, Order } from 'src/orders'
import { BigNumber } from "ethers"
import { MarketInfo } from 'src/setup'
import { Cash } from 'typechain/augur/Cash'
import { ShareToken } from 'typechain/augur/ShareToken'

export interface ExecuteCensoredOrderOptions {
  orderAmount: number;
  sharePrice: number;
  tradeGroupId: string;
  outcome: number;
  direction: number;
  orderCreator: Counterparty;
  orderFiller: Counterparty;
  exitCash: () => Promise<Cash>;
  exitShare: () => Promise<ShareToken>;
  market: () => Promise<MarketInfo>;
  order: () => Promise<Order>;
  expectedExitShares: {
    orderCreator: number[],
    orderFiller: number[]
  }
}

export function shouldExecuteCensoredTrade(options: ExecuteCensoredOrderOptions) {
  const {
    orderAmount,
    sharePrice,
    orderCreator,
    orderFiller,
    tradeGroupId,
    outcome,
    direction,
    expectedExitShares
  } = options

  let exitCash: Cash;
  let exitShare: ShareToken;
  let inFlightTrade: string
  let market: MarketInfo
  let fillerExitCashBalanceBeforeTrade: BigNumber
  let order: Order

  describe(`when ${orderFiller.name} executes censored ${direction == ASK_ORDER ? 'ask' : 'bid'} trade`, function() {
    before(`${orderCreator.name} creates order and Bob signs the transaction`, async function() {
      market = await options.market.call(this)
      exitCash = await options.exitCash.call(this)
      exitShare = await options.exitShare.call(this)
      order = await options.order.call(this)
  
      const { affiliateAddress, orders, signatures } = order
  
      const txObj = {
        gasLimit: DEFAULT_GAS,
        gasPrice: 0,
        to: this.maticZeroXTrade.contract.address,
        value: AUGUR_FEE,
        chainId: MATIC_CHAIN_ID,
        nonce: await orderFiller.wallet.getTransactionCount(),
        data: this.maticZeroXTrade.contract.interface.encodeFunctionData('trade', [orderAmount, affiliateAddress, tradeGroupId, orders, signatures])
      }
  
      inFlightTrade = await orderFiller.wallet.signTransaction(txObj)
      fillerExitCashBalanceBeforeTrade = await exitCash.balanceOf(orderFiller.wallet.address)
    })

    it('should execute in-flight transaction in augur predicate', async function() {
      await this.augurPredicate.other.executeInFlightTransaction(inFlightTrade, { value: AUGUR_FEE })
    })

    it(`${orderCreator.name} should have correct market exit shares balance outcome`, async function() {
      await assertTokenBalances(exitShare, market.rootMarket.address, orderCreator.wallet.address, expectedExitShares.orderCreator)
    })

    it(`${orderCreator.name} should have correct exit cash balance`, async function() {
      expect(
        await exitCash.balanceOf(orderCreator.wallet.address)
      ).to.be.gt(20000)
    })

    it(`${orderFiller.name} should have correct market exit shares balance outcome`, async function() {
      await assertTokenBalances(exitShare, market.rootMarket.address, orderFiller.wallet.address, expectedExitShares.orderFiller)
    })

    it(`${orderFiller.name} should have correct exit cash balance`, async function() {
      expect(
        await exitCash.balanceOf(orderFiller.wallet.address)
      ).to.be.eq(fillerExitCashBalanceBeforeTrade.sub(orderAmount * sharePrice))
    })
  })
}
