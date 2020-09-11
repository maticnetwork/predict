import { getDeployed, getAddress, createContract, connectedContract } from 'src/deployedContracts'
import { DAY, MAX_AMOUNT } from '../../../src/constants'
import { ContractType, ContractName, ConnectedUniverse } from 'src/types'

import { Cash } from 'typechain/augur/Cash'
import { TestNetReputationToken } from 'typechain/augur/TestNetReputationToken'
import { Universe } from 'typechain/augur/Universe'
import { Market } from 'typechain/augur/Market'

export async function deployReasonableYesNoMarket(universe: ConnectedUniverse, endTime: number): Promise<string> {
  const marketAddress = await universe.from.callStatic.createYesNoMarket(endTime, 0, 0, universe.fromAddress, '')
  await universe.from.createYesNoMarket(endTime, 0, 0, universe.fromAddress, '')
  return marketAddress
}

export async function deployMarket(currentTime: number, contractType: ContractType, duration: number = DAY): Promise<Market> {
  const universe = await connectedContract<Universe>(ContractName.Universe, contractType)
  const repContract = await connectedContract<TestNetReputationToken>(ContractName.TestNetReputationToken, contractType)
  await repContract.from.faucet(0) // default amount

  const cash = await connectedContract<Cash>(ContractName.Cash, contractType)
  const validityBond = await universe.contract.callStatic.getOrCacheValidityBond()
  await cash.from.faucet(validityBond)

  await cash.from.approve(await getAddress(ContractName.Augur, contractType), MAX_AMOUNT)

  const endTime = currentTime + duration
  const marketAddress = await deployReasonableYesNoMarket(universe, endTime)
  return createContract<Market>(marketAddress, ContractName.Market, contractType)
}
