import { getAddress, createContract, connectedContract } from 'src/deployedContracts'
import { DEFAULT_MARKET_DURATION, MAX_AMOUNT, NULL_ADDRESS } from './constants'
import { ContractType, ContractName, ConnectedUniverse } from 'src/types'

import { Cash } from 'typechain/augur/Cash'
import { TestNetReputationToken } from 'typechain/augur/TestNetReputationToken'
import { Universe } from 'typechain/augur/Universe'
import { Market } from 'typechain/augur/Market'
import { ParaUniverse } from 'typechain/augur/ParaUniverse'

export async function deployReasonableYesNoMarket(universe: ConnectedUniverse, endTime: number): Promise<string> {
  console.log(5)
  const marketAddress = await universe.from.callStatic.createYesNoMarket(endTime, 0, NULL_ADDRESS, 0, universe.fromAddress, '')
  console.log(6)
  await universe.from.createYesNoMarket(endTime, 0, NULL_ADDRESS, 0, universe.fromAddress, '')
  return marketAddress
}

export async function deployMarket(currentTime: number, contractType: ContractType, duration: number = DEFAULT_MARKET_DURATION): Promise<Market> {
  const universe = await connectedContract<ParaUniverse>(ContractName.ParaUniverse, contractType)
  const originUniverse = await connectedContract<Universe>(ContractName.Universe, contractType)
  const repContract = await connectedContract<TestNetReputationToken>(ContractName.TestNetReputationToken, contractType)

  const bond = await universe.contract.callStatic.getOrCacheMarketRepBond()
  await repContract.from.faucet(bond) // default amount

  const cash = await connectedContract<Cash>(ContractName.Cash, contractType)
  const validityBond = await universe.contract.callStatic.getOrCacheValidityBond()

  await cash.from.faucet(validityBond)
  await cash.from.approve(await getAddress(ContractName.Augur, contractType), MAX_AMOUNT)

  const endTime = currentTime + duration
  const marketAddress = await deployReasonableYesNoMarket(originUniverse, endTime)
  return createContract<Market>(marketAddress, ContractName.Market, contractType)
}
