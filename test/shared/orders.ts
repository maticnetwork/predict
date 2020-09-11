import { signatureUtils } from '0x.js'
import { utils, constants, Wallet } from 'ethers'
import { deployMarket } from './deployment/augur'
import { Context } from 'mocha'
import { Market } from 'typechain/augur/Market'
import { ZeroXTrade } from 'typechain/augur/ZeroXTrade'
import { ZeroXExchange } from 'typechain/augur/ZeroXExchange'
import { ContractType, ContractName } from 'src/types'
import { getDeployed, getAddress } from 'src/deployedContracts'
import { toBuffer, bufferToHex } from 'ethereumjs-util'
import { EthWallets } from './wallets'
import { sign0x } from './utils'

export interface OrderRequest {
  price: number;
  outcome: number;
  direction: number;
  currentTime: number;
  marketAddress: string;
  amount: number;
}

export async function createOrder(this: Context, request: OrderRequest, contractType: ContractType, from: Wallet, duration: number = 10000) {
  // Zero X trading happens through the ZeroXTrade contract
  const { price, outcome, direction, currentTime, amount, marketAddress } = request
  // Get the on chain timestamp. We'll use this to calculate the order expiration and as the salt for the order
  const expirationTime = currentTime + duration
  // Make a call to our contract to properly format the signed order and get the hash for it that we must sign
  const zeroXTrade = await getDeployed<ZeroXTrade>(ContractName.ZeroXTrade, contractType)
  const zeroXExchange = await getDeployed<ZeroXExchange>(ContractName.ZeroXExchange, contractType)

  const { _zeroXOrder, _orderHash } = await zeroXTrade.connect(from).callStatic.createZeroXOrder(
    direction, 
    amount, 
    price, 
    marketAddress, 
    outcome, 
    constants.AddressZero, 
    expirationTime, 
    zeroXExchange.address, 
    currentTime
  )

  // append signature type byte that is required by Augur
  // const signature = await signatureUtils.ecSignHashAsync(from.provider, _orderHash, from.address)
  const signature = bufferToHex(
    Buffer.concat(
      [
        toBuffer(await sign0x(toBuffer(_orderHash), from)), 
        toBuffer(3)
      ]
    )
  )

  // Confirm the signature is valid
  const sigValid = await zeroXExchange.isValidSignature(_orderHash, from.address, signature)
  if (!sigValid) {
    throw new Error('Signature not valid')
  }

  const orders = [_zeroXOrder]
  const signatures = [signature]

  // No affiliate specified
  const affiliateAddress = constants.AddressZero

  return { orders, signatures, affiliateAddress, _zeroXOrder }
}
