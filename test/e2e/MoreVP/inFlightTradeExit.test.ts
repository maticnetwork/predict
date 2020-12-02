import { use } from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber, utils } from 'ethers'

import { EthWallets, MaticWallets } from 'src/wallets'

import { BID_ORDER, NO_OUTCOME, DEFAULT_RECOMMENDED_TRADE_INTERVAL, TRADE_GROUP_ID } from 'src/constants'
import { createOrder } from 'src/orders'
import { deployAndPrepareTrading, MarketInfo, createMarket } from 'src/setup'

import { shouldExecuteTrade, TradeReturnValues } from '../../behaviors/shouldExecuteTrade'
import { Context } from 'mocha'
import { scenario1 } from './inFlightTradeExit.scenario1'
import { scenario2 } from './inFlightTradeExit.scenario2'
import { deprecation } from './inFlightTradeExit.deprecation'
import { revertToSnapShot, takeSnapshot } from 'src/time'

use(solidity)

describe.only('AugurPredicate: In-flight trade exit', function() {
  const [alice, bob] = EthWallets
  const [aliceMatic, bobMatic] = MaticWallets

  const firstOrderAmount = BigNumber.from(1000).mul(DEFAULT_RECOMMENDED_TRADE_INTERVAL)
  const fillAmount = BigNumber.from(1200).mul(DEFAULT_RECOMMENDED_TRADE_INTERVAL)
  const firstOrderFilledAmount = firstOrderAmount

  let market: MarketInfo
  let self: Context

  const firstTradeResult: TradeReturnValues = { }

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
    orderFiller: { name: 'Bob', wallet:  bob, maticWallet: bobMatic },
    tradeGroupId: TRADE_GROUP_ID,
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

    // scenario1(()=>firstTradeResult, ()=>market, resetSnapshot)
    // scenario2(() => firstTradeResult, () => market, resetSnapshot)
    deprecation(() => firstTradeResult, () => market, resetSnapshot)
  })
})
