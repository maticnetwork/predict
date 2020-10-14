import { BigNumberish, BytesLike, constants, Wallet } from 'ethers'
import { Context } from 'mocha'
import { ContractName, ContractType } from 'src/types'
import { toBuffer, bufferToHex } from 'ethereumjs-util'
import { sign0x } from './utils'
import { NULL_ADDRESS } from './constants'
import { assertTokenBalances } from './assert'
import { getDeployed } from './deployedContracts'
import { MarketRegistry } from 'typechain/augur/MarketRegistry'
import { AugurRegistry } from 'typechain/augur/AugurRegistry'
import { SideChainFillOrder } from 'typechain/augur/SideChainFillOrder'

export interface OrderRequest {
  price: number;
  outcome: number;
  direction: number;
  currentTime: number;
  marketAddress: string;
  amount: number;
}

export interface Order {
  orders: {
    makerAddress: string;
    takerAddress: string;
    feeRecipientAddress: string;
    senderAddress: string;
    makerAssetAmount: BigNumberish;
    takerAssetAmount: BigNumberish;
    makerFee: BigNumberish;
    takerFee: BigNumberish;
    expirationTimeSeconds: BigNumberish;
    salt: BigNumberish;
    makerAssetData: BytesLike;
    takerAssetData: BytesLike;
    makerFeeAssetData: BytesLike;
    takerFeeAssetData: BytesLike;
  }[],
  signatures: string[],
  affiliateAddress: string
}

export async function createOrder(this: Context, request: OrderRequest, contractType: ContractType, from: Wallet, duration = 10000): Promise<Order> {
  // Zero X trading happens through the ZeroXTrade contract
  const { price, outcome, direction, currentTime, amount, marketAddress } = request
  // Get the on chain timestamp. We'll use this to calculate the order expiration and as the salt for the order
  const expirationTime = currentTime + duration
  // Make a call to our contract to properly format the signed order and get the hash for it that we must sign
  const { _zeroXOrder, _orderHash } = await this.maticZeroXTrade.contract.connect(from).createZeroXOrder(
    direction,
    amount,
    price,
    marketAddress,
    outcome,
    expirationTime,
    '1'
  )

  const fillOrder = await getDeployed(ContractName.SideChainFillOrder, 'augur-matic') as SideChainFillOrder
  const c = await fillOrder.storedContracts()
  console.log(c)

  // append signature type byte "3"
  // that is required by Augur's signature verification
  const signature = bufferToHex(
    Buffer.concat(
      [
        toBuffer(await sign0x(toBuffer(_orderHash), from)),
        toBuffer(3)
      ]
    )
  )

  const orders = [_zeroXOrder]
  const signatures = [signature]

  // No affiliate specified
  const affiliateAddress = constants.AddressZero

  return { orders, signatures, affiliateAddress }
}
