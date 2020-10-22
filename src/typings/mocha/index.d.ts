import 'mocha'

import { RootChain } from 'typechain/core/RootChain'

import {
  ConnectedAugurPredicate,
  ConnectedOiCash,
  ConnectedMaticOiCash,
  ConnectedCash,
  ConnectedAugur,
  ConnectedTime,
  ConnectedPredicateRegistry,
  ConnectedZeroXExchange,
  ConnectedShareToken,
  ConnectedWithdrawManager
} from '../../types'

import { CheckpointHelper } from '@maticnetwork/plasma-test-utils'
import { ConnectedContract } from 'src/deployedContracts'
import { SideChainZeroXTrade } from 'typechain/augur/SideChainZeroXTrade'
import { TradingCash } from 'typechain/augur/TradingCash'
import { ChildChain } from 'typechain/core/ChildChain'
import { AugurRegistry } from 'typechain/augur/AugurRegistry'
import { SideChainShareToken } from 'typechain/augur/SideChainShareToken'
import { DepositManager } from 'typechain/core/DepositManager'

declare module 'mocha' {
  interface Context {
    rootChain: RootChain;
    cash: ConnectedCash;
    maticCash: ConnectedContract<TradingCash>;
    augur: ConnectedAugur;
    maticAugur: ConnectedAugur;
    augurPredicate: ConnectedAugurPredicate;
    oiCash: ConnectedOiCash;
    maticOICash: ConnectedMaticOiCash;
    maticZeroXExchange: ConnectedZeroXExchange;
    maticZeroXTrade: ConnectedContract<SideChainZeroXTrade>;
    maticShareToken: ConnectedContract<SideChainShareToken>;
    shareToken: ConnectedShareToken;
    time: ConnectedTime;
    maticTime: ConnectedTime;
    checkpointHelper: CheckpointHelper;
    predicateRegistry: ConnectedPredicateRegistry;
    withdrawManager: ConnectedWithdrawManager;
    depositManager: ConnectedContract<DepositManager>;
    childChain: ConnectedContract<ChildChain>;
    augurRegistry: ConnectedContract<AugurRegistry>;
    from: string;
    otherFrom: string;
  }
}
