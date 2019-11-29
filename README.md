### Start Main chain
```
docker run -it -d -p 8545:8545 -p 8546:8546 augurproject/dev-node-geth:latest
```

or
```
ganache-cli --account '0xfae42052f82bed612a724fec3632f325f377120592c75bb78adfcceae6470c5a,1000000000000000000000000' --account '0x48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712,1000000000000000000000000' --gasLimit 10000000 --gasPrice 0
```

<!-- # Start Child chain -->
<!-- docker run -it -p 8545:8545 -p 8546:8546 augurproject/dev-node-geth:latest -->

### Deploy Child Contracts
```
cd child_augur/packages/augur-core
node -r ts-node/register source/deployment/compileContracts.ts
yarn deploy:local > ../../../output/child_deploy_output
```

### Run Script
```
Back in project home directory
node scripts/addressClipper.js
node scripts/zeroXTrade.js
```
