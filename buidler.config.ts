import { BuidlerConfig, usePlugin } from '@nomiclabs/buidler/config'

import './tasks/typechain'
import './tasks/compile'
import './tasks/install'

usePlugin('@nomiclabs/buidler-ethers')
usePlugin('@nomiclabs/buidler-waffle')

const config: BuidlerConfig = {
  defaultNetwork: 'localhost',
  networks: {
    localhost: {
      url: 'http://127.0.0.1:9545'
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
