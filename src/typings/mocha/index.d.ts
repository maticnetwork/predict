import 'mocha'

import { RootChain } from 'typechain/core/RootChain'

import { 
  ConnectedAugurPredicate, 
  ConnectedOiCash, 
  ConnectedCash, 
  ConnectedAugur, 
  ConnectedTime, 
  ConnectedPredicateRegistry, 
  ConnectedZeroXTrade,
  ConnectedZeroXExchange,
  ConnectedShareToken,
  ConnectedWithdrawManager
} from '../../types'

import { CheckpointHelper } from '@maticnetwork/plasma-test-utils'

declare module 'mocha' {
  interface Context {
    rootChain: RootChain;
    cash: ConnectedCash;
    maticCash: ConnectedCash;
    augur: ConnectedAugur;
    maticAugur: ConnectedAugur;
    augurPredicate: ConnectedAugurPredicate;
    rootOICash: ConnectedOiCash;
    maticZeroXExchange: ConnectedZeroXExchange;
    maticZeroXTrade: ConnectedZeroXTrade;
    maticShareToken: ConnectedShareToken;
    shareToken: ConnectedShareToken;
    time: ConnectedTime;
    maticTime: ConnectedTime;
    checkpointHelper: CheckpointHelper;
    predicateRegistry: ConnectedPredicateRegistry;
    withdrawManager: ConnectedWithdrawManager;
    from: string;
    otherFrom: string;
  }
}
