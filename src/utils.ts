import { BigNumberish, BytesLike, Signer, utils } from 'ethers'
import { Market } from 'typechain/augur/Market'
import { AugurRegistry } from 'typechain/augur/AugurRegistry'
import { ChildChain } from 'typechain/core/ChildChain'
import { getDeployed } from './deployedContracts'
import { ContractName } from './types'
import { ParaUniverse } from 'typechain/augur/ParaUniverse'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Web3EthAbi = require('web3-eth-abi')
let depositId = 1

export function parseFullSets(sets: number): number {
  return sets * 100
}

// 0x signed message has different order or r,v,s values
export async function sign0x(message: BytesLike, signer: Signer): Promise<Buffer> {
  const signature = await signer.signMessage(message)
  const sig = utils.splitSignature(signature)
  return Buffer.concat([
    utils.arrayify(sig.v),
    utils.arrayify(sig.r),
    utils.arrayify(sig.s)
  ])
}

export async function syncDeposit(childChain: ChildChain, user: string, token: string, amount: BigNumberish): Promise<void> {
  await childChain.onStateReceive(1,
    Web3EthAbi.encodeParameters([
      'address', 'address', 'uint256', 'uint256'
    ], [
      user, token, amount.toString(), depositId.toString()
    ]))

  depositId++
}

export async function syncMarketFinalized(augurRegistry: AugurRegistry, market: Market, payoutNumerators: BigNumberish[]): Promise<void> {
  const encodedMarketInfo = Web3EthAbi.encodeParameters([
    'address', 'bool', 'uint256[]'
  ], [
    market.address,
    await market.isFinalizedAsInvalid(),
    payoutNumerators
  ])

  await augurRegistry.onStateReceive(1,
    Web3EthAbi.encodeParameters([
      'uint256', 'bytes'
    ], [
      4, encodedMarketInfo
    ])
  )
}

export async function syncMarketInfo(augurRegistry: AugurRegistry, market: Market): Promise<void> {
  const encodedMarketInfo = Web3EthAbi.encodeParameters([
    'address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256'
  ], [
    await market.getUniverse(),
    market.address,
    await market.getOwner(),
    (await market.getEndTime()).toString(),
    (await market.getMarketCreatorSettlementFeeDivisor()).toString(),
    (await market.getNumTicks()).toString(),
    (await market.getNumberOfOutcomes()).toString(),
    (await market.affiliateFeeDivisor()).toString()
  ])

  await augurRegistry.onStateReceive(1,
    Web3EthAbi.encodeParameters([
      'uint256', 'bytes'
    ], [
      1, encodedMarketInfo
    ])
  )

  // sync reporting fee / universe
  const universe = await getDeployed(ContractName.ParaUniverse, 'augur-main') as ParaUniverse
  const encodedUniverse = Web3EthAbi.encodeParameters([
    'address', 'uint256'
  ], [
    await market.getUniverse(),
    (await universe.callStatic.getOrCacheReportingFeeDivisor()).toString()
  ])

  await augurRegistry.onStateReceive(1,
    Web3EthAbi.encodeParameters([
      'uint256', 'bytes'
    ], [
      2, encodedUniverse
    ])
  )
}
