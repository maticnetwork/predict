import { use, expect } from 'chai'
import { solidity } from 'ethereum-waffle'
import { BigNumber, ContractReceipt } from 'ethers'

import { ContractName } from 'src/types'
import { EthWallets, MaticWallets } from 'src/wallets'

import { DEFAULT_TRADE_GROUP, BID_ORDER, ASK_ORDER, VALIDATORS } from 'src/constants'
import { createOrder, Order } from 'src/orders'
import { buildReferenceTxPayload, ExitPayload } from '@maticnetwork/plasma'
import { deployAndPrepareTrading, approveAllForCashAndShareTokens, initializeAugurPredicateExit, MarketInfo } from 'src/setup'
import { createMarket } from 'src/setup'
import { indexOfEvent } from 'src/events'
import { assertTokenBalances } from 'src/assert'
import { processExits } from 'src/exits'

import { ShareToken } from 'typechain/augur/ShareToken'
import { Cash } from 'typechain/augur/Cash'
import { shouldExecuteTrade, TradeReturnValues } from './behaviors/shouldExecuteTrade'
import { Context } from 'mocha'
import { shouldExecuteCensoredTrade } from './behaviors/shouldExecuteCensoredTrade'

use(solidity)

describe('Exit with burnt shares', function() {
  before(deployAndPrepareTrading)
  before('Prepare trading', async function() {
    market = await createMarket.call(this)

    await approveAllForCashAndShareTokens('augur-matic')
  })
})
