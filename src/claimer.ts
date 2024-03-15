import {Consensus__factory} from '../typechain'
import axios, {AxiosInstance} from 'axios'
import {Wallet, parseUnits} from 'ethers'
import {HttpsProxyAgent} from 'https-proxy-agent'
import {CONSENSUS_ENDPOINTS, ETHEREUM_DENCUN_ADDRESS, LINEA_DENCUN_ADDRESS, LISTING_IDS} from './utils/constants'
import {ClaimResp, IsEligibleResp} from './utils/types'
import {getBalance, sendTx, waitGasPrice} from './utils/web3Client'
import {c, defaultSleep, retry} from './utils/helpers'
import {maxGwei, retryCount} from '../config'

async function isEligible(signer: Wallet | any, network: 'ethereum' | 'linea', proxy: string | undefined = undefined): Promise<IsEligibleResp> {
    const address = network == 'ethereum' ? ETHEREUM_DENCUN_ADDRESS : LINEA_DENCUN_ADDRESS
    const DENCUN_NFT = Consensus__factory.connect(address, signer)
    if (network == 'ethereum') {
        return {
            isEligible: true,
            quantityAllowed: 1n,
            quantityClaimed: await DENCUN_NFT.balanceOf(signer.address, 1)
        }
    }
    let session: AxiosInstance
    if (proxy) {
        session = axios.create({
            httpAgent: new HttpsProxyAgent('http://' + proxy),
            httpsAgent: new HttpsProxyAgent('http://' + proxy),
            timeout: 5 * 1000
        })
    } else {
        session = axios.create({timeout: 5 * 1000})
    }
    let resp = await session.get(CONSENSUS_ENDPOINTS.isEligible, {
        params: {
            listingId: LISTING_IDS[network],
            ethAddress: signer.address
        }
    })
    const res: IsEligibleResp = resp.data
    res.quantityAllowed = BigInt(res.quantityAllowed)
    res.quantityClaimed = await DENCUN_NFT.balanceOf(signer.address, 1)
    return res
}

async function getSignature(signer: Wallet, network: 'ethereum' | 'linea', proxy: string | undefined = undefined): Promise<ClaimResp> {
    let session: AxiosInstance
    if (proxy) {
        session = axios.create({
            httpAgent: new HttpsProxyAgent('http://' + proxy),
            httpsAgent: new HttpsProxyAgent('http://' + proxy),
            timeout: 5 * 1000
        })
    } else {
        session = axios.create({timeout: 5 * 1000})
    }
    let resp = await session.post(
        CONSENSUS_ENDPOINTS.claim,
        {
            buyer: {
                eth_address: signer.address
            },
            listing_id: LISTING_IDS[network],
            provider: 'MINT_VOUCHER',
            quantity: 1
        },
        {}
    )
    return resp.data
}

async function claimNft(signer: Wallet, network: 'ethereum' | 'linea', proxy: string | undefined = undefined): Promise<string> {
    const address = network == 'ethereum' ? ETHEREUM_DENCUN_ADDRESS : LINEA_DENCUN_ADDRESS
    const DENCUN_NFT = Consensus__factory.connect(address, signer)
    let voucher = await getSignature(signer, network, proxy)
    let onchainVoucher = {
        netRecipient: voucher.data.voucher.net_recipient,
        initialRecipient: voucher.data.voucher.initial_recipient,
        initialRecipientAmount: voucher.data.voucher.initial_recipient_amount,
        tokenId: voucher.data.voucher.token_id,
        quantity: voucher.data.voucher.quantity,
        nonce: voucher.data.voucher.nonce,
        expiry: voucher.data.voucher.expiry,
        price: voucher.data.voucher.price,
        currency: voucher.data.voucher.currency
    }
    if (network == 'linea') {
        let lastNonce = await DENCUN_NFT.getLastNonce(signer.address)
        while (lastNonce >= BigInt(onchainVoucher.nonce)) {
            await defaultSleep(120, false)
            voucher = await getSignature(signer, network, proxy)
            onchainVoucher = {
                netRecipient: voucher.data.voucher.net_recipient,
                initialRecipient: voucher.data.voucher.initial_recipient,
                initialRecipientAmount: voucher.data.voucher.initial_recipient_amount,
                tokenId: voucher.data.voucher.token_id,
                quantity: voucher.data.voucher.quantity,
                nonce: voucher.data.voucher.nonce,
                expiry: voucher.data.voucher.expiry,
                price: voucher.data.voucher.price,
                currency: voucher.data.voucher.currency
            }
        }
    }
    let tx = {
        from: await signer.getAddress(),
        to: await DENCUN_NFT.getAddress(),
        data: DENCUN_NFT.interface.encodeFunctionData('mintWithVoucher', [onchainVoucher, voucher.data.signature]),
        value: 0n
    }
    const multipliers = network == 'ethereum' ? {price: 1.05, limit: 1.15} : {price: 1.15, limit: 1.15}
    return sendTx(signer, tx, multipliers)
}

async function checkAndClaim(id: number, signer: Wallet, network: 'ethereum' | 'linea', proxy: string | undefined = undefined, count = 0) {
    try {
        await waitGasPrice(signer, parseUnits(maxGwei[network], 'gwei'), network)
        let eligible = await isEligible(signer, network, proxy)
        if (eligible.isEligible && eligible.quantityClaimed < eligible.quantityAllowed) {
            console.log(c.blue(`[${id}] ${signer.address} eligible to mint ${c.underline(network)} NFT. Already minted: ${eligible.quantityClaimed}`))
            let res = await claimNft(signer, network, proxy)
            return res
        } else {
            console.log(c.yellow(`[${id}] ${signer.address} Not eligible to mint ${c.underline(network)} NFT`))
            return ''
        }
    } catch (e: any) {
        if (count > retryCount) {
            console.log(c.red(`[${id}] ${signer.address} could not mint nft on ${c.underline(network)} in ${count} tries`))
            return ''
        }
        console.log(e?.message)
        console.log(c.red(`[${id}] ${signer.address} could not mint nft on ${c.underline(network)} [${count + 1}]`))
        await defaultSleep(10, false)
        return checkAndClaim(id, signer, network, proxy, count++)
    }
}

export {checkAndClaim}
