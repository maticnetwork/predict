import { expect } from 'chai'
import { AUGUR_FEE, MATIC_CHAIN_ID, ASK_ORDER, DEFAULT_GAS, MAX_FEE, BID_ORDER } from 'src/constants'
import { Counterparty } from 'src/types'
import { assertTokenBalances } from 'src/assert'
import { Order } from 'src/orders'
import { BigNumber, BigNumberish } from 'ethers'
import { MarketInfo } from 'src/setup'
import { Cash } from 'typechain/augur/Cash'
import { ShareToken } from 'typechain/augur/ShareToken'

export interface ExecuteCensoredOrderOptions {
  orderAmount: number;
  tradeGroupId: string;
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
  },
  expectedCashDelta: {
    orderCreator: BigNumberish,
    orderFiller: BigNumberish
  }
}

export function shouldExecuteCensoredTrade(options: ExecuteCensoredOrderOptions): void {
  const {
    orderAmount,
    orderCreator,
    orderFiller,
    tradeGroupId,
    direction,
    expectedExitShares,
    expectedCashDelta
  } = options

  let exitCash: Cash
  let exitShare: ShareToken
  let inFlightTrade: string
  let market: MarketInfo
  let fillerExitCashBalanceBeforeTrade: BigNumber
  let creatorExitCashBalanceBeforeTrade: BigNumber
  let order: Order

  describe(`when ${orderFiller.name} executes censored ${direction === ASK_ORDER ? 'ask' : 'bid'} trade`, function() {
    before(`${orderCreator.name} creates order and Bob signs the transaction`, async function() {
      market = await options.market.call(this)
      exitCash = await options.exitCash.call(this)
      exitShare = await options.exitShare.call(this)
      order = await options.order.call(this)

      const { orders, signatures } = order

      const txObj = {
        gasLimit: DEFAULT_GAS,
        gasPrice: 0,
        to: this.maticZeroXTrade.contract.address,
        value: AUGUR_FEE,
        chainId: MATIC_CHAIN_ID,
        nonce: await orderFiller.wallet.getTransactionCount(),
        data: this.maticZeroXTrade.contract.interface.encodeFunctionData('trade', [orderAmount, '0x0', tradeGroupId, 0, 100, orders, signatures])
      }

      inFlightTrade = await orderFiller.wallet.signTransaction(txObj)
      creatorExitCashBalanceBeforeTrade = await exitCash.balanceOf(orderCreator.wallet.address)
      fillerExitCashBalanceBeforeTrade = await exitCash.balanceOf(orderFiller.wallet.address)
    })

    it('should execute in-flight transaction in augur predicate', async function() {
      await this.augurPredicate.other.executeInFlightTransaction(inFlightTrade, { value: AUGUR_FEE })
    })

    it(`${orderCreator.name} should have correct market exit shares balance outcome`, async function() {
      await assertTokenBalances(exitShare, market.address, orderCreator.wallet.address, expectedExitShares.orderCreator)
    })

    it(`${orderCreator.name} should have correct exit cash balance`, async function() {
      expect(
        await exitCash.balanceOf(orderCreator.wallet.address)
      ).to.be.gte(creatorExitCashBalanceBeforeTrade.add(expectedCashDelta.orderCreator))
    })

    it(`${orderFiller.name} should have correct market exit shares balance outcome`, async function() {
      await assertTokenBalances(exitShare, market.address, orderFiller.wallet.address, expectedExitShares.orderFiller)
    })

    it(`${orderFiller.name} should have correct exit cash balance`, async function() {
      expect(
        await exitCash.balanceOf(orderFiller.wallet.address)
      ).to.be.gte(fillerExitCashBalanceBeforeTrade.add(expectedCashDelta.orderFiller))
    })
  })
}
