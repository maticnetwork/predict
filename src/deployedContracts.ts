import { Contract, Signer } from 'ethers'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ParaUniverse } from 'typechain/augur/ParaUniverse'
import { Universe } from 'typechain/augur/Universe'
import { ContractName, ContractType } from 'src/types'
import { getProvider } from 'src/providers'

export async function getAddress(contractName: ContractName, type: ContractType): Promise<string> {
  let contractAddress = ''
  if (contractName === ContractName.OICash) {
    if (type === 'augur-main') {
      const universe = await getDeployed(ContractName.ParaUniverse, type) as ParaUniverse
      contractAddress = await universe.openInterestCash()
    } else {
      const universe = await getDeployed(ContractName.Universe, type) as Universe
      contractAddress = await universe.openInterestCash()
    }
  } else if (contractName === ContractName.TestNetReputationToken) {
    if (type === 'augur-main') {
      const universe = await getDeployed(ContractName.ParaUniverse, type) as ParaUniverse
      contractAddress = await universe.getReputationToken()
    } else {
      const universe = await getDeployed(ContractName.Universe, type) as Universe
      contractAddress = await universe.getReputationToken()
    }
  } else if (contractName === ContractName.Universe) {
    if (type === 'augur-main') {
      const universe = await getDeployed(ContractName.ParaUniverse, type) as ParaUniverse
      contractAddress = await universe.originUniverse()
    }
  }

  if (!contractAddress) {
    const addresses = JSON.parse(readFileSync(`output/addresses.${type}.json`).toString())
    contractAddress = addresses[contractName]
  }

  return contractAddress
}

export function getAbi(contractName: ContractName, type: ContractType): any {
  let artifactPath = 'artifacts'

  switch (type) {
    case 'matic':
    case 'plasma':
      artifactPath = 'artifacts/core'
      break

    case 'augur-main':
    case 'augur-matic':
      artifactPath = 'artifacts/augur'
      break
  }

  // dirty hack, swap to Cash abi in case of DAI
  if (contractName === ContractName.DAI) {
    contractName = ContractName.Cash
  }

  const jsonFile = readFileSync(join(artifactPath, `${contractName}.json`)).toString()
  return JSON.parse(jsonFile).abi
}

export function createContract<T extends Contract>(address: string, contractName: ContractName, type: ContractType, connectTo?: Signer): T {
  const contract = new Contract(address, getAbi(contractName, type), connectTo || getProvider(type))
  contract.type = type
  return contract as T
}

export async function getDeployed<T extends Contract>(contractName: ContractName, type: ContractType, connectTo?: Signer): Promise<T> {
  const contractAddress = await getAddress(contractName, type)
  return createContract<T>(contractAddress, contractName, type, connectTo)
}

export interface ConnectedContract<T extends Contract> {
  contract: T;
  from: T;
  other: T;
  fromAddress: string;
  otherAddress: string;
  address: string;
}

export async function connectedContract<T extends Contract>(contractName: ContractName, type: ContractType): Promise<ConnectedContract<T>> {
  const contract = await getDeployed(contractName, type)
  const provider = getProvider(contract.type)
  return {
    contract: contract as T,
    from: contract.connect(provider.getSigner(0)) as T,
    other: contract.connect(provider.getSigner(1)) as T,
    fromAddress: await provider.getSigner(0).getAddress(),
    otherAddress: await provider.getSigner(1).getAddress(),
    address: contract.address
  }
}
