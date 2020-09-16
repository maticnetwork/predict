import { BuidlerConfig } from '@nomiclabs/buidler/config'
import { parseEther } from 'ethers/lib/utils'

import './tasks/typechain'
import './tasks/compile'
import './tasks/install'

const config: BuidlerConfig = {
  networks: {
    buidlerevm: {
      gasPrice: 0,
      gas: 10000000,
      blockGasLimit: 10000000,
      accounts: [
        { privateKey: '0xfae42052f82bed612a724fec3632f325f377120592c75bb78adfcceae6470c5a', balance: parseEther('10000').toString() },
        { privateKey: '0x48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712', balance: parseEther('10000').toString() }
      ],
      chainId: 15001,
      networkId: 15001
    }
  },
  mocha: {
    timeout: 0,
    fullStackTrace: true,
    color: true,
    fullTrace: true
  },
  paths: {
    artifacts: './artifacts',
    cache: './cache',
    root: './',
    sources: './contracts',
    tests: './test',
    augur: './artifacts/augur',
    augurPredicate: './artifacts/predicate',
    core: './artifacts/core'
  },
  solc: {
    version: '0.5.17'
  },
  artifacts: {
    core: 'core-contracts/build/contracts'
  },
  typechain: {
    outDir: 'typechain',
    target: 'ethers-v5'
  }
}

export default config
