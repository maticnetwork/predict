import { expect } from 'chai'
import { AUGUR_FEE, ASK_ORDER } from 'src/constants'
import { ContractName, Counterparty } from 'src/types'
import { Order } from 'src/orders'
import { assertTokenBalances } from 'src/assert'
import { BigNumber, BigNumberish, ContractReceipt } from 'ethers'
import { MarketInfo } from 'src/setup'
import { formatBytes32String, hexlify, hexValue } from 'ethers/lib/utils'
import { getDeployed } from 'src/deployedContracts'
import { SideChainFillOrder } from 'typechain/augur/SideChainFillOrder'
import { findEvents } from 'src/events'

export interface TradeReturnValues {
  tradeReceipt?: ContractReceipt;
}

export interface ExecuteOrderOptions {
  orderAmount: BigNumber;
  sharePrice: BigNumberish;
  tradeGroupId: string;
  orderCreator: Counterparty;
  orderFiller: Counterparty;
  direction: number;
  fillAmount: BigNumber;
  returnValues: TradeReturnValues;
  market: () => Promise<MarketInfo>;
  order: () => Promise<Order>
  expectedShares: {
    orderCreator: BigNumberish[],
    orderFiller: BigNumberish[]
  }
}

export function shouldExecuteTrade(options: ExecuteOrderOptions): void {
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
  const filledAmount = fillAmount.lt(orderAmount) ? fillAmount : orderAmount

  describe(`${orderFiller.name} fills ${direction === ASK_ORDER ? 'ask' : 'bid'} of ${orderCreator.name}`, function() {
    before('get market and order', async function() {
      market = await options.market.call(this)
      order = await options.order.call(this)
    })

    before('save balances', async function() {
      orderCreatorInitialBalance = await this.maticCash.contract.balanceOf(orderCreator.maticWallet.address)
      orderFillerInitialBalance = await this.maticCash.contract.balanceOf(orderFiller.maticWallet.address)
    })

    it('should trade', async function() {
      const { orders, signatures } = order
      const amountRemaining = await this.maticZeroXTrade
        .contract.connect(orderFiller.maticWallet)
        .callStatic.trade(fillAmount, formatBytes32String('11'), tradeGroupId, 0, 1, orders, signatures, { value: AUGUR_FEE })

      expect(amountRemaining).to.be.eq(fillAmount.sub(orderAmount))

      const tradeTx = await this.maticZeroXTrade
        .contract.connect(orderFiller.maticWallet)
        .trade(fillAmount, formatBytes32String('11'), tradeGroupId, 0, 1, orders, signatures, { value: AUGUR_FEE })

      returnValues.tradeReceipt = await tradeTx.wait(0)
    })

    it(`${orderCreator.name} must have correct market balance outcome`, async function() {
      await assertTokenBalances(this.maticShareToken.contract, market.address, orderCreator.maticWallet.address, expectedExitShares.orderCreator)
    })

    it(`${orderCreator.name} must have correct cash balance`, async function() {
      expect(
        await this.maticCash.contract.balanceOf(orderCreator.maticWallet.address)
      ).to.be.gte(orderCreatorInitialBalance.sub(filledAmount.mul(sharePrice)))
    })

    it(`${orderFiller.name} must have correct market balance outcome`, async function() {
      await assertTokenBalances(this.maticShareToken.contract, market.address, orderFiller.maticWallet.address, expectedExitShares.orderFiller)
    })

    it(`${orderFiller.name} must have correct cash balance`, async function() {
      expect(
        await this.maticCash.contract.balanceOf(orderFiller.maticWallet.address)
      ).to.be.gte(orderFillerInitialBalance.sub(filledAmount.mul(BigNumber.from(market.numTicks).sub(sharePrice))))
    })
  })
}
