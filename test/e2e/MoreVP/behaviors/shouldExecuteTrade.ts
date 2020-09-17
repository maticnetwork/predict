import { expect } from 'chai'
import { AUGUR_FEE, ASK_ORDER } from 'src/constants'
import { Counterparty } from 'src/types'
import { createOrder, Order } from 'src/orders'
import { assertTokenBalances } from 'src/assert'
import { BigNumber, ContractReceipt } from "ethers"
import { MarketInfo } from 'src/setup'

export interface TradeReturnValues {
  tradeReceipt?: ContractReceipt;
}

export interface ExecuteOrderOptions {
  orderAmount: number;
  sharePrice: number;
  tradeGroupId: string;
  orderCreator: Counterparty;
  orderFiller: Counterparty;
  direction: number;
  fillAmount: number;
  returnValues: TradeReturnValues;
  market: () => Promise<MarketInfo>;
  order: () => Promise<Order>
  expectedShares: {
    orderCreator: number[],
    orderFiller: number[]
  }
}

export function shouldExecuteTrade(options: ExecuteOrderOptions) {
  const {
    orderAmount,
    sharePrice,
    fillAmount,
    tradeGroupId,
    orderCreator,
    orderFiller,
    returnValues,
    direction,
    expectedShares: expectedExitShares
  } = options

  let orderCreatorInitialBalance: BigNumber
  let orderFillerInitialBalance: BigNumber
  let market: MarketInfo
  let order: Order
  const filledAmount = Math.min(fillAmount, orderAmount)

  describe(`${orderFiller.name} fills ${direction == ASK_ORDER ? 'ask' : 'bid'} of ${orderCreator.name}`, function() {
    before(async function() {
      market = await options.market.call(this)
      order = await options.order.call(this)
    })

    before(async function() {
      orderCreatorInitialBalance = await this.maticCash.contract.balanceOf(orderCreator.wallet.address)
      orderFillerInitialBalance = await this.maticCash.contract.balanceOf(orderFiller.wallet.address)
    })

    it('should trade', async function() {
      const { affiliateAddress, orders, signatures } = order
      let amountRemaining = await this.maticZeroXTrade
        .contract.connect(orderFiller.wallet)
        .callStatic.trade(fillAmount, affiliateAddress, tradeGroupId, orders, signatures, { value: AUGUR_FEE })

      expect(amountRemaining).to.be.equal(fillAmount - orderAmount)

      const tradeTx = await this.maticZeroXTrade
        .contract.connect(orderFiller.wallet)
        .trade(fillAmount, affiliateAddress, tradeGroupId, orders, signatures, { value: AUGUR_FEE })

      returnValues.tradeReceipt = await tradeTx.wait(0)
    })

    it(`${orderCreator.name} must have correct market balance outcome`, async function() {
      await assertTokenBalances(this.maticShareToken.contract, market.address, orderCreator.wallet.address, expectedExitShares.orderCreator)
    })

    it(`${orderCreator.name} must have correct cash balance`, async function() {
      expect(
        await this.maticCash.contract.balanceOf(orderCreator.wallet.address)
      ).to.be.equal(orderCreatorInitialBalance.sub(filledAmount * sharePrice))
    })

    it(`${orderFiller.name} must have correct market balance outcome`, async function() {
      await assertTokenBalances(this.maticShareToken.contract, market.address, orderFiller.wallet.address, expectedExitShares.orderFiller)
    })

    it(`${orderFiller.name} must have correct cash balance`, async function() {
      expect(
        await this.maticCash.contract.balanceOf(orderFiller.wallet.address)
      ).to.be.equal(orderFillerInitialBalance.sub(filledAmount * (market.numTicks - sharePrice)))
    })
  })
}
