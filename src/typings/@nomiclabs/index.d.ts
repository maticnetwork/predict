import '@nomiclabs/buidler/types'

export interface TypechainConfig {
  outDir?: string;
  target?: 'ethers-v4' | 'ethers-v5' | 'truffle-v4' | 'truffle-v5' | 'web3-v1' | 'ethers';
}

export interface ArtifactPaths {
  core: string;
}

/// <reference types="@nomiclabs/buidler/types" />
/// <reference types="@nomiclabs/buidler-ethers/src/type-extensions" />
/// <reference types="@nomiclabs/buidler-waffle/src/type-extensions" />

declare module '@nomiclabs/buidler/types' {
  export interface BuidlerConfig {
    typechain: TypechainConfig;
    artifacts: ArtifactPaths;
  }

  export interface BuidlerNetworkConfig {
    networkId: number;
  }

  export interface ProjectPaths {
    augur: string;
    augurPredicate: string;
    core: string;
  }
}


