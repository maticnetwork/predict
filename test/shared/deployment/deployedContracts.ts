import { Contract, Signer, providers } from 'ethers'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Universe } from 'typechain/augur/Universe'
import { ContractName, ContractType } from 'src/types'
import { getProvider } from 'src/providers'

export async function getAddress(contractName: ContractName, type: ContractType): Promise<string> {
  let contractAddress: string
  if (contractName === ContractName.OICash) {
    const universe = await getDeployed(ContractName.Universe, type) as Universe
    contractAddress = await universe.openInterestCash()
  } else if (contractName === ContractName.TestNetReputationToken) {
    const universe = await getDeployed(ContractName.Universe, type) as Universe
    contractAddress = await universe.getReputationToken()
  } else {
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

    case 'predicate':
      artifactPath = 'artifacts/predicate'
      break
  }

  const jsonFile = readFileSync(join(artifactPath, `${contractName}.json`)).toString()
  return JSON.parse(jsonFile).abi
}

export function createContract(address: string, contractName: ContractName, type: ContractType, signerOrProvider?: Signer | providers.Provider): Contract {
  return new Contract(address, getAbi(contractName, type), signerOrProvider)
}

export async function getDeployed(contractName: ContractName, type: ContractType, connectTo?: Signer): Promise<Contract> {
  const contractAddress = await getAddress(contractName, type)
  return createContract(contractAddress, contractName, type, connectTo || getProvider(type))
}
