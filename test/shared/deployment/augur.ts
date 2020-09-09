import { getDeployed, getAddress, createContract } from '../deployment/deployedContracts'
import { DAY, MAX_AMOUNT } from '../constants'
import { currentTime } from '../time'
import { ContractType, ContractName, ConnectedUniverse } from 'src/types'
import { connectedContract } from 'src/connectedContract'

import { Cash } from 'typechain/augur/Cash'
import { TestNetReputationToken } from 'typechain/augur/TestNetReputationToken'
import { Universe } from 'typechain/augur/Universe'
import { Market } from 'typechain/augur/Market'

export async function deployReasonableYesNoMarket(universe: ConnectedUniverse, endTime: number): Promise<string> {
  console.log('Getting market address')
  const marketAddress = await universe.from.callStatic.createYesNoMarket(endTime, 0, 0, universe.fromAddress, '')
  console.log(`Creating market at: ${marketAddress}`)
  await await universe.from.createYesNoMarket(endTime, 0, 0, universe.fromAddress, '')
  return marketAddress
}

export async function deployMarket(duration: number = DAY, contractType: ContractType): Promise<Market> {
  const universe = await connectedContract<Universe>(await getDeployed(ContractName.Universe, contractType), contractType)
  const repContract = await connectedContract<TestNetReputationToken>(await getDeployed(ContractName.TestNetReputationToken, contractType), contractType)
  await repContract.from.faucet(0)

  const cash = await connectedContract<Cash>(await getDeployed(ContractName.Cash, contractType), contractType)
  const validityBond = await universe.contract.callStatic.getOrCacheValidityBond()
  await cash.from.faucet(validityBond)
  await cash.from.approve(await getAddress(ContractName.Augur, contractType), MAX_AMOUNT)

  const endTime = currentTime() + duration
  const marketAddress = await deployReasonableYesNoMarket(universe, endTime)
  return createContract(marketAddress, ContractName.Market, contractType) as Market
}
