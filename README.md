# Prediction Markets Plasma App

### A. Setup

* Install project deps
```
yarn
```
* Requires 3 components

**1. Matic plasma contracts**
```
git clone git@github.com:atvanguard/contracts.git matic
git checkout dev-augur
npm i
```

**2. Augur Predicate**
```
git clone git@github.com:atvanguard/augur.git predicate
cd predicate
git checkout dev-augur-exits # or the branch that you are developing on
yarn
yarn build # Builds the ts files in sub directories, required for compiling and deploying contracts
cd packages/augur-core
# Install dependencies by following instructions from the README in this directory
```

**3. Augur Ethereum / Matic contracts**
```
git clone git@github.com:atvanguard/augur.git
cd augur
git checkout c1788fd77b # Augur contracts locked at commit id c1788fd77b
yarn
yarn build
cd packages/augur-core
# Install dependencies by following instructions from the README in this directory
```

### B. Start Main chain
```
ganache-cli --account '0xfae42052f82bed612a724fec3632f325f377120592c75bb78adfcceae6470c5a,1000000000000000000000000' --account '0x48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712,1000000000000000000000000' --gasLimit 10000000 --gasPrice 0
```

### C. Start Child chain
```
ganache-cli --account '0xfae42052f82bed612a724fec3632f325f377120592c75bb78adfcceae6470c5a,1000000000000000000000000' --account '0x48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712,1000000000000000000000000' --gasLimit 10000000 --gasPrice 0 -p 8547
```

### D. Deploy Contracts
Back to home directory of the project for each of the following:

**1. Matic contracts**
```
cd matic
bash deploy-plasma.sh
```
**2. Main and Matic Augur**
```
cd augur/packages/augur-core
source venv/bin/activate
node -r ts-node/register source/deployment/compileContracts.ts
yarn deploy:local > ../../../output/deploy.main
yarn deploy:local:matic > ../../../output/deploy.matic
```

**3. Augur Predicate**
```
cd augur/packages/augur-core
source venv/bin/activate
node -r ts-node/register source/deployment/compileContracts.ts
yarn deploy:local > ../../../output/deploy.predicate
```

### E. Parse contract addresses
Back to home directory of the project
```
node utils/addressClipper.js deploy.main addresses.main.json
node utils/addressClipper.js deploy.matic addresses.matic.json
node utils/addressClipper.js deploy.predicate addresses.predicate.json
```

### F. Deploy helper contracts
Back to home directory of the project
```
yarn truffle compile
yarn truffle migrate --reset
```

### Run Tests
```
npm test
```
