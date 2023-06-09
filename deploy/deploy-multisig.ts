import { utils, Wallet, Provider, EIP712Signer, types } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Put the address of your AA factory
const AA_FACTORY_ADDRESS = "0x50BFb217F72A4e00a65040d64120002C7798A393";

export default async function (hre: HardhatRuntimeEnvironment) {
  // const provider = new Provider("http://localhost:3050/");
  const provider = new Provider("https://zksync2-testnet.zksync.dev");
  // Private key of the account used to deploy
  const wallet = new Wallet("").connect(provider);
  const factoryArtifact = await hre.artifacts.readArtifact("AAFactory");

  const aaFactory = new ethers.Contract(
    AA_FACTORY_ADDRESS,
    factoryArtifact.abi,
    wallet
  );

  // The two owners of the multisig
  const owner1 = Wallet.createRandom();
  // const owner2 = Wallet.createRandom();

  // For the simplicity of the tutorial, we will use zero hash as salt
  const salt = ethers.constants.HashZero;

  // deploy account owned by owner1 & owner2
  const tx = await aaFactory.deployAccount(
    salt,
    owner1.address
  );
  await tx.wait();

  // Getting the address of the deployed contract account
  const abiCoder = new ethers.utils.AbiCoder();
  const multisigAddress = utils.create2Address(
    AA_FACTORY_ADDRESS,
    await aaFactory.aaBytecodeHash(),
    salt,
    abiCoder.encode(["address"], [owner1.address])
  );
  console.log("Owner PK & Address:", owner1.privateKey, owner1.address)
  console.log(`Account deployed on address ${multisigAddress}`);

  // console.log("Sending funds to multisig account");
  // Send funds to the multisig account we just deployed
  // await (
  //   await wallet.sendTransaction({
  //     to: multisigAddress,
  //     // You can increase the amount of ETH sent to the multisig
  //     value: ethers.utils.parseEther("0.008"),
  //   })
  // ).wait();

  // let multisigBalance = await provider.getBalance(multisigAddress);

  // console.log(`Multisig account balance is ${multisigBalance.toString()}`);

  // Transaction to deploy a new account using the multisig we just deployed
  let aaTx = await aaFactory.populateTransaction.deployAccount(
    salt,
    // These are accounts that will own the newly deployed account
    Wallet.createRandom().address
  );

  const gasLimit = await provider.estimateGas(aaTx);
  const gasPrice = await provider.getGasPrice();

  aaTx = {
    ...aaTx,
    // deploy a new account using the multisig
    from: multisigAddress,
    gasLimit: gasLimit,
    gasPrice: gasPrice,
    chainId: (await provider.getNetwork()).chainId,
    nonce: await provider.getTransactionCount(multisigAddress),
    type: 113,
    customData: {
      gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
    } as types.Eip712Meta,
    value: ethers.BigNumber.from(0),
  };
  const signedTxHash = EIP712Signer.getSignedDigest(aaTx);

  // const signature = ethers.utils.concat([
  //   // Note, that `signMessage` wouldn't work here, since we don't want
  //   // the signed hash to be prefixed with `\x19Ethereum Signed Message:\n`
  //   ethers.utils.joinSignature(owner1._signingKey().signDigest(signedTxHash)),
  //   ethers.utils.joinSignature(owner2._signingKey().signDigest(signedTxHash)),
  // ]);

  aaTx.customData = {
    ...aaTx.customData,
    // customSignature: owner1._signingKey().signDigest(signedTxHash),
    customSignature: ethers.utils.arrayify(ethers.utils.joinSignature(owner1._signingKey().signDigest(signedTxHash)))
  };

  const aaTx2 = {
    ...aaTx,
    // deploy a new account using the multisig
    from: wallet.address,
    to: multisigAddress,
    gasLimit: gasLimit,
    gasPrice: gasPrice,
    chainId: (await provider.getNetwork()).chainId,
    nonce: await provider.getTransactionCount(multisigAddress),
    type: 113,
    customData: {
      gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
    } as types.Eip712Meta,
    value: ethers.BigNumber.from(0),
  };

  console.log(
    `The multisig's nonce before the first tx is ${await provider.getTransactionCount(
      multisigAddress
    )}`
  );
  
  await( await wallet.sendTransaction({
    to: multisigAddress,
    value: ethers.utils.parseEther('0.0002')
  })).wait()

  let multisigBalance = await provider.getBalance(multisigAddress);

  console.log("new account balance:", multisigBalance.toString())

  const sentTx = await provider.sendTransaction(utils.serialize(aaTx));
  await sentTx.wait();

  // Checking that the nonce for the account has increased
  console.log(
    `The multisig's nonce after the first tx is ${await provider.getTransactionCount(
      multisigAddress
    )}`
  );
  
  // multisigBalance = await provider.getBalance(multisigAddress);

  // console.log(`Multisig account balance is now ${multisigBalance.toString()}`);
}
