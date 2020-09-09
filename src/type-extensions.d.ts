import '@nomiclabs/buidler/types'

import { RootChain } from 'typechain/core/RootChain'

import { ConnectedAugurPredicate, ConnectedOiCash, ConnectedCash, ConnectedAugur, ConnectedTime, ConnectedPredicateRegistry } from './types'
import { CheckpointHelper } from '@maticnetwork/plasma-test-utils'

export interface TypechainConfig {
  outDir?: string;
  target?: 'ethers-v4' | 'ethers-v5' | 'truffle-v4' | 'truffle-v5' | 'web3-v1' | 'ethers';
}

export interface ArtifactPaths {
  core: string;
}

declare module '@nomiclabs/buidler/types' {
  interface BuidlerConfig {
    typechain: TypechainConfig;
    artifacts: ArtifactPaths;
  }

  interface ProjectPaths {
    augur: string;
    augurPredicate: string;
    core: string;
  }
}

declare module 'mocha' {
  export interface Context {
    rootChain: RootChain;
    cash: ConnectedCash;
    maticCash: ConnectedCash;
    augur: ConnectedAugur;
    maticAugur: ConnectedAugur;
    augurPredicate: ConnectedAugurPredicate;
    rootOICash: ConnectedOiCash;
    time: ConnectedTime;
    maticTime: ConnectedTime;
    checkpointHelper: CheckpointHelper;
    predicateRegistry: ConnectedPredicateRegistry;
    from: string;
    otherFrom: string;
  }
}
