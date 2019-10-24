# Plasma Prediction App

## Run Augur
```
git clone https://github.com/AugurProject/augur.git
nvm use 10
yarn
yarn docker:geth:pop-normal-time
(networkId 103 and 1s block times)
```
Pick deployed contract addresses from [here](https://github.com/AugurProject/augur/blob/master/packages/augur-artifacts/src/addresses.json); abis [here](https://github.com/AugurProject/augur/blob/master/packages/augur-artifacts/src/abi.json).

## Deploy Augur contracts
```
cd packages/augur-core
yarn
cd ../..
yarn build:watch

cd packages/augur-core
yarn deploy:local > deployedAddresses
cp deployedAddresses <>/predict/scripts/deployedAddresses
cd <>/predict/scripts
node addressClipper.js
```

Working with augur repo at `85502cc411a4d5d4161fc619ec7e83dc17f61c49`
